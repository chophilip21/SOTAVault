"use client";

import { CreateMLCEngine, type InitProgressCallback, type MLCEngineInterface } from "@mlc-ai/web-llm";


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

const RESPONSE_SCHEMA = JSON.stringify({
  type: "object",
  additionalProperties: false,
  properties: {
    category: {
      type: "string",
      enum: ["RAG_SEARCH", "ML_NO_RAG", "FOLLOW_UP", "WEBSITE", "AMBIGUOUS", "UNRELATED"],
    },
  },
  required: ["category"],
});

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
  if (websiteHints.some((h) => p.includes(h))) push("WEBSITE");

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
  if ((memory?.summary || (memory?.recentTurns?.length ?? 0) > 0) && /\b(this|that|those|them|it|previous|above|again)\b/.test(p)) {
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

export async function classifyPrompt(
  prompt: string,
  opts?: {
    initProgressCallback?: InitProgressCallback;
    signal?: AbortSignal;
    memory?: RouterMemoryContext;
  }
): Promise<ScenarioClassification> {
  const engine = await getWebLLMEngine(opts?.initProgressCallback);

  // We keep the task purely classification + strictly structured output.
  const system = [
    "You are a router that must classify the user's message into exactly ONE category.",
    "",
    "Return ONLY a JSON object that matches this schema:",
    RESPONSE_SCHEMA,
    "",
    "Categories:",
    '- RAG_SEARCH: user asks to search / find / recommend ML papers, requests citations/references, or needs retrieval over papers.',
    "- ML_NO_RAG: user asks about machine learning concepts but does not need searching papers.",
    "- FOLLOW_UP: the user is asking a follow-up that depends on prior conversation or previously provided papers/results/context.",
    "- WEBSITE: user asks about how to use this website/app (features, navigation, issues, accounts).",
    "- AMBIGUOUS: the message could plausibly belong to multiple categories (e.g., both search + explanation) or lacks clarity to route confidently.",
    "- UNRELATED: anything else that is clearly outside the app/ML scope.",
    "",
    "Important rules:",
    "- If the user asks to show/list/find/recommend papers (even without saying 'search'), choose RAG_SEARCH.",
    "- If the user asks to explain a concept (e.g., LoRA vs fine-tuning) and does NOT ask for papers/citations, choose ML_NO_RAG.",
    "- If the user refers back to prior answers, papers, or says things like 'those', 'that one', 'the previous results', or otherwise depends on earlier context, choose FOLLOW_UP.",
    "- If the intent overlaps categories or you are unsure between categories, choose AMBIGUOUS (not UNRELATED).",
    "",
    "Examples:",
    'User: "show me object detection related papers" -> {"category":"RAG_SEARCH"}',
    'User: "Explain the difference between LoRA and full fine-tuning" -> {"category":"ML_NO_RAG"}',
    'User: "Can you summarize those papers you just showed?" -> {"category":"FOLLOW_UP"}',
    'User: "How do I bookmark papers on this website?" -> {"category":"WEBSITE"}',
    'User: "I need papers on transformers and also explain how they work" -> {"category":"AMBIGUOUS"}',
    'User: "What is the best pizza in town?" -> {"category":"UNRELATED"}',
    "",
    "If uncertain between categories, choose AMBIGUOUS. Use UNRELATED only when the request is clearly outside the app/ML domain.",
  ].join("\n");

  const memoryNote = formatMemoryForRouter(opts?.memory);
  const userContent = opts?.memory
    ? ["User message:", prompt, "", "Conversation memory (for routing only):", memoryNote].join("\n")
    : prompt;

  // Use JSON mode + schema to hard-constrain output to a valid JSON object.
  const baseRequest = {
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: userContent },
    ],
    temperature: 0,
    top_p: 1,
    max_tokens: 30,
    seed: 1,
    response_format: { type: "json_object" as const, schema: RESPONSE_SCHEMA },
  };

  // Attempt 1: normal request
  const res1 = await engine.chat.completions.create(baseRequest);
  const text1 = res1.choices?.[0]?.message?.content ?? "";
  const parsed1 = tryParseClassification(text1);
  if (parsed1) return parsed1;

  // Attempt 2: explicitly point out the invalid response and force strict JSON only.
  const res2 = await engine.chat.completions.create({
    ...baseRequest,
    messages: [
      { role: "system" as const, content: system },
      {
        role: "user" as const,
        content: [
          "Your previous output was invalid.",
          "Return ONLY the JSON object with the schema, no other keys, no extra text.",
          "",
          `User message: ${prompt}`,
          "",
          `Conversation memory:\n${memoryNote}`,
        ].join("\n"),
      },
    ],
  });
  const text2 = res2.choices?.[0]?.message?.content ?? "";
  const parsed2 = tryParseClassification(text2);
  if (parsed2) return parsed2;

  // Final fallback: do not surface model text; return a conservative heuristic classification.
  return heuristicFallback(prompt, opts?.memory);
}


