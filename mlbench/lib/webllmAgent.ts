"use client";

import { CreateMLCEngine, type InitProgressCallback, type MLCEngineInterface } from "@mlc-ai/web-llm";

import {
  buildRoutePlanSchemaJson,
  isPrimaryCapability,
  isSecondaryTask,
  normalizeRoutePlan,
  type PrimaryCapability,
  type RouteConstraints,
  type RoutePlan,
} from "@/lib/routerSpec";
import { routerDebugGroup, routerDebugLog } from "@/lib/routerDebug";


//TODO: probably we should not hard code this.
export const SELECTED_MODEL = "Llama-3.2-1B-Instruct-q4f32_1-MLC";

export type ScenarioCategory = "RAG_SEARCH" | "ML_NO_RAG" | "FOLLOW_UP" | "WEBSITE" | "AMBIGUOUS" | "UNRELATED";

export type ScenarioClassification = {
  category: ScenarioCategory;
};

export type RouterMemoryContext = {
  summary?: string | null;
  recentTurns?: { role: "user" | "assistant"; content: string }[];
  recentRag?: { query: string; titles: string[] }[];
};

// Client-side embedding (stage-2 RAG): must match backend vector dimension (384).
export const EMBEDDING_DIM = 384;
// NOTE: This must be an MLC embedding model that outputs 384-d vectors compatible with the backend.
// If you change your backend embedding model, update this too.
export const SELECTED_EMBED_MODEL =
  process.env.NEXT_PUBLIC_WEBLLM_EMBED_MODEL || "snowflake-arctic-embed-s-q0f32-MLC-b4";

const ROUTE_PLAN_SCHEMA = buildRoutePlanSchemaJson();

export type { RoutePlan, RouteConstraints, PrimaryCapability };

let enginePromise: Promise<MLCEngineInterface> | null = null;
let embedEnginePromise: Promise<MLCEngineInterface> | null = null;

async function preflightWebGPU() {
  if (typeof window === "undefined") return;

  // Basic environment checks: WebLLM needs WebGPU and a secure context.
  const secure = typeof isSecureContext !== "undefined" ? isSecureContext : window.location.protocol === "https:";
  if (!secure) {
    throw new Error(
      [
        "WebGPU requires a secure context.",
        `Current protocol: ${window.location.protocol}`,
        "Fix: use HTTPS (or localhost HTTP), and ensure the certificate is trusted.",
      ].join(" ")
    );
  }

  if (!("gpu" in navigator) || !navigator.gpu) {
    throw new Error(
      [
        "WebGPU is not available in this browser.",
        "Fix: use a recent Chrome/Edge (recommended) and ensure WebGPU is enabled.",
        "If you're on Firefox/Safari or an older browser, WebGPU may be unavailable.",
      ].join(" ")
    );
  }

  // If adapter is null, the browser couldn't find a usable GPU backend.
  // Common causes: old/buggy GPU drivers, running inside VM, remote desktop, or GPU blocklist.
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error(
      [
        "WebGPU adapter request failed (no suitable GPU adapter).",
        "Common fixes:",
        "- Update GPU drivers (Linux: Mesa / proprietary drivers).",
        "- Try Chrome/Edge stable.",
        "- If running in a VM/remote desktop, enable GPU passthrough / hardware acceleration.",
        "- Check chrome://gpu for 'WebGPU' status and blocklist reasons.",
      ].join("\n")
    );
  }
}

export function getWebLLMEngine(initProgressCallback?: InitProgressCallback) {
  if (!enginePromise) {
    enginePromise = (async () => {
      await preflightWebGPU();
      return await CreateMLCEngine(SELECTED_MODEL, {
        initProgressCallback,
      });
    })();
  }
  return enginePromise;
}

export function getWebLLMEmbedEngine(initProgressCallback?: InitProgressCallback) {
  if (!embedEnginePromise) {
    embedEnginePromise = (async () => {
      await preflightWebGPU();
      return await CreateMLCEngine(SELECTED_EMBED_MODEL, {
        initProgressCallback,
      });
    })();
  }
  return embedEnginePromise;
}

export function cleanRagQuery(text: string): string {
  const t = text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[`*#>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, 2000);
}

export async function embedQuery(
  text: string,
  opts?: { initProgressCallback?: InitProgressCallback }
): Promise<number[]> {
  const engine = await getWebLLMEmbedEngine(opts?.initProgressCallback);
  const input = cleanRagQuery(text);

  // WebLLM exposes an OpenAI-compatible surface; embeddings support may differ by version.
  // We intentionally keep this dynamic to avoid type-level coupling.
  const api = engine as any;
  if (!api?.embeddings?.create) {
    throw new Error(
      "Embedding engine does not support embeddings.create(). Please ensure an MLC embedding model is configured."
    );
  }

  const res = await api.embeddings.create({ input });
  const emb = res?.data?.[0]?.embedding;
  if (!Array.isArray(emb)) throw new Error("Failed to compute embedding.");
  if (emb.length !== EMBEDDING_DIM) throw new Error(`Embedding dim mismatch: expected ${EMBEDDING_DIM}, got ${emb.length}`);
  return emb.map((x: any) => Number(x));
}

function tryParseClassification(raw: string): ScenarioClassification | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Super-forgiving path: sometimes the model returns the enum token directly.
  // Accept it even if it isn't JSON.
  const direct = trimmed.replace(/["'`]/g, "").trim().toUpperCase();
  if (["RAG_SEARCH", "ML_NO_RAG", "FOLLOW_UP", "WEBSITE", "AMBIGUOUS", "UNRELATED"].includes(direct)) {
    return { category: direct as ScenarioCategory };
  }

  // Fast path: valid JSON
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "category" in parsed &&
      (parsed as any).category &&
      ["RAG_SEARCH", "ML_NO_RAG", "FOLLOW_UP", "WEBSITE", "AMBIGUOUS", "UNRELATED"].includes((parsed as any).category)
    ) {
      return { category: (parsed as any).category as ScenarioCategory };
    }
  } catch {
    // fallthrough
  }

  // Fallback: extract the first JSON object from the output (should be rare with JSON-mode)
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "category" in parsed &&
      (parsed as any).category &&
      ["RAG_SEARCH", "ML_NO_RAG", "FOLLOW_UP", "WEBSITE", "AMBIGUOUS", "UNRELATED"].includes((parsed as any).category)
    ) {
      return { category: (parsed as any).category as ScenarioCategory };
    }
  } catch {
    return null;
  }

  // Last-chance: if the model produced something like `category: RAG_SEARCH` or included
  // the token somewhere in text, recover it.
  const tokenMatch = trimmed.match(/\b(RAG_SEARCH|ML_NO_RAG|FOLLOW_UP|WEBSITE|AMBIGUOUS|UNRELATED)\b/i);
  if (tokenMatch?.[1]) {
    return { category: tokenMatch[1].toUpperCase() as ScenarioCategory };
  }

  return null;
}

function tryParseRoutePlan(raw: string): RoutePlan | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const coerceConstraints = (c: any): RouteConstraints | undefined => {
    if (!c || typeof c !== "object") return undefined;
    const out: RouteConstraints = {};

    const toInt = (v: any) => {
      if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
      if (typeof v === "string" && /^\d{1,4}$/.test(v)) return parseInt(v, 10);
      return null;
    };

    const count = toInt(c.count);
    if (count !== null) out.count = count;

    const yearMin = toInt(c.year_min);
    if (yearMin !== null) out.year_min = yearMin;
    const yearMax = toInt(c.year_max);
    if (yearMax !== null) out.year_max = yearMax;

    if (c.recency === "recent" || c.recency === "any") out.recency = c.recency;
    if (typeof c.domain === "string") out.domain = c.domain.slice(0, 240);

    return out;
  };

  // Fast path: valid JSON
  try {
    const parsed = JSON.parse(trimmed) as any;
    if (
      parsed &&
      typeof parsed === "object" &&
      isPrimaryCapability(parsed.primary) &&
      Array.isArray(parsed.secondary)
    ) {
      return normalizeRoutePlan({
        primary: parsed.primary as PrimaryCapability,
        secondary: parsed.secondary.filter(isSecondaryTask),
        constraints: coerceConstraints(parsed.constraints),
      });
    }
  } catch {
    // fallthrough
  }

  // Fallback: extract first JSON object
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as any;
    if (
      parsed &&
      typeof parsed === "object" &&
      isPrimaryCapability(parsed.primary) &&
      Array.isArray(parsed.secondary)
    ) {
      return normalizeRoutePlan({
        primary: parsed.primary as PrimaryCapability,
        secondary: parsed.secondary.filter(isSecondaryTask),
        constraints: coerceConstraints(parsed.constraints),
      });
    }
  } catch {
    return null;
  }

  return null;
}

function heuristicFallback(prompt: string, memory?: RouterMemoryContext): ScenarioClassification {
  // Conservative local fallback to avoid showing hallucinated content if the model misbehaves.
  const p = prompt.toLowerCase();
  const matched: ScenarioCategory[] = [];
  const push = (c: ScenarioCategory) => {
    if (!matched.includes(c)) matched.push(c);
  };

  const websiteHints = [
    "mlbench",
    "this site",
    "this website",
    "bookmark",
    "bookmarks",
    "papers page",
    "benchmark page",
    "conference page",
    "profile",
    "login",
    "sign in",
    "account",
    "dataset",
    "datasets",
  ];
  const isWebsite = websiteHints.some((h) => p.includes(h));
  if (isWebsite) push("WEBSITE");

  const ragHints = [
    // Generic paper intent
    "paper",
    "papers",
    "show me papers",
    "show papers",
    "list papers",
    "find papers",
    "find papers",
    "paper search",
    "search papers",
    "recommend papers",
    "recent papers",
    "latest papers",
    "related papers",
    "relevant papers",
    "top papers",
    "best papers",
    "arxiv",
    "cite",
    "citations",
    "references",
    "survey",
    "related work",
    "state of the art",
    "sota",
  ];
  if (ragHints.some((h) => p.includes(h))) push("RAG_SEARCH");

  const mlHints = [
    "machine learning",
    "deep learning",
    "neural network",
    "transformer",
    "llm",
    "object detection",
    "computer vision",
    "segmentation",
    "image classification",
    "embedding",
    "backprop",
    "gradient",
    "optimizer",
    "loss function",
    "classification",
    "regression",
    "reinforcement learning",
    "rl",
    "diffusion",
  ];
  if (mlHints.some((h) => p.includes(h))) push("ML_NO_RAG");

  // If there is prior context and the user refers back indirectly, mark as follow-up.
  // IMPORTANT: do not treat "this website" / other website intents as FOLLOW_UP.
  if ((memory?.summary || (memory?.recentTurns?.length ?? 0) > 0) && /\b(this|that|those|them|it|previous|above|again)\b/.test(p) && !isWebsite) {
    push("FOLLOW_UP");
  }

  if (matched.length === 1) return { category: matched[0] };
  if (matched.length > 1) return { category: "AMBIGUOUS" };
  return { category: "UNRELATED" };
}

function formatMemoryForRouter(memory?: RouterMemoryContext): string {
  if (!memory) return "No memory.";
  const parts: string[] = [];
  if (memory.summary) parts.push(`Summary: ${memory.summary}`);
  if (memory.recentTurns?.length) {
    const tail = memory.recentTurns.slice(-6);
    parts.push(
      "Recent turns:\n" +
        tail
          .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
          .join("\n")
    );
  }
  if (memory.recentRag?.length) {
    const rag = memory.recentRag
      .slice(-3)
      .map(
        (r, idx) =>
          `RAG ${idx + 1}: query="${r.query}", titles=[${r.titles.slice(0, 5).join(" | ")}]`
      )
      .join("\n");
    parts.push(rag);
  }
  return parts.join("\n\n") || "No memory.";
}

function heuristicRouteFallback(prompt: string, memory?: RouterMemoryContext): RoutePlan {
  // Start from existing category heuristic, then attach some light-weight task extraction.
  const category = heuristicFallback(prompt, memory).category as PrimaryCapability;
  const p = prompt.toLowerCase();

  const secondary: RoutePlan["secondary"] = [];
  if (category === "RAG_SEARCH") secondary.push("RETRIEVE", "RERANK");

  // One-line summary intent.
  if (/\bsummary\b|\bsummarize\b|\bone[- ]line\b|\btl;dr\b|\bshort\b/.test(p)) secondary.push("SUMMARIZE");

  // Citation intent.
  if (/\bcite\b|\bcitation\b|\breference\b|\bbibtex\b/.test(p)) secondary.push("CITE");

  // Count intent (simple numeric extraction, optional).
  const countMatch = p.match(/\b(\d{1,2})\b/);
  const count = countMatch?.[1] ? Math.max(1, Math.min(20, parseInt(countMatch[1], 10))) : null;

  const constraints: RouteConstraints = {
    count: count ?? null,
    recency: /\brecent\b|\blatest\b|\bnewest\b|\b202\d\b/.test(p) ? "recent" : "any",
    domain: prompt.slice(0, 240),
  };

  return normalizeRoutePlan({ primary: category, secondary, constraints });
}

function hasPriorContext(memory?: RouterMemoryContext): boolean {
  if (!memory) return false;
  if (memory.summary && memory.summary.trim().length > 0) return true;
  if ((memory.recentTurns?.length ?? 0) > 0) return true;
  if ((memory.recentRag?.length ?? 0) > 0) return true;
  return false;
}

function looksLikeWebsiteIntent(prompt: string): boolean {
  const p = prompt.toLowerCase();
  const hints = [
    "mlbench",
    "this site",
    "this website",
    "website",
    "page",
    "navigate",
    "where is",
    "how do i",
    "login",
    "log in",
    "sign in",
    "account",
    "profile",
    "bookmark",
    "bookmarks",
    "privacy",
    "terms",
    "data source",
    "data sources",
    "got the data",
    "where did you get the data",
  ];
  return hints.some((h) => p.includes(h));
}

function looksLikeFollowUpReference(prompt: string): boolean {
  const p = prompt.toLowerCase();
  return /\b(this|that|those|them|it|previous|above|again|earlier|last time|you mentioned)\b/.test(p);
}

function websiteSecondaryFromPrompt(prompt: string): RoutePlan["secondary"] {
  const p = prompt.toLowerCase();
  const sec: RoutePlan["secondary"] = ["WEBSITE_NAVIGATE"];
  if (
    /\b(where|how)\b.*\b(data|dataset|source|collected|collection)\b/.test(p) ||
    p.includes("got the data") ||
    p.includes("data source") ||
    p.includes("data sources")
  ) {
    sec.push("WEBSITE_DATA_SOURCES");
  }
  if (p.includes("privacy")) sec.push("WEBSITE_PRIVACY");
  if (p.includes("terms")) sec.push("WEBSITE_TERMS");
  if (p.includes("bookmark")) sec.push("WEBSITE_BOOKMARKS");
  if (p.includes("conference")) sec.push("WEBSITE_CONFERENCE");
  if (p.includes("papers")) sec.push("WEBSITE_PAPERS");
  if (p.includes("ai chat") || p.includes("webgpu")) sec.push("WEBSITE_AI_CHAT");
  return Array.from(new Set(sec));
}

export async function routePrompt(
  prompt: string,
  opts?: {
    initProgressCallback?: InitProgressCallback;
    signal?: AbortSignal;
    memory?: RouterMemoryContext;
  }
): Promise<RoutePlan> {
  try {
    const engine = await getWebLLMEngine(opts?.initProgressCallback);

    const system = [
      "You are a router for MLBench. You must output a RoutePlan JSON object for how the app should handle the user's message.",
      "",
      "Return ONLY a JSON object that matches this schema:",
      ROUTE_PLAN_SCHEMA,
      "",
      "Primary capabilities:",
      "- RAG_SEARCH: user asks to find/recommend/search papers, citations, references, or needs retrieval over papers.",
      "- ML_NO_RAG: user asks about machine learning concepts without needing paper retrieval.",
      "- FOLLOW_UP: depends on prior conversation or previously provided papers/results/context.",
      "- WEBSITE: questions about how to use the website/app.",
      "- AMBIGUOUS: could plausibly be multiple of the above; needs a clarifying question in stage-2.",
      "- UNRELATED: clearly outside ML/app scope.",
      "",
      "Secondary tasks guidance:",
      '- Use "RETRIEVE" when the flow needs fetching/searching papers (usually with RAG_SEARCH).',
      '- Use "RERANK" when results should be prioritized for relevance (usually with RAG_SEARCH).',
      '- Use "SUMMARIZE" when the user asks for short summaries/one-liners/overview.',
      '- Use "FILTER_BY_DATE" and set constraints.year_min/year_max or constraints.recency if the user cares about recency/years.',
      '- Set constraints.count when user asks for N items (default can be omitted).',
    "",
    "Website help tasks (use these ONLY when primary=WEBSITE):",
    '- WEBSITE_NAVIGATE: user asks how to find something / where a page is.',
    '- WEBSITE_LOGIN: login/account access questions.',
    '- WEBSITE_PROFILE: profile settings / account management.',
    '- WEBSITE_BOOKMARKS: bookmarking papers / viewing saved items.',
    '- WEBSITE_PAPERS: how to use Papers page (search/filter).',
    '- WEBSITE_BENCHMARK: how to use Benchmark page.',
    '- WEBSITE_CONFERENCE: how to use Conference page.',
    '- WEBSITE_AI_CHAT: how to use AI Chat.',
    '- WEBSITE_DATA_SOURCES: where the data comes from (high-level, public info only).',
    '- WEBSITE_PRIVACY / WEBSITE_TERMS: direct to policy pages.',
    '- WEBSITE_TROUBLESHOOT: common usage issues (login required, WebGPU requirements, etc).',
      "",
      "Rules:",
      "- Always include exactly one primary.",
      "- Secondary can be an empty array, but MUST be present.",
      "- Do NOT output null values. Omit constraints/fields if unknown.",
      "- Only choose FOLLOW_UP if the provided conversation memory includes prior turns or prior RAG results AND the user is referring back.",
      "- Even if memory exists, if the user asks a NEW standalone question (topic shift), choose the appropriate primary (e.g., WEBSITE) instead of FOLLOW_UP.",
      "- If you are unsure between primaries, choose AMBIGUOUS.",
      "- Use UNRELATED only if it is clearly outside ML/app scope.",
      "- Never reveal private user data, internal code, secrets, security details, or non-public business logic.",
    ].join("\n");

  const memoryNote = formatMemoryForRouter(opts?.memory);
  const userContent = opts?.memory
    ? ["User message:", prompt, "", "Conversation memory (for routing only):", memoryNote].join("\n")
    : prompt;

    const baseRequest = {
      messages: [
        { role: "system" as const, content: system },
        { role: "user" as const, content: userContent },
      ],
      temperature: 0,
      top_p: 1,
      max_tokens: 180,
      seed: 1,
      response_format: { type: "json_object" as const, schema: ROUTE_PLAN_SCHEMA },
    };

    const res1 = await engine.chat.completions.create(baseRequest);
    const text1 = res1.choices?.[0]?.message?.content ?? "";
    const parsed1 = tryParseRoutePlan(text1);
    if (parsed1) {
      // Guardrail: FOLLOW_UP is only valid when there is actual prior context.
      if (parsed1.primary === "FOLLOW_UP" && !hasPriorContext(opts?.memory)) {
        const fallbackPrimary = heuristicFallback(prompt, opts?.memory).category as PrimaryCapability;
        const corrected = normalizeRoutePlan({
          primary: fallbackPrimary,
          secondary: parsed1.secondary,
          constraints: parsed1.constraints,
        });
        routerDebugGroup(`[router] stage1 corrected FOLLOW_UP→${corrected.primary} (no prior context)`, () => {
          routerDebugLog("prompt:", prompt);
          routerDebugLog("memory:", opts?.memory ?? null);
          routerDebugLog("raw:", text1);
          routerDebugLog("plan_before:", parsed1);
          routerDebugLog("plan_after:", corrected);
        });
        return corrected;
      }

      // Guardrail: even with prior context, allow topic shift.
      // If the new prompt is clearly a WEBSITE question, do not force FOLLOW_UP.
      if (
        parsed1.primary === "FOLLOW_UP" &&
        hasPriorContext(opts?.memory) &&
        looksLikeWebsiteIntent(prompt) &&
        !looksLikeFollowUpReference(prompt)
      ) {
        const corrected = normalizeRoutePlan({
          primary: "WEBSITE",
          secondary: parsed1.secondary,
          constraints: parsed1.constraints,
        });
        routerDebugGroup("[router] stage1 corrected FOLLOW_UP→WEBSITE (topic shift)", () => {
          routerDebugLog("prompt:", prompt);
          routerDebugLog("memory:", opts?.memory ?? null);
          routerDebugLog("raw:", text1);
          routerDebugLog("plan_before:", parsed1);
          routerDebugLog("plan_after:", corrected);
        });
        return corrected;
      }

      // Guardrail: website questions should never be UNRELATED.
      if (parsed1.primary === "UNRELATED" && looksLikeWebsiteIntent(prompt)) {
        const corrected = normalizeRoutePlan({
          primary: "WEBSITE",
          secondary: websiteSecondaryFromPrompt(prompt),
          constraints: parsed1.constraints,
        });
        routerDebugGroup("[router] stage1 corrected UNRELATED→WEBSITE", () => {
          routerDebugLog("prompt:", prompt);
          routerDebugLog("memory:", opts?.memory ?? null);
          routerDebugLog("raw:", text1);
          routerDebugLog("plan_before:", parsed1);
          routerDebugLog("plan_after:", corrected);
        });
        return corrected;
      }

      routerDebugGroup(`[router] stage1 ok (attempt1) primary=${parsed1.primary}`, () => {
        routerDebugLog("prompt:", prompt);
        routerDebugLog("memory:", opts?.memory ?? null);
        routerDebugLog("raw:", text1);
        routerDebugLog("plan:", parsed1);
      });
      return parsed1;
    }

    routerDebugGroup("[router] stage1 parse failed (attempt1) → retry", () => {
      routerDebugLog("prompt:", prompt);
      routerDebugLog("memory:", opts?.memory ?? null);
      routerDebugLog("raw:", text1);
    });

    const res2 = await engine.chat.completions.create({
      ...baseRequest,
      messages: [
        { role: "system" as const, content: system },
        {
          role: "user" as const,
          content: [
            "Your previous output was invalid.",
            "Return ONLY the RoutePlan JSON object matching the schema. No extra keys, no extra text.",
            "",
            `User message: ${prompt}`,
            "",
            `Conversation memory:\n${memoryNote}`,
          ].join("\n"),
        },
      ],
    });
    const text2 = res2.choices?.[0]?.message?.content ?? "";
    const parsed2 = tryParseRoutePlan(text2);
    if (parsed2) {
      // Guardrail: FOLLOW_UP is only valid when there is actual prior context.
      if (parsed2.primary === "FOLLOW_UP" && !hasPriorContext(opts?.memory)) {
        const fallbackPrimary = heuristicFallback(prompt, opts?.memory).category as PrimaryCapability;
        const corrected = normalizeRoutePlan({
          primary: fallbackPrimary,
          secondary: parsed2.secondary,
          constraints: parsed2.constraints,
        });
        routerDebugGroup(`[router] stage1 corrected FOLLOW_UP→${corrected.primary} (no prior context)`, () => {
          routerDebugLog("prompt:", prompt);
          routerDebugLog("memory:", opts?.memory ?? null);
          routerDebugLog("raw:", text2);
          routerDebugLog("plan_before:", parsed2);
          routerDebugLog("plan_after:", corrected);
        });
        return corrected;
      }

      // Guardrail: topic shifts are allowed (same rule as attempt1).
      if (
        parsed2.primary === "FOLLOW_UP" &&
        hasPriorContext(opts?.memory) &&
        looksLikeWebsiteIntent(prompt) &&
        !looksLikeFollowUpReference(prompt)
      ) {
        const corrected = normalizeRoutePlan({
          primary: "WEBSITE",
          secondary: parsed2.secondary,
          constraints: parsed2.constraints,
        });
        routerDebugGroup("[router] stage1 corrected FOLLOW_UP→WEBSITE (topic shift)", () => {
          routerDebugLog("prompt:", prompt);
          routerDebugLog("memory:", opts?.memory ?? null);
          routerDebugLog("raw:", text2);
          routerDebugLog("plan_before:", parsed2);
          routerDebugLog("plan_after:", corrected);
        });
        return corrected;
      }

      // Guardrail: website questions should never be UNRELATED.
      if (parsed2.primary === "UNRELATED" && looksLikeWebsiteIntent(prompt)) {
        const corrected = normalizeRoutePlan({
          primary: "WEBSITE",
          secondary: websiteSecondaryFromPrompt(prompt),
          constraints: parsed2.constraints,
        });
        routerDebugGroup("[router] stage1 corrected UNRELATED→WEBSITE", () => {
          routerDebugLog("prompt:", prompt);
          routerDebugLog("memory:", opts?.memory ?? null);
          routerDebugLog("raw:", text2);
          routerDebugLog("plan_before:", parsed2);
          routerDebugLog("plan_after:", corrected);
        });
        return corrected;
      }

      routerDebugGroup(`[router] stage1 ok (attempt2) primary=${parsed2.primary}`, () => {
        routerDebugLog("prompt:", prompt);
        routerDebugLog("memory:", opts?.memory ?? null);
        routerDebugLog("raw:", text2);
        routerDebugLog("plan:", parsed2);
      });
      return parsed2;
    }

    routerDebugGroup("[router] stage1 parse failed (attempt2) → heuristic fallback", () => {
      routerDebugLog("prompt:", prompt);
      routerDebugLog("memory:", opts?.memory ?? null);
      routerDebugLog("raw:", text2);
    });

    const fallback = heuristicRouteFallback(prompt, opts?.memory);
    routerDebugGroup(`[router] stage1 heuristic primary=${fallback.primary}`, () => {
      routerDebugLog("prompt:", prompt);
      routerDebugLog("memory:", opts?.memory ?? null);
      routerDebugLog("plan:", fallback);
    });
    return fallback;
  } catch {
    // Never throw from stage-1 routing; fall back deterministically.
    const fallback = heuristicRouteFallback(prompt, opts?.memory);
    routerDebugGroup(`[router] stage1 exception → heuristic primary=${fallback.primary}`, () => {
      routerDebugLog("prompt:", prompt);
      routerDebugLog("memory:", opts?.memory ?? null);
      routerDebugLog("plan:", fallback);
    });
    return fallback;
  }
}

export async function classifyPrompt(
  prompt: string,
  opts?: {
    initProgressCallback?: InitProgressCallback;
    signal?: AbortSignal;
    memory?: RouterMemoryContext;
  }
): Promise<ScenarioClassification> {
  // Compatibility wrapper around the richer routePrompt().
  const plan = await routePrompt(prompt, opts);
  return { category: plan.primary as ScenarioCategory };
}


