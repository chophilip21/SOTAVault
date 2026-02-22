"use client";

import { config } from "@/lib/config";

// Inline CDN config for wllama WASM (avoids resolving package subpath in Next/Turbopack).
const WLLAMA_WASM_CDN = {
  "single-thread/wllama.wasm": "https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/esm/single-thread/wllama.wasm",
  "multi-thread/wllama.wasm": "https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/esm/multi-thread/wllama.wasm",
};

export type InitProgressCallback = (r: { progress: number; text: string }) => void;

// Optional approximate download size (MB) for UI. Leave null; user sees progress during download.
export function approxModelSizeMb(_modelId: string, _dtype?: string): number | null {
  return null;
}

export function approxTotalDownloadMb(): number | null {
  return null;
}

export type LlmRole = "system" | "user" | "assistant";
export type LlmMessage = { role: LlmRole; content: string };

type BackendInfo = {
  device: "wasm";
  dtype: string;
  modelId: string;
  webgpuAvailable: boolean;
  crossOriginIsolated: boolean;
  sharedArrayBuffer: boolean;
  wasmNumThreads: number | null;
};

let lastChatBackend: BackendInfo | null = null;
let lastEmbedBackend: BackendInfo | null = null;

export function getLastBackendInfo(): { chat: BackendInfo | null; embed: BackendInfo | null } {
  return { chat: lastChatBackend, embed: lastEmbedBackend };
}

type WllamaInstance = Awaited<ReturnType<typeof loadWllama>>;
let wllamaChatInstance: WllamaInstance | null = null;
let wllamaEmbedInstance: WllamaInstance | null = null;
let chatLoadPromise: Promise<WllamaInstance> | null = null;
let embedLoadPromise: Promise<WllamaInstance> | null = null;

async function loadWllama(): Promise<{
  createCompletion: (prompt: string, opts: unknown) => Promise<string>;
  createEmbedding: (text: string) => Promise<number[]>;
  loadModelFromUrl: (url: string, opts?: unknown) => Promise<void>;
  loadModelFromHF: (modelId: string, filePath: string, opts?: unknown) => Promise<void>;
}> {
  const { Wllama } = await import("@wllama/wllama");
  return new Wllama(WLLAMA_WASM_CDN) as unknown as WllamaInstance;
}

export function resetLocalPipelines() {
  chatLoadPromise = null;
  embedLoadPromise = null;
  wllamaChatInstance = null;
  wllamaEmbedInstance = null;
  lastChatBackend = null;
  lastEmbedBackend = null;
}

function getChatModelConfig(): { modelId: string; filePath: string } {
  const modelId = (config.wllamaChatModelId || "").trim();
  const filePath = (config.wllamaChatFile || "").trim();
  if (!modelId || !filePath) {
    throw new Error(
      "Chat model not configured. Set NEXT_PUBLIC_WLLAMA_CHAT_MODEL_ID and NEXT_PUBLIC_WLLAMA_CHAT_FILE in config.ini."
    );
  }
  return { modelId, filePath };
}

function getEmbedModelConfig(): { modelId: string; filePath: string } {
  const modelId = (config.wllamaEmbedModelId || "").trim();
  const filePath = (config.wllamaEmbedFile || "").trim();
  if (!modelId || !filePath) {
    throw new Error(
      "Embedding model not configured. Set NEXT_PUBLIC_WLLAMA_EMBED_MODEL_ID and NEXT_PUBLIC_WLLAMA_EMBED_FILE in config.ini."
    );
  }
  return { modelId, filePath };
}

/** Same URL format wllama uses for loadModelFromHF (OPFS cache key). */
function hfUrl(modelId: string, filePath: string): string {
  return `https://huggingface.co/${modelId}/resolve/main/${filePath}`;
}

/** Probe OPFS cache (persistent across refresh) for a model URL. No download. */
async function isModelInCache(modelId: string, filePath: string): Promise<boolean> {
  try {
    const { Wllama } = await import("@wllama/wllama");
    const w = new Wllama(WLLAMA_WASM_CDN) as unknown as { cacheManager: { list: () => Promise<{ metadata: { originalURL: string } }[]> } };
    const list = await w.cacheManager.list();
    const url = hfUrl(modelId, filePath);
    return list.some((e) => e.metadata?.originalURL === url);
  } catch {
    return false;
  }
}

async function getWllamaChat(args?: { initProgressCallback?: InitProgressCallback }): Promise<WllamaInstance> {
  if (wllamaChatInstance) return wllamaChatInstance;
  if (chatLoadPromise) return chatLoadPromise;

  const { modelId, filePath } = getChatModelConfig();
  const report = (p: number, text: string) => {
    try {
      args?.initProgressCallback?.({ progress: p, text });
    } catch {
      /* ignore */
    }
  };

  report(0.02, "Initializing wllama (chat model)…");

  chatLoadPromise = (async () => {
    const wllama = await loadWllama();
    await wllama.loadModelFromHF(modelId, filePath, {
      n_ctx: 2048, // Avoid "n_ctx_seq (1024) > n_ctx" when prompt + generation exceeds model default
      parallelDownloads: 5,
      useCache: true,
      progressCallback: ({ loaded, total }: { loaded: number; total: number }) => {
        const p = total > 0 ? loaded / total : 0;
        const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
        report(0.05 + p * 0.45, `Downloading chat model… ${percent}%`);
      },
    });

    report(0.5, "Chat model ready");
    wllamaChatInstance = wllama;
    const hasSAB = typeof (globalThis as unknown as { SharedArrayBuffer?: unknown }).SharedArrayBuffer === "function";
    const nThreads = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : null;
    lastChatBackend = {
      device: "wasm",
      dtype: "gguf",
      modelId: `${modelId}/${filePath}`,
      webgpuAvailable: false,
      crossOriginIsolated: typeof crossOriginIsolated !== "undefined" ? crossOriginIsolated : false,
      sharedArrayBuffer: hasSAB,
      wasmNumThreads: nThreads,
    };
    return wllama;
  })();

  return chatLoadPromise;
}

async function getWllamaEmbed(args?: { initProgressCallback?: InitProgressCallback }): Promise<WllamaInstance> {
  if (wllamaEmbedInstance) return wllamaEmbedInstance;
  if (embedLoadPromise) return embedLoadPromise;

  const { modelId, filePath } = getEmbedModelConfig();
  const report = (p: number, text: string) => {
    try {
      args?.initProgressCallback?.({ progress: p, text });
    } catch {
      /* ignore */
    }
  };

  report(0.52, "Initializing embedding model…");

  embedLoadPromise = (async () => {
    const wllama = await loadWllama();
    await wllama.loadModelFromHF(modelId, filePath, {
      n_ctx: 512, // Match n_ctx_train for Arctic embed; 2048 caused overflow + high RAM/CPU
      n_threads: Math.min(2, Math.floor((typeof navigator !== "undefined" ? navigator.hardwareConcurrency : 2) / 2)), // Cap CPU load
      embeddings: true, // Required for createEmbedding (embedding models)
      parallelDownloads: 5,
      useCache: true,
      progressCallback: ({ loaded, total }: { loaded: number; total: number }) => {
        const p = total > 0 ? loaded / total : 0;
        const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
        report(0.52 + p * 0.45, `Downloading embedding model… ${percent}%`);
      },
    });

    report(0.98, "Embedding model ready");
    wllamaEmbedInstance = wllama;
    const hasSAB = typeof (globalThis as unknown as { SharedArrayBuffer?: unknown }).SharedArrayBuffer === "function";
    const nThreads = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : null;
    lastEmbedBackend = {
      device: "wasm",
      dtype: "gguf",
      modelId: `${modelId}/${filePath}`,
      webgpuAvailable: false,
      crossOriginIsolated: typeof crossOriginIsolated !== "undefined" ? crossOriginIsolated : false,
      sharedArrayBuffer: hasSAB,
      wasmNumThreads: nThreads,
    };
    return wllama;
  })();

  return embedLoadPromise;
}

export async function getChatPipeline(initProgressCallback?: InitProgressCallback) {
  const wllama = await getWllamaChat({ initProgressCallback });
  return (prompt: string, opts: Record<string, unknown>) =>
    wllama.createCompletion(prompt, {
      nPredict: Math.max(1, Math.min(768, Number(opts.max_new_tokens) || 256)),
      sampling: {
        temp: Number(opts.temperature ?? 0),
        top_p: Number(opts.top_p ?? 1),
      },
    });
}

export async function getEmbedPipeline(initProgressCallback?: InitProgressCallback) {
  const wllama = await getWllamaEmbed({ initProgressCallback });
  return (input: string) => wllama.createEmbedding(input);
}

const SYSTEM_DIRECT_RESPONSE =
  "Respond directly and concisely. Do not use internal thought tags or headers. Start your response immediately with the answer.";

/** Strip model artifacts that leak into user-visible text (e.g. <|/final_answer/|>, </|end_header_id>>). */
export function stripInternalTags(text: string): string {
  return (text || "")
    .replace(/<\|[^|>]*\|>/g, "") // <|/final_answer/|>, <|end_header_id|>, etc.
    .replace(/<\/\|[^>]*>+/g, "") // </|end_header_id>>, etc.
    .replace(/\s*<\|[^>]+>\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function llama3ChatTemplate(messages: LlmMessage[]): string {
  const esc = (s: string) => (s || "").trim();
  const rawSys = messages.filter((m) => m.role === "system").map((m) => esc(m.content)).join("\n\n");
  const sys = rawSys
    ? `${rawSys}\n\n${SYSTEM_DIRECT_RESPONSE}`
    : `You are a helpful assistant. ${SYSTEM_DIRECT_RESPONSE}`;
  const rest = messages.filter((m) => m.role !== "system");

  let out = "<|begin_of_text|>";
  out += `<|start_header_id|>system<|end_header_id|>\n${sys}\n<|eot_id|>`;

  for (const m of rest) {
    const role = m.role === "user" ? "user" : "assistant";
    out += `<|start_header_id|>${role}<|end_header_id|>\n${esc(m.content)}\n<|eot_id|>`;
  }
  out += "<|start_header_id|>assistant<|end_header_id|>\n";
  return out;
}

export async function generateTextFromMessages(
  messages: LlmMessage[],
  opts?: { maxNewTokens?: number; temperature?: number; topP?: number; seed?: number }
): Promise<string> {
  const gen = await getChatPipeline();
  const prompt = llama3ChatTemplate(messages);

  const result = await gen(prompt, {
    max_new_tokens: opts?.maxNewTokens ?? 256,
    temperature: opts?.temperature ?? 0,
    top_p: opts?.topP ?? 1,
  });

  const raw = (typeof result === "string" ? result : String(result ?? "")).trim();
  return stripInternalTags(raw);
}

/** Kept short to fit embed model n_ctx (512 tokens ≈ ~1500 chars). */
export function cleanEmbeddingText(text: string): string {
  return (text || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[`*#>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1500);
}

export async function embedText(text: string, opts?: { initProgressCallback?: InitProgressCallback }): Promise<number[]> {
  const extractor = await getEmbedPipeline(opts?.initProgressCallback);
  const input = cleanEmbeddingText(text);
  if (!input) throw new Error("Empty embedding input.");

  const vec = await extractor(input);
  if (!Array.isArray(vec)) throw new Error("Failed to compute embedding.");

  const out = vec.map((x: unknown) => Number(x));
  if (out.length !== config.embeddingDim) {
    throw new Error(`Embedding dim mismatch: expected ${config.embeddingDim}, got ${out.length}`);
  }
  return out;
}

export async function loadChatPipelineFromCache(): Promise<boolean> {
  if (chatLoadPromise || wllamaChatInstance) return true;
  try {
    const { modelId, filePath } = getChatModelConfig();
    return await isModelInCache(modelId, filePath);
  } catch {
    return false;
  }
}

export async function loadEmbedPipelineFromCache(): Promise<boolean> {
  if (embedLoadPromise || wllamaEmbedInstance) return true;
  try {
    const { modelId, filePath } = getEmbedModelConfig();
    return await isModelInCache(modelId, filePath);
  } catch {
    return false;
  }
}

export async function clearWllamaModelCache(): Promise<{ cachesDeleted: string[]; idbDeleted: string[] }> {
  resetLocalPipelines();
  const cachesDeleted: string[] = [];
  try {
    const { Wllama } = await import("@wllama/wllama");
    const w = new Wllama(WLLAMA_WASM_CDN) as unknown as {
      cacheManager: {
        list: () => Promise<{ name: string; metadata?: { originalURL?: string } }[]>;
        deleteMany: (predicate: (e: { metadata?: { originalURL?: string } }) => boolean) => Promise<void>;
      };
    };
    const chatUrl = (() => {
      try {
        const { modelId, filePath } = getChatModelConfig();
        return hfUrl(modelId, filePath);
      } catch {
        return null;
      }
    })();
    const embedUrl = (() => {
      try {
        const { modelId, filePath } = getEmbedModelConfig();
        return hfUrl(modelId, filePath);
      } catch {
        return null;
      }
    })();
    const list = await w.cacheManager.list();
    const toDelete = new Set([chatUrl, embedUrl].filter(Boolean) as string[]);
    if (toDelete.size > 0) {
      await w.cacheManager.deleteMany((entry) => {
        const url = entry.metadata?.originalURL;
        if (url && toDelete.has(url)) {
          cachesDeleted.push(url);
          return true;
        }
        return false;
      });
    }
  } catch (_) {
    // OPFS / cache may be unavailable; in-memory state is already reset
  }
  return { cachesDeleted: [...new Set(cachesDeleted)], idbDeleted: [] };
}

// Alias for compatibility with agent.ts
export const clearTransformersModelCache = clearWllamaModelCache;
