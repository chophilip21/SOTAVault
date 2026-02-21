"use client";

import type React from "react";
import { embedQuery, type RoutePlan } from "@/lib/ai/agent";
import { routerDebugGroup, routerDebugLog } from "@/lib/routerDebug";
import { rerankHitsWithLocalModel, sortHitsByDistance, summarizeHitsWithLocalModel, buildSummaryLines } from "./ragHelpers";
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

    let reply = "";
    let embedding: number[] | null = null;
    try {
      // Client-side: clean + embed (may load model first — show "Preparing search" until done), then send vector to backend.
      const searchQuery = (plan.constraints?.domain || prompt).toString();
      embedding = await embedQuery(searchQuery);
      // Now we're actually searching; show "Searching papers".
      upsertMessage(pendingId, { content: vectorSearchingToken });
      routerDebugGroup("[router] stage2 RAG_SEARCH", () => {
        routerDebugLog("searchQuery:", searchQuery);
        routerDebugLog("secondary:", plan.secondary);
        routerDebugLog("constraints:", plan.constraints ?? null);
      });

      const url = new URL(`${window.location.origin}/api/backend/search/vector`);
      const requestedCount1 = typeof plan.constraints?.count === "number" ? plan.constraints?.count : null;
      const wantCount = requestedCount1 && requestedCount1 > 0 ? Math.min(20, requestedCount1) : 5;
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ embedding, limit: Math.max(20, wantCount) }),
        cache: "no-store",
      });

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

      // Replace searching bubble with a structured "hits" bubble.
      upsertMessage(pendingId, { content: reply, ragHits: displayHits });

      // Optional task: one-line summaries per paper (if requested).
      if (plan.secondary?.includes("SUMMARIZE") && displayHits.length > 0) {
        try {
          const summariesById = await summarizeHitsWithLocalModel({ query: plan.constraints?.domain || prompt, hits: displayHits });
          const lines = buildSummaryLines(displayHits, summariesById);
          if (lines) {
            const summaryMsg = { id: newId(), role: "assistant" as const, content: lines };
            setMessages((m) => [...m, summaryMsg]);
            addTurnToMemory({ role: "assistant", content: lines });
          }
        } catch {
          // ignore summary failures; keep search results
        }
      }

      // Keep RAG context for follow-ups.
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

      addTurnToMemory({ role: "assistant", content: reply });
      return; // IMPORTANT: avoid also appending a second assistant message in the caller
    } catch {
      // Never show the error details in the UI.
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


