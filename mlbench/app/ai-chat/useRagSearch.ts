"use client";

import type React from "react";
import { embedQuery, type RoutePlan } from "@/lib/ai/agent";
import { routerDebugGroup, routerDebugLog } from "@/lib/routerDebug";
import {
  buildSummaryLines,
  rerankHitsWithLocalModel,
  sortHitsByDistance,
  summarizeHitsWithLocalModel,
} from "./ragHelpers";
import { synthesizeRagAnswer } from "@/lib/ai/chains";
import type { ChatMessage, VectorSearchHit, VectorSearchResponse } from "./types";

export function useRagSearch(opts: {
  newId: () => string;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  upsertMessage: (id: string, next: Partial<ChatMessage>) => void;
  addTurnToMemory: (t: { role: "user" | "assistant"; content: string }) => void;
  recordRagMemory: (entry: {
    query: string;
    hits: Array<{
      id: string;
      title: string;
      year?: number | null;
      abstract?: string;
      distance?: number | null;
    }>;
    embedding?: number[];
    createdAt: number;
  }) => void;
}) {
  const { newId, setMessages, upsertMessage, addTurnToMemory, recordRagMemory } = opts;

  async function runRagSearch(args: {
    prompt: string;
    plan: RoutePlan;
    preparingSearchToken: string;
    vectorSearchingToken: string;
    pendingId?: string;
  }) {
    const { prompt, plan, preparingSearchToken, vectorSearchingToken } = args;

    // Reuse the caller-provided pending assistant bubble when available (better UX: no gap).
    const pendingId = args.pendingId ?? newId();
    if (args.pendingId) {
      upsertMessage(pendingId, { content: preparingSearchToken, ragHits: undefined });
    } else {
      setMessages((m) => [...m, { id: pendingId, role: "assistant", content: preparingSearchToken }]);
    }
    // Let the UI paint "Preparing search…" before starting slow embed (two-stage UX).
    await new Promise((r) => setTimeout(r, 80));

    let reply = "";
    let embedding: number[] | null = null;
    try {
      const searchQuery = (plan.constraints?.domain || prompt).toString();

      const tEmbedStart = performance.now();
      embedding = await embedQuery(searchQuery);
      const tEmbedMs = performance.now() - tEmbedStart;
      if (typeof console !== "undefined" && console.log) {
        console.log("[RAG timing] B. Generate embedding:", Math.round(tEmbedMs), "ms");
      }

      // Now we're actually searching; show "Searching papers".
      upsertMessage(pendingId, { content: vectorSearchingToken });
      await new Promise((r) => setTimeout(r, 50));
      routerDebugGroup("[router] stage2 RAG_SEARCH", () => {
        routerDebugLog("searchQuery:", searchQuery);
        routerDebugLog("secondary:", plan.secondary);
        routerDebugLog("constraints:", plan.constraints ?? null);
      });

      const tVectorStart = performance.now();
      const url = new URL(`${window.location.origin}/api/backend/search/vector`);
      const requestedCount1 = typeof plan.constraints?.count === "number" ? plan.constraints?.count : null;
      const wantCount = requestedCount1 && requestedCount1 > 0 ? Math.min(20, requestedCount1) : 5;
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ embedding, limit: Math.max(20, wantCount) }),
        cache: "no-store",
      });
      const tVectorMs = performance.now() - tVectorStart;
      if (typeof console !== "undefined" && console.log) {
        console.log("[RAG timing] C. Vector search:", Math.round(tVectorMs), "ms");
      }

      if (!res.ok) {
        // Never surface backend errors in the chat bubble. Backend logs contain details.
        throw new Error("VECTOR_SEARCH_FAILED");
      }

      const data = (await res.json()) as VectorSearchResponse;
      const hits = (data.items || []).slice(0, 20);
      // Ensure deterministic ordering from the backend response.
      const distanceSorted = sortHitsByDistance(hits);
      if (hits.length === 0) {
        reply = "I couldn't find any relevant papers for that query. Try rephrasing with a more specific topic.";
      } else {
        reply = "Here are the most relevant papers I found:";
      }

      // Stage-2 screening / rerank: let the LLM pick the best 5 from the embedding candidates.
      // If this fails, fall back to vector distance order.
      let picked: VectorSearchHit[] = distanceSorted;
      try {
        const wantsRecent = plan.constraints?.recency === "recent" || /\brecent\b|\blatest\b|\bnewest\b|\b202\d\b/i.test(prompt);
        picked = await rerankHitsWithLocalModel({ prompt, hits: distanceSorted, wantsRecent });
      } catch {
        // ignore rerank failures; keep fallback
      }

      const requestedCount2 = typeof plan.constraints?.count === "number" ? plan.constraints?.count : null;
      const k = requestedCount2 && requestedCount2 > 0 ? Math.min(10, requestedCount2) : 5;
      const topHits = picked.slice(0, k);
      const displayHits = sortHitsByDistance(topHits);

      if (displayHits.length === 0) {
        // No results: single bubble.
        upsertMessage(pendingId, { content: reply, ragHits: undefined });
        recordRagMemory({
          query: searchQuery,
          hits: [],
          embedding: embedding ? [...embedding] : undefined,
          createdAt: Date.now(),
        });
        addTurnToMemory({ role: "assistant", content: reply });
        return;
      }

      // First bubble: show RAG results immediately (titles + links).
      upsertMessage(pendingId, { content: reply, ragHits: displayHits });

      // Second bubble: show "Generating…" then fill with synthesis (summaries or answer).
      const summaryPendingId = newId();
      const wantsPerPaperSummaries =
        (plan.secondary && plan.secondary.includes("SUMMARIZE")) ||
        /\b(summar(y|ies|ize|ized)|one[- ]?line|one[- ]?liner|brief overview|synopsis|short summary)\b/i.test(prompt);
      const generatingLabel = wantsPerPaperSummaries ? "Generating summaries…" : "Generating answer…";
      setMessages((m) => [...m, { id: summaryPendingId, role: "assistant", content: generatingLabel }]);
      await new Promise((r) => setTimeout(r, 50));

      let synthesis = "";
      try {
        if (wantsPerPaperSummaries) {
          const summariesById = await summarizeHitsWithLocalModel({ query: prompt, hits: displayHits });
          const lines = buildSummaryLines(displayHits, summariesById);
          synthesis =
            lines.trim().length > 0
              ? `Here are the papers with a short summary for each:\n\n${lines}`
              : "";
        }
        if (!synthesis) {
          synthesis = await synthesizeRagAnswer({
            userPrompt: prompt,
            hits: displayHits.map((h) => ({
              id: h.paper.id,
              title: h.paper.title,
              year: h.paper.year ?? null,
              abstract: h.paper.abstract,
            })),
          });
        }
      } catch (err) {
        if (typeof console !== "undefined" && console.error) {
          console.error("[useRagSearch] Synthesis failed", err);
        }
      }

      const finalContent = synthesis || "I couldn’t generate a response for the retrieved papers.";
      upsertMessage(summaryPendingId, { content: finalContent });

      recordRagMemory({
        query: searchQuery,
        hits: displayHits.map((h) => ({
          id: h.paper.id,
          title: h.paper.title,
          year: h.paper.year ?? null,
          abstract: h.paper.abstract,
          distance: h.distance ?? null,
        })),
        embedding: embedding ? [...embedding] : undefined,
        createdAt: Date.now(),
      });

      addTurnToMemory({ role: "assistant", content: finalContent });
      return; // IMPORTANT: avoid also appending a second assistant message in the caller
    } catch (err) {
      // Never show the error details in the UI.
      if (typeof console !== "undefined" && console.error) {
        console.error("[RAG search failed]", err);
      }
      reply = "I couldn’t run paper search right now. Please try again later.";
    } finally {
      // Free up embedding memory as soon as possible.
      if (embedding) embedding.length = 0;
    }

    // Replace the searching bubble with the final reply.
    upsertMessage(pendingId, { content: reply, ragHits: undefined });
    addTurnToMemory({ role: "assistant", content: reply });
  }

  return { runRagSearch };
}


