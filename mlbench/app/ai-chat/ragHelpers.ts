"use client";

import type { VectorSearchHit } from "./types";
import { rerankHits, summarizePapers } from "@/lib/ai/chains";
import { stripInternalTags } from "@/lib/ai/localServerRuntime";

export function sortHitsByDistance(hits: VectorSearchHit[]): VectorSearchHit[] {
  return [...hits].sort((a, b) => {
    const da = a.distance ?? Number.POSITIVE_INFINITY;
    const db = b.distance ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.paper.id.localeCompare(b.paper.id);
  });
}

export function rankByDistance(hits: VectorSearchHit[]): Map<string, number> {
  const ranked = sortHitsByDistance(hits);
  const rankById = new Map<string, number>();
  ranked.forEach((h, idx) => rankById.set(h.paper.id, idx + 1));
  return rankById;
}

export async function rerankHitsWithLocalModel(opts: {
  prompt: string;
  hits: VectorSearchHit[];
  wantsRecent: boolean;
}): Promise<VectorSearchHit[]> {
  const { prompt, hits, wantsRecent } = opts;

  const candidates = hits.map((h) => ({
    id: h.paper.id,
    title: h.paper.title,
    year: h.paper.year ?? null,
    abstract: (h.paper.abstract ?? "").slice(0, 240),
  }));

  const ids = await rerankHits({ prompt, wantsRecent, candidates });
  const idSet = new Set((ids || []).filter(Boolean));
  const ordered = hits.filter((h) => idSet.has(h.paper.id));
  return ordered.length > 0 ? ordered : hits;
}

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isTitleEcho(title: string, summary: string): boolean {
  const nt = norm(title);
  const ns = norm(summary);
  if (!ns) return true;
  if (ns === nt) return true;
  if (ns.includes(nt) && ns.length <= nt.length + 24) return true;

  const titleTokens = nt.split(" ").filter((w) => w.length >= 4);
  const sumTokens = ns.split(" ").filter((w) => w.length >= 4);
  if (titleTokens.length === 0 || sumTokens.length === 0) return true;
  const titleSet = new Set(titleTokens);
  let overlap = 0;
  for (const t of sumTokens) if (titleSet.has(t)) overlap++;
  const overlapRatio = overlap / Math.max(1, Math.min(titleTokens.length, sumTokens.length));
  return overlapRatio >= 0.75 && summary.trim().length <= 120;
}

export function fallbackOneLiner(abs?: string | null): string {
  const t = (abs || "").replace(/\s+/g, " ").trim();
  if (!t) return "No abstract snippet available.";

  // Prefer the first sentence if punctuation exists; otherwise just use the start.
  const firstSentence = t.split(/(?<=[.!?])\s/)[0] || t;

  // Produce a clean, short snippet that doesn't end mid-word or with a hanging ellipsis.
  const words = firstSentence.split(" ").filter(Boolean);
  const maxWords = 22;
  const snippet = (words.length > maxWords ? words.slice(0, maxWords) : words).join(" ").trim();

  // Ensure it ends like a sentence.
  if (!snippet) return "No abstract snippet available.";
  return /[.!?]$/.test(snippet) ? snippet : `${snippet}.`;
}

export async function summarizeHitsWithLocalModel(opts: {
  query: string;
  hits: VectorSearchHit[];
}): Promise<Map<string, string>> {
  const { query, hits } = opts;
  const list =
    (await summarizePapers({
      query,
      papers: hits.map((h) => ({
        id: h.paper.id,
        title: h.paper.title,
        year: h.paper.year ?? null,
        abstract: (h.paper.abstract ?? "").slice(0, 600),
      })),
    })) || [];
  const byId = new Map<string, string>();
  for (const it of list) {
    if (!it?.id || typeof it?.summary !== "string") continue;
    const id = String(it.id);
    const s = String(it.summary).trim();
    if (!s) continue;
    const hit = hits.find((h) => h.paper.id === id);
    if (hit && isTitleEcho(hit.paper.title, s)) continue;
    byId.set(id, s);
  }
  return byId;
}

export function buildSummaryLines(hits: VectorSearchHit[], summariesById: Map<string, string>): string {
  return hits
    .map((h, idx) => {
      const raw = summariesById.get(h.paper.id) || fallbackOneLiner(h.paper.abstract);
      const s = stripInternalTags(raw);
      const y = h.paper.year ? ` (${h.paper.year})` : "";
      return `${idx + 1}. ${h.paper.title}${y} — ${s}`;
    })
    .join("\n");
}


