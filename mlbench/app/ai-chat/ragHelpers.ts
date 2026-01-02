"use client";

import type { RerankResponse, VectorSearchHit } from "./types";

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

export async function rerankHitsWithWebLLM(opts: {
  engine: any;
  prompt: string;
  hits: VectorSearchHit[];
  wantsRecent: boolean;
}): Promise<VectorSearchHit[]> {
  const { engine, prompt, hits, wantsRecent } = opts;

  const candidates = hits.map((h) => ({
    id: h.paper.id,
    title: h.paper.title,
    year: h.paper.year ?? null,
    abstract: (h.paper.abstract ?? "").slice(0, 240),
  }));

  const schema = JSON.stringify({
    type: "object",
    additionalProperties: false,
    properties: {
      ids: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["ids"],
  });

  const sys = [
    "You are a strict reranker for ML paper search results.",
    "Given the user query and a list of candidate papers, select up to 5 paper IDs that best match the user's intent.",
    "Return ONLY JSON matching the schema. No extra text.",
    "",
    "Ranking rules:",
    "- Prefer strong topical match to the query.",
    "- If the user asks for 'recent/latest/newest', prefer higher year when relevance is similar.",
    "- If candidates are off-topic, do not select them.",
  ].join("\n");

  const user = JSON.stringify({
    query: prompt,
    wants_recent: wantsRecent,
    candidates,
  });

  const r = await engine.chat.completions.create({
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    temperature: 0,
    top_p: 1,
    seed: 1,
    max_tokens: 120,
    response_format: { type: "json_object", schema },
  });

  const raw = r?.choices?.[0]?.message?.content ?? "";
  let parsed: RerankResponse | null = null;
  try {
    parsed = JSON.parse(raw) as RerankResponse;
  } catch {
    parsed = null;
  }

  const idSet = new Set((parsed?.ids || []).filter(Boolean));
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

export async function summarizeHitsWithWebLLM(opts: {
  engine: any;
  query: string;
  hits: VectorSearchHit[];
}): Promise<Map<string, string>> {
  const { engine, query, hits } = opts;

  const schema = JSON.stringify({
    type: "object",
    additionalProperties: false,
    properties: {
      summaries: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            summary: { type: "string" },
          },
          required: ["id", "summary"],
        },
      },
    },
    required: ["summaries"],
  });

  const sys = [
    "You write extremely short, factual, ONE-LINE summaries of papers.",
    "Use ONLY the provided title/year/abstract snippets; do not invent details.",
    "Do NOT repeat the title as the summary.",
    "Return a summary for EVERY provided paper id.",
    "Each summary should be <= 20 words.",
    "Return ONLY JSON matching the schema.",
  ].join("\n");

  const user = JSON.stringify({
    query,
    papers: hits.map((h) => ({
      id: h.paper.id,
      title: h.paper.title,
      year: h.paper.year ?? null,
      abstract: (h.paper.abstract ?? "").slice(0, 600),
    })),
  });

  const r = await engine.chat.completions.create({
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    temperature: 0.2,
    top_p: 0.9,
    seed: 1,
    max_tokens: 420,
    response_format: { type: "json_object", schema },
  });

  const raw = r?.choices?.[0]?.message?.content ?? "";
  let parsed: any = null;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    parsed = null;
  }

  const list = Array.isArray(parsed?.summaries) ? parsed.summaries : [];
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
      const s = summariesById.get(h.paper.id) || fallbackOneLiner(h.paper.abstract);
      const y = h.paper.year ? ` (${h.paper.year})` : "";
      return `${idx + 1}. ${h.paper.title}${y} — ${s}`;
    })
    .join("\n");
}


