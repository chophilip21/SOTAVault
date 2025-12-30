"use client";

import { CreateMLCEngine, type InitProgressCallback, type MLCEngineInterface } from "@mlc-ai/web-llm";

export const SELECTED_MODEL = "Llama-3.2-3B-Instruct-q4f16_1-MLC";

export type ScenarioCategory = "RAG_SEARCH" | "ML_NO_RAG" | "WEBSITE" | "UNRELATED";

export type ScenarioClassification = {
  category: ScenarioCategory;
};

const RESPONSE_SCHEMA = JSON.stringify({
  type: "object",
  additionalProperties: false,
  properties: {
    category: {
      type: "string",
      enum: ["RAG_SEARCH", "ML_NO_RAG", "WEBSITE", "UNRELATED"],
    },
  },
  required: ["category"],
});

let enginePromise: Promise<MLCEngineInterface> | null = null;

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

function tryParseClassification(raw: string): ScenarioClassification | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Fast path: valid JSON
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "category" in parsed &&
      (parsed as any).category &&
      ["RAG_SEARCH", "ML_NO_RAG", "WEBSITE", "UNRELATED"].includes((parsed as any).category)
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
      ["RAG_SEARCH", "ML_NO_RAG", "WEBSITE", "UNRELATED"].includes((parsed as any).category)
    ) {
      return { category: (parsed as any).category as ScenarioCategory };
    }
  } catch {
    return null;
  }

  return null;
}

function heuristicFallback(prompt: string): ScenarioClassification {
  // Conservative local fallback to avoid showing hallucinated content if the model misbehaves.
  const p = prompt.toLowerCase();

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
  if (websiteHints.some((h) => p.includes(h))) return { category: "WEBSITE" };

  const ragHints = [
    "find papers",
    "paper search",
    "search papers",
    "recommend papers",
    "recent papers",
    "latest papers",
    "arxiv",
    "cite",
    "citations",
    "references",
    "survey",
    "related work",
    "state of the art",
    "sota",
  ];
  if (ragHints.some((h) => p.includes(h))) return { category: "RAG_SEARCH" };

  const mlHints = [
    "machine learning",
    "deep learning",
    "neural network",
    "transformer",
    "llm",
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
  if (mlHints.some((h) => p.includes(h))) return { category: "ML_NO_RAG" };

  return { category: "UNRELATED" };
}

export async function classifyPrompt(
  prompt: string,
  opts?: {
    initProgressCallback?: InitProgressCallback;
    signal?: AbortSignal;
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
    "- WEBSITE: user asks about how to use this website/app (features, navigation, issues, accounts).",
    "- UNRELATED: anything else or if you are uncertain.",
    "",
    "If uncertain between categories, choose UNRELATED.",
  ].join("\n");

  // Use JSON mode + schema to hard-constrain output to a valid JSON object.
  const baseRequest = {
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: prompt },
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
        ].join("\n"),
      },
    ],
  });
  const text2 = res2.choices?.[0]?.message?.content ?? "";
  const parsed2 = tryParseClassification(text2);
  if (parsed2) return parsed2;

  // Final fallback: do not surface model text; return a conservative heuristic classification.
  return heuristicFallback(prompt);
}


