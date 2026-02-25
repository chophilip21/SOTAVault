"use client";

import { PromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";

import {
  normalizeRoutePlan,
  PRIMARY_CAPABILITIES,
  SECONDARY_TASKS,
  type PrimaryCapability,
  type RoutePlan,
} from "@/lib/routerSpec";
import { generateTextFromMessages, generateTextFromMessagesRouter, type LlmMessage } from "@/lib/ai/localServerRuntime";
import type { RouterMemoryContext } from "@/lib/ai/types";

// ─── Two-layer router (Qwen3 with /no_think) ─────────────────────────────────

const LAYER1_CATEGORIES = ["ml_related", "unrelated", "website_related", "ambiguous"] as const;
export type Layer1Category = (typeof LAYER1_CATEGORIES)[number];

const Layer1Schema = z.object({
  category: z.enum(LAYER1_CATEGORIES),
});

function normalizeLayer1(raw: unknown): Layer1Category {
  const s = typeof raw === "string" ? raw.trim().toLowerCase().replace(/["'\s]/g, "") : "";
  if (LAYER1_CATEGORIES.includes(s as Layer1Category)) return s as Layer1Category;
  const parsed = Layer1Schema.safeParse(raw);
  if (parsed.success) return parsed.data.category;
  return "ambiguous";
}

const LAYER2_ACTIONS = ["call_rag", "no_rag"] as const;
export type Layer2Action = (typeof LAYER2_ACTIONS)[number];

const Layer2Schema = z.object({
  action: z.enum(LAYER2_ACTIONS),
  rag_keyword: z.string().max(240).optional().nullable(),
});

function normalizeLayer2(raw: unknown): { action: Layer2Action; rag_keyword: string | null } {
  const parsed = Layer2Schema.safeParse(raw);
  if (parsed.success) {
    const action = parsed.data.action;
    const rag_keyword =
      action === "call_rag" && parsed.data.rag_keyword
        ? String(parsed.data.rag_keyword).trim().slice(0, 240)
        : null;
    return { action, rag_keyword };
  }
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const actionStr = obj?.action != null ? String(obj.action).trim().toLowerCase() : "";
  const action: Layer2Action = LAYER2_ACTIONS.includes(actionStr as Layer2Action) ? (actionStr as Layer2Action) : "no_rag";
  const rag_keyword =
    action === "call_rag" && obj?.rag_keyword != null
      ? String(obj.rag_keyword).trim().slice(0, 240)
      : null;
  return { action, rag_keyword };
}

const ROUTER_NO_THINK_SUFFIX = " /no_think ";

/** Layer 1: 4-way classification. User prompt is sent with " /no_think " appended. Logs layer name, time, result; logs errors. */
export async function routerLayer1(userPrompt: string): Promise<Layer1Category> {
  const layerName = "Layer 1 (4-way classification)";
  const start = performance.now();
  try {
    const system = [
      "You are a strict router. Classify the user message into exactly one category.",
      "Return ONLY a JSON object with a single key: \"category\". No other text.",
      "Allowed values for \"category\": ml_related, unrelated, website_related, ambiguous",
      "- ml_related: papers, datasets, ML concepts, benchmarks, algorithms.",
      "- unrelated: off-topic (e.g. celebrities, general knowledge, not ML).",
      "- website_related: questions about this website/app (data sources, login, profile, what is MLBench).",
      "- ambiguous: intent unclear.",
    ].join("\n");

    const userContent = `${userPrompt.trim()}${ROUTER_NO_THINK_SUFFIX}`;
    const raw = await generateTextFromMessagesRouter(
      [{ role: "system", content: system }, { role: "user", content: userContent }],
      { maxNewTokens: 48, temperature: 0, topP: 1 }
    );

    const jsonStr = balancedJsonExtract(raw) ?? balancedJsonExtract(raw.replace(/```(?:json)?/g, ""));
    const parsed = jsonStr ? safeJsonParse<unknown>(jsonStr) : safeJsonParse<unknown>(raw.trim());
    const category = normalizeLayer1(parsed ?? raw);

    const ms = Math.round(performance.now() - start);
    if (typeof console !== "undefined" && console.log) {
      console.log(`[LangChain] ${layerName}: ${ms} ms, result: ${category}`);
    }
    return category;
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    if (typeof console !== "undefined" && console.error) {
      console.error(`[LangChain] ${layerName}: error after ${ms} ms`, err);
    }
    return "ambiguous";
  }
}

/** Layer 2: call_rag vs no_rag (only when Layer 1 is ml_related). If call_rag, extract rag_keyword. Logs layer name, time, result; logs errors. */
export async function routerLayer2(userPrompt: string): Promise<{ action: Layer2Action; rag_keyword: string | null }> {
  const layerName = "Layer 2 (rag vs no_rag)";
  const start = performance.now();
  try {
    const system = [
      "You are a strict router. Decide if the user wants to search/find ML papers (call_rag) or just ask an ML question (no_rag).",
      "Return ONLY a JSON object. Keys: \"action\" (call_rag or no_rag), \"rag_keyword\" (required only when action is call_rag: the short search phrase, e.g. \"Faster RCNN\").",
      "No other text. No markdown.",
    ].join("\n");

    const userContent = `${userPrompt.trim()}${ROUTER_NO_THINK_SUFFIX}`;
    const raw = await generateTextFromMessagesRouter(
      [{ role: "system", content: system }, { role: "user", content: userContent }],
      { maxNewTokens: 80, temperature: 0, topP: 1 }
    );

    const jsonStr = balancedJsonExtract(raw) ?? balancedJsonExtract(raw.replace(/```(?:json)?/g, ""));
    const parsed = jsonStr ? safeJsonParse<unknown>(jsonStr) : safeJsonParse<unknown>(raw.trim());
    const result = normalizeLayer2(parsed ?? raw);

    const ms = Math.round(performance.now() - start);
    if (typeof console !== "undefined" && console.log) {
      console.log(`[LangChain] ${layerName}: ${ms} ms, result:`, result);
    }
    return result;
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    if (typeof console !== "undefined" && console.error) {
      console.error(`[LangChain] ${layerName}: error after ${ms} ms`, err);
    }
    return { action: "no_rag", rag_keyword: null };
  }
}

function balancedJsonExtract(text: string): string | null {
  const s = String(text || "");
  const start = s.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inStr: '"' | "'" | null = null;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === "\\") {
        esc = true;
      } else if (ch === inStr) {
        inStr = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function asUpper(s: unknown): string {
  return String(s ?? "").trim().toUpperCase();
}

const RoutePlanSchema = z
  .object({
    primary: z.enum(PRIMARY_CAPABILITIES),
    secondary: z.array(z.enum(SECONDARY_TASKS)),
    constraints: z
      .object({
        count: z.number().int().min(1).max(20).optional().nullable(),
        recency: z.enum(["recent", "any"]).optional().nullable(),
        domain: z.string().max(240).optional().nullable(),
        year_min: z.number().int().min(1900).max(2100).optional().nullable(),
        year_max: z.number().int().min(1900).max(2100).optional().nullable(),
      })
      .optional(),
  })
  .strict();

const RerankSchema = z.object({ ids: z.array(z.string()).default([]) }).strict();

const SummariesSchema = z
  .object({
    summaries: z.array(z.object({ id: z.string(), summary: z.string() }).strict()),
  })
  .strict();

export function formatMemoryForRouter(memory?: RouterMemoryContext): string {
  if (!memory) return "No memory.";
  const turns =
    memory.recentTurns && memory.recentTurns.length
      ? memory.recentTurns.map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`).join("\n")
      : "No recent turns.";
  const rag =
    memory.recentRag && memory.recentRag.length
      ? memory.recentRag
        .slice(0, 2)
        .map((r, idx) => `Recent RAG ${idx + 1}: query="${r.query}". Titles: ${(r.titles || []).slice(0, 6).join("; ")}`)
        .join("\n")
      : "No recent RAG.";
  const summary = memory.summary ? `Summary:\n${memory.summary}` : "No summary.";
  return [summary, "", "Recent turns:", turns, "", "Recent RAG:", rag].join("\n");
}

async function generateJsonWithRetry(messages: LlmMessage[], opts?: { maxNewTokens?: number }): Promise<unknown | null> {
  const tries: Array<{ temperature: number; n: number; suffix: string }> = [
    { temperature: 0, n: opts?.maxNewTokens ?? 220, suffix: "" },
    {
      temperature: 0,
      n: Math.max(220, (opts?.maxNewTokens ?? 220) + 80),
      suffix: "\n\nYour previous output was invalid. Return ONLY a single JSON object. No code fences. No trailing text.",
    },
  ];

  for (const t of tries) {
    const m = t.suffix ? [...messages, { role: "user" as const, content: t.suffix }] : messages;
    const raw = await generateTextFromMessages(m, { temperature: t.temperature, topP: 1, maxNewTokens: t.n, seed: 1 });
    const json = balancedJsonExtract(raw) ?? balancedJsonExtract(raw.replace(/```(?:json)?/g, ""));
    const parsed = json ? safeJsonParse<unknown>(json) : safeJsonParse<unknown>(raw.trim());
    if (parsed && typeof parsed === "object") return parsed;
  }
  return null;
}

export async function routeWithLocalModel(prompt: string, memory?: RouterMemoryContext): Promise<RoutePlan> {
  const ROUTE_PLAN_SCHEMA_TEXT = JSON.stringify({
    type: "object",
    additionalProperties: false,
    properties: {
      primary: { type: "string", enum: [...PRIMARY_CAPABILITIES] },
      secondary: { type: "array", items: { type: "string", enum: [...SECONDARY_TASKS] } },
      constraints: {
        type: "object",
        additionalProperties: false,
        properties: {
          count: { type: "integer", minimum: 1, maximum: 20 },
          recency: { type: "string", enum: ["recent", "any"] },
          domain: { type: "string", maxLength: 240 },
          year_min: { type: "integer", minimum: 1900, maximum: 2100 },
          year_max: { type: "integer", minimum: 1900, maximum: 2100 },
        },
      },
    },
    required: ["primary", "secondary"],
  });

  const system = [
    "You are a router for MLBench. Decide how the app should handle the user's message.",
    "Return ONLY a JSON object that matches the schema below. No markdown. No extra keys. No explanations.",
    "",
    ROUTE_PLAN_SCHEMA_TEXT,
    "",
    "Primary capabilities:",
    "- RAG_SEARCH: user asks to find/recommend/search papers/citations OR needs retrieval over papers.",
    "- ML_NO_RAG: user asks about ML concepts without needing paper retrieval.",
    "- FOLLOW_UP: depends on prior conversation or previously provided papers/results/context.",
    "- WEBSITE: questions about how to use the website/app.",
    "- AMBIGUOUS: unclear; needs a clarifying question in stage-2.",
    "- UNRELATED: outside ML/app scope.",
    "",
    "Secondary guidance:",
    '- Use "RETRIEVE" when doing paper retrieval (usually with RAG_SEARCH).',
    '- Use "RERANK" when results should be prioritized for relevance.',
    '- Use "SUMMARIZE" when the user requests short summaries/one-liners.',
    '- Set constraints.count when user asks for N items.',
    '- If user asks for recent/latest, set constraints.recency="recent".',
    "",
    "Rules:",
    "- Always include exactly one primary.",
    "- Secondary MUST be present (may be empty array).",
    "- Do NOT output null values. Omit constraints fields if unknown.",
  ].join("\n");

  const userTpl = PromptTemplate.fromTemplate(
    ["User message:", "{prompt}", "", "Conversation memory (for routing only):", "{memory}"].join("\n")
  );
  const user = await userTpl.format({ prompt, memory: formatMemoryForRouter(memory) });

  const obj = await generateJsonWithRetry(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { maxNewTokens: 220 }
  );

  // Super forgiving: sometimes the model returns the enum token directly.
  if (typeof obj === "string") {
    const direct = asUpper(obj).replace(/["'`]/g, "");
    if ((PRIMARY_CAPABILITIES as readonly string[]).includes(direct)) {
      return normalizeRoutePlan({ primary: direct as PrimaryCapability, secondary: [] });
    }
  }
  const parsed = RoutePlanSchema.safeParse(obj);
  if (parsed.success) return normalizeRoutePlan(parsed.data as RoutePlan);

  // Deterministic fallback: keep behavior safe.
  const p = prompt.toLowerCase();
  const isWebsite = /\b(website|this site|mlbench|page|login|log in|sign in|profile|bookmark|privacy|terms|ai chat)\b/.test(p);
  const isSearch = /\b(find|search|papers?|cite|references?|recent papers?)\b/.test(p);
  const primary: PrimaryCapability = isWebsite ? "WEBSITE" : isSearch ? "RAG_SEARCH" : "ML_NO_RAG";
  return normalizeRoutePlan({ primary, secondary: primary === "RAG_SEARCH" ? ["RETRIEVE"] : [] });
}

export async function summarizeMemory(opts: {
  existingSummary: string | null;
  recentTurns: Array<{ role: "user" | "assistant"; content: string }>;
  ragText: string;
}): Promise<string> {
  const sys =
    "You are a memory compressor for a chat assistant. Produce a concise summary (<= 180 words). Preserve key user intents, assistant answers, and referenced papers. Do not fabricate.";
  const user = [
    opts.existingSummary ? `Existing summary:\n${opts.existingSummary}\n` : "No existing summary.",
    "Recent turns:",
    opts.recentTurns.map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`).join("\n"),
    "",
    "Recent RAG context:",
    opts.ragText || "No recent RAG results.",
    "",
    "Return only the updated summary text.",
  ].join("\n");
  const text = await generateTextFromMessages(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    // Keep this short: runs frequently and must be fast in-browser.
    { temperature: 0.2, topP: 0.9, maxNewTokens: 140 }
  );
  return text.trim() || opts.existingSummary || "";
}

export async function rerankHits(opts: {
  prompt: string;
  wantsRecent: boolean;
  candidates: Array<{ id: string; title: string; year: number | null; abstract: string }>;
}): Promise<string[] | null> {
  const sys = [
    "You are a strict reranker for ML paper search results.",
    "Given the user query and candidates, select up to 5 candidate ids that best match the user's intent.",
    "Return ONLY JSON: {\"ids\":[\"...\"]}. No extra keys. No text.",
    "",
    "Ranking rules:",
    "- Prefer topical match.",
    "- If user asks recent/latest/newest, prefer higher year when relevance is similar.",
    "- If candidates are off-topic, do not select them.",
  ].join("\n");

  const user = JSON.stringify({ query: opts.prompt, wants_recent: opts.wantsRecent, candidates: opts.candidates });
  const obj = await generateJsonWithRetry(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    { maxNewTokens: 160 }
  );
  const parsed = RerankSchema.safeParse(obj);
  if (!parsed.success) return null;
  return parsed.data.ids.filter(Boolean);
}

export async function summarizePapers(opts: {
  query: string;
  papers: Array<{ id: string; title: string; year: number | null; abstract: string }>;
}): Promise<Array<{ id: string; summary: string }> | null> {
  const sys = [
    "You write extremely short, factual, ONE-LINE summaries of papers.",
    "Use ONLY the provided title/year/abstract snippets; do not invent details.",
    "Do NOT repeat the title as the summary.",
    "Return a summary for EVERY provided paper id.",
    "Each summary should be <= 20 words.",
    'Return ONLY JSON: {"summaries":[{"id":"...","summary":"..."}]}. No extra keys. No text.',
  ].join("\n");
  const user = JSON.stringify({ query: opts.query, papers: opts.papers });
  const obj = await generateJsonWithRetry(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    // JSON-only, one-liners: keep token budget small for speed.
    { maxNewTokens: 240 }
  );
  const parsed = SummariesSchema.safeParse(obj);
  if (!parsed.success) return null;
  return parsed.data.summaries;
}

export async function answerFollowUpFromMemory(opts: {
  prompt: string;
  summary: string | null;
  recentTurns: Array<{ role: "user" | "assistant"; content: string }>;
  ragContext: string;
}): Promise<string> {
  const hasMemory = Boolean(opts.summary) || opts.recentTurns.length > 1 || /\bRAG\b/i.test(opts.ragContext);
  if (!hasMemory) return "I don't have previous context yet. Could you restate what you'd like to follow up on?";

  const system =
    "You are MLTree LLM Agent inside MLBench. Answer the follow-up using ONLY the provided memory context. If insufficient, say so briefly and ask the user to restate. Do not invent paper titles or citations. Respond directly and concisely. Do not use internal thought tags or headers. Start your response immediately with the answer.";
  const user = [
    "Conversation summary:",
    opts.summary || "None.",
    "",
    "Recent turns:",
    opts.recentTurns.map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`).join("\n") || "None.",
    "",
    "Recent RAG results:",
    opts.ragContext || "No stored RAG results.",
    "",
    `Follow-up question: ${opts.prompt}`,
  ].join("\n");

  const text = await generateTextFromMessages(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    // In-browser performance: cap follow-up length.
    { temperature: 0.55, topP: 0.9, maxNewTokens: 320 }
  );
  return text.trim() || "I couldn’t generate a response. Please try again.";
}

export async function answerMlQuestion(opts: {
  systemHint?: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const system =
    opts.systemHint ||
    "You are MLTree LLM Agent inside MLBench. Answer machine learning questions clearly and concisely. Use short sections and examples when helpful. Do not fabricate citations. Respond directly and concisely. Do not use internal thought tags or headers. Start your response immediately with the answer.";
  const messages: LlmMessage[] = [
    { role: "system", content: system },
    ...opts.history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
  ];
  // 700 tokens is far too slow on CPU/WASM. Keep answers short and interactive.
  const text = await generateTextFromMessages(messages, { temperature: 0.7, topP: 0.95, maxNewTokens: 260 });
  return text.trim() || "I couldn’t generate a response. Please try again.";
}

export async function clarifyAmbiguity(prompt: string): Promise<string> {
  const system = [
    "You are a routing assistant for MLBench. The router marked the intent as AMBIGUOUS.",
    "Respond directly and concisely. Do not use internal thought tags or headers. Start your response immediately with the answer.",
    "Ask ONE concise clarification question that helps choose among:",
    "- RAG_SEARCH (paper recommendations/search),",
    "- ML_NO_RAG (concept explanation),",
    "- FOLLOW_UP (refers to earlier context),",
    "- WEBSITE (how to use the site/app),",
    "- UNRELATED.",
    "Do not answer the original request.",
  ].join("\n");
  const user = [
    "Original user message:",
    prompt,
    "",
    "Ask for the specific detail that resolves the ambiguity (e.g., whether they want papers vs an explanation).",
  ].join("\n");
  const text = await generateTextFromMessages(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.3, topP: 0.9, maxNewTokens: 180 }
  );
  return text.trim() || "Could you clarify whether you want paper recommendations, an ML explanation, a follow-up on prior results, or help using this site?";
}

