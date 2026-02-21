"use client";

import { config } from "@/lib/config";

// Inline CDN config for wllama WASM (avoids resolving package subpath in Next/Turbopack).
const WLLAMA_WASM_CDN = {
  "single-thread/wllama.wasm": "https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/esm/single-thread/wllama.wasm",
  "multi-thread/wllama.wasm": "https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/esm/multi-thread/wllama.wasm",
};

export type InitProgressCallback = (r: { progress: number; text: string }) => void;

// Optional approximate download size (MB) for UI. Leave null; user provides GGUF later.
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
let wllamaInstance: WllamaInstance | null = null;
let chatLoadPromise: Promise<WllamaInstance> | null = null;
let embedLoadPromise: Promise<WllamaInstance> | null = null;

async function loadWllama(): Promise<{ createCompletion: (prompt: string, opts: unknown) => Promise<string>; createEmbedding: (text: string) => Promise<number[]>; loadModelFromUrl: (url: string, opts?: unknown) => Promise<void>; loadModelFromHF: (modelId: string, filePath: string, opts?: unknown) => Promise<void> }> {
  const { Wllama } = await import("@wllama/wllama");
  return new Wllama(WLLAMA_WASM_CDN) as unknown as WllamaInstance;
}

export function resetLocalPipelines() {
  chatLoadPromise = null;
  embedLoadPromise = null;
  wllamaInstance = null;
  lastChatBackend = null;
  lastEmbedBackend = null;
}

function getGgufUrl(): string {
  const url = (config.wllamaGgufUrl || "").trim();
  if (!url) {
    throw new Error(
      "GGUF model URL not configured. Set NEXT_PUBLIC_WLLAMA_GGUF_URL in config.ini (e.g. a Hugging Face URL)."
    );
  }
  return url;
}

async function getWllamaChat(args?: { initProgressCallback?: InitProgressCallback }): Promise<WllamaInstance> {
  if (wllamaInstance) return wllamaInstance;
  if (chatLoadPromise) return chatLoadPromise;

  const url = getGgufUrl();
  const report = (p: number, text: string) => {
    try {
      args?.initProgressCallback?.({ progress: p, text });
    } catch {
      /* ignore */
    }
  };

  report(0.02, "Initializing wllama (CPU, multi-threaded)…");

  chatLoadPromise = (async () => {
    const wllama = await loadWllama();
    const progressCallback = ({ loaded, total }: { loaded: number; total: number }) => {
      const p = total > 0 ? loaded / total : 0;
      report(0.05 + p * 0.9, `Downloading model… ${total > 0 ? Math.round((loaded / total) * 100) : 0}%`);
    };

    if (url.startsWith("http://") || url.startsWith("https://")) {
      await wllama.loadModelFromUrl(url, { progressCallback });
    } else {
      // Hugging Face: "org/repo/path/to/file.gguf" -> modelId = org/repo, filePath = path/to/file.gguf
      const segments = url.split("/").filter(Boolean);
      if (segments.length < 2) {
        throw new Error("NEXT_PUBLIC_WLLAMA_GGUF_URL for HF must be org/repo/path/to/file.gguf");
      }
      const modelId = `${segments[0]}/${segments[1]}`;
      const filePath = segments.slice(2).join("/");
      await wllama.loadModelFromHF(modelId, filePath, { progressCallback });
    }

    report(1, "Model ready");
    wllamaInstance = wllama;
    const hasSAB = typeof (globalThis as unknown as { SharedArrayBuffer?: unknown }).SharedArrayBuffer === "function";
    const nThreads = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : null;
    lastChatBackend = {
      device: "wasm",
      dtype: "gguf",
      modelId: url,
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
  // Use same model as chat for now; can be split later (e.g. separate embed GGUF URL).
  return getWllamaChat(args);
}

export async function getChatPipeline(initProgressCallback?: InitProgressCallback) {
  const wllama = await getWllamaChat({ initProgressCallback });
  return (prompt: string, opts: Record<string, unknown>) =>
    wllama.createCompletion(prompt, {
      nPredict: Math.max(1, Math.min(1024, Number(opts.max_new_tokens) || 256)),
      sampling: {
        temp: Number(opts.temperature ?? 0),
        top_p: Number(opts.top_p ?? 1),
      },
    });
}

export async function getEmbedPipeline(initProgressCallback?: InitProgressCallback) {
  const wllama = await getWllamaEmbed({ initProgressCallback });
  lastEmbedBackend = lastChatBackend;
  return (input: string) => wllama.createEmbedding(input);
}

function llama3ChatTemplate(messages: LlmMessage[]): string {
  const esc = (s: string) => (s || "").trim();
  const sys = messages.filter((m) => m.role === "system").map((m) => esc(m.content)).join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");

  let out = "<|begin_of_text|>";
  out += `<|start_header_id|>system<|end_header_id|>\n${sys || "You are a helpful assistant."}\n<|eot_id|>`;

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

  return (typeof result === "string" ? result : String(result ?? "")).trim();
}

export function cleanEmbeddingText(text: string): string {
  return (text || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[`*#>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
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

async function checkBrowserCache(_modelId: string): Promise<boolean> {
  // wllama may cache in IndexedDB; for simplicity we consider "cached" if the model is already loaded.
  return wllamaInstance !== null;
}

export async function loadChatPipelineFromCache(): Promise<boolean> {
  if (chatLoadPromise) return true;
  return checkBrowserCache(config.wllamaGgufUrl || "");
}

export async function loadEmbedPipelineFromCache(): Promise<boolean> {
  if (embedLoadPromise) return true;
  return loadChatPipelineFromCache();
}

export async function clearWllamaModelCache(): Promise<{ cachesDeleted: string[]; idbDeleted: string[] }> {
  resetLocalPipelines();
  // Optionally clear IndexedDB/caches used by wllama if the library exposes cache names.
  return { cachesDeleted: [], idbDeleted: [] };
}

// Alias for compatibility with agent.ts
export const clearTransformersModelCache = clearWllamaModelCache;
