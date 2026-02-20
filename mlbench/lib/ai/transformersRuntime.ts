"use client";

import { env as hfEnv, pipeline, type ProgressCallback } from "@huggingface/transformers";

import { config } from "@/lib/config";

export type InitProgressCallback = (r: { progress: number; text: string }) => void;

// ── Approximate download sizes ────────────────────────────────────────────────
// Key: "<modelId>:<dtype>"  or  "<modelId>"  (dtype-agnostic fallback).
// Values are in MB (rounded to nearest 10). Used only for UI display.
const APPROX_SIZE_MB: Record<string, number> = {
  // HuggingFaceTB/SmolLM2-360M-Instruct (ONNX variants under onnx/)
  // Source: https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct/tree/main/onnx
  "HuggingFaceTB/SmolLM2-360M-Instruct:q4f16": 280,  // onnx/model_q4f16.onnx ≈ 273 MB
  "HuggingFaceTB/SmolLM2-360M-Instruct:q4":    400,  // onnx/model_q4.onnx    ≈ 388 MB
  "HuggingFaceTB/SmolLM2-360M-Instruct:int8":  370,  // onnx/model_int8.onnx  ≈ 365 MB
  "HuggingFaceTB/SmolLM2-360M-Instruct:fp16":  730,  // onnx/model_fp16.onnx  ≈ 725 MB
  "HuggingFaceTB/SmolLM2-360M-Instruct:fp32":  1450, // onnx/model.onnx       ≈ 1.45 GB
  // onnx-community/Llama-3.2-1B-Instruct
  "onnx-community/Llama-3.2-1B-Instruct:q4f16": 640,
  "onnx-community/Llama-3.2-1B-Instruct:q4":    640,
  "onnx-community/Llama-3.2-1B-Instruct:q8":    1200,
  "onnx-community/Llama-3.2-1B-Instruct:fp32":  4800,
  // Snowflake Arctic Embed S (33M params)
  "Snowflake/snowflake-arctic-embed-s:fp32": 130,
  "Snowflake/snowflake-arctic-embed-s:q8":    70,
  "Snowflake/snowflake-arctic-embed-s:q4":    40,
};

export function approxModelSizeMb(modelId: string, dtype: string): number | null {
  return APPROX_SIZE_MB[`${modelId}:${dtype}`] ?? APPROX_SIZE_MB[modelId] ?? null;
}

export function approxTotalDownloadMb(): number | null {
  const chat  = approxModelSizeMb(config.transformersChatModel,  config.transformersChatDtype  || "q4");
  const embed = approxModelSizeMb(config.transformersEmbedModel, config.transformersEmbedDtype || "fp32");
  if (chat === null && embed === null) return null;
  return (chat ?? 0) + (embed ?? 0);
}

export type LlmRole = "system" | "user" | "assistant";
export type LlmMessage = { role: LlmRole; content: string };

type TextGenResult = { generated_text?: string; text?: string };
type TextGenPipeline = (input: string, opts: Record<string, unknown>) => Promise<TextGenResult | TextGenResult[]>;
type EmbedPipeline = (input: string, opts: Record<string, unknown>) => Promise<unknown>;

let chatPipePromise: Promise<TextGenPipeline> | null = null;
let embedPipePromise: Promise<EmbedPipeline> | null = null;

export function resetLocalPipelines() {
  chatPipePromise = null;
  embedPipePromise = null;
}

const _logged = new Set<string>();
function logOnce(key: string, ...args: unknown[]) {
  if (typeof window === "undefined") return;
  if (_logged.has(key)) return;
  _logged.add(key);
  // eslint-disable-next-line no-console
  console.log(...args);
}

type ProgressInfo =
  | { status: "initiate"; name: string; file: string }
  | { status: "download"; name: string; file: string }
  | { status: "progress"; name: string; file: string; progress: number; loaded: number; total: number }
  | { status: "done"; name: string; file: string }
  | { status: "ready"; task: string; model: string };

function report(cb: InitProgressCallback | undefined, progress: number, text: string) {
  try {
    cb?.({ progress, text });
  } catch {
    // ignore UI callback errors
  }
}

function createAggregatingProgressReporter(cb: InitProgressCallback | undefined, opts: { label: string }) {
  // Transformers.js emits per-file progress (0..100). Aggregate it so the UI is stable.
  const byFile = new Map<string, number>(); // file -> 0..1
  let lastText = `${opts.label}: starting`;
  let lastTextAt = 0;
  let maxEmitted = 0; // enforce monotonic progress

  const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const shouldUpdateText = (next: string) => {
    const t = nowMs();
    if (next === lastText) return false;
    // Debounce rapid shard switching to avoid flicker.
    if (t - lastTextAt < 250) return false;
    lastText = next;
    lastTextAt = t;
    return true;
  };

  const overall = () => {
    if (byFile.size === 0) return 0;
    let sum = 0;
    for (const v of byFile.values()) sum += v;
    return sum / byFile.size;
  };

  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

  const emit = (p01: number, text: string) => {
    // Keep a bit of headroom for "finalizing".
    const scaled = 0.05 + clamp01(p01) * 0.9;
    maxEmitted = Math.max(maxEmitted, scaled);
    report(cb, maxEmitted, text);
  };

  const onProgress: ProgressCallback = (p: unknown) => {
    if (!cb) return;
    const info = p as Partial<ProgressInfo> | null;
    const status = typeof info?.status === "string" ? info.status : "progress";
    const file = typeof (info as any)?.file === "string" ? String((info as any).file) : "";

    if (status === "progress") {
      const pct = typeof (info as any)?.progress === "number" ? Number((info as any).progress) : 0;
      // In Transformers.js, progress is 0..100.
      const p01 = clamp01(pct / 100);
      if (file) byFile.set(file, p01);
      const text = file ? `${opts.label}: ${file}` : `${opts.label}: downloading`;
      emit(overall(), shouldUpdateText(text) ? text : lastText);
      return;
    }

    if (status === "initiate" || status === "download") {
      const text = file ? `${opts.label}: ${status} ${file}` : `${opts.label}: ${status}`;
      emit(overall(), shouldUpdateText(text) ? text : lastText);
      return;
    }

    if (status === "done") {
      if (file) byFile.set(file, 1);
      const text = file ? `${opts.label}: cached ${file}` : `${opts.label}: cached`;
      emit(overall(), shouldUpdateText(text) ? text : lastText);
      return;
    }

    if (status === "ready") {
      emit(1, `${opts.label}: ready`);
    }
  };

  return onProgress;
}

function isWebGpuAvailable(): boolean {
  const nav = typeof navigator === "undefined" ? null : (navigator as unknown as { gpu?: unknown });
  return !!nav?.gpu;
}

function pickDevice(): "webgpu" | "wasm" {
  const preferred = String(config.transformersDevice || "webgpu").toLowerCase();
  if (preferred === "wasm") return "wasm";
  return isWebGpuAvailable() ? "webgpu" : "wasm";
}

function configureOnnxThreads() {
  // When crossOriginIsolated is true (COOP+COEP headers are working), SharedArrayBuffer
  // is available and ONNX Runtime Web can use multiple WASM threads. Set the thread count
  // to the number of logical CPUs so WASM inference is as fast as possible on fallback.
  const hasSAB = typeof (globalThis as any).SharedArrayBuffer === "function";
  if (hasSAB && typeof navigator !== "undefined" && navigator.hardwareConcurrency > 1) {
    const threads = Math.min(navigator.hardwareConcurrency, 8);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (hfEnv as any).backends.onnx.wasm.numThreads = threads;
      logOnce("onnx-threads", `[transformers] WASM thread count set to ${threads} (crossOriginIsolated, SAB available)`);
    } catch {
      // Ignore — not all versions expose this path.
    }
  } else {
    logOnce(
      "onnx-threads-warn",
      "[transformers] WARNING: crossOriginIsolated is false — SharedArrayBuffer unavailable, WASM will run single-threaded.",
      "Fix: ensure COOP: same-origin + COEP: credentialless headers are served on /ai-chat (check middleware.ts)."
    );
  }
}

function extractExecutionProviders(pipe: unknown): string[] | null {
  const p = pipe as any;
  const model = p?.model;
  const out: string[] = [];

  const push = (v: unknown) => {
    if (typeof v !== "string") return;
    if (!out.includes(v)) out.push(v);
  };

  const fromSessionLike = (s: any) => {
    const eps = s?.session_options?.executionProviders ?? s?.executionProviders ?? s?.options?.executionProviders;
    if (Array.isArray(eps)) for (const e of eps) push(e);
  };

  const direct = model?.session_options?.executionProviders;
  if (Array.isArray(direct)) for (const e of direct) push(e);

  const sessions = model?.sessions ?? model?.session ?? null;
  if (sessions) {
    if (sessions instanceof Map) {
      for (const s of sessions.values()) fromSessionLike(s);
    } else if (Array.isArray(sessions)) {
      for (const s of sessions) fromSessionLike(s);
    } else {
      fromSessionLike(sessions);
    }
  }

  return out.length ? out : null;
}

function logBackendDiagnostics(label: string, requestedDevice: string, dtype: string, pipe: unknown) {
  const webgpuAvailable = isWebGpuAvailable();
  const crossIso = typeof crossOriginIsolated !== "undefined" ? crossOriginIsolated : false;
  const hasSAB = typeof (globalThis as any).SharedArrayBuffer === "function";
  const eps = extractExecutionProviders(pipe);

  logOnce(
    `transformers-backend:${label}:${requestedDevice}`,
    `[transformers] ${label} pipeline initialized`,
    {
      requestedDevice,
      dtype,
      webgpuAvailable,
      crossOriginIsolated: crossIso,
      sharedArrayBuffer: hasSAB,
      allowRemoteModels: hfEnv.allowRemoteModels,
      useBrowserCache: hfEnv.useBrowserCache,
      useWasmCache: hfEnv.useWasmCache,
      cacheKey: hfEnv.cacheKey,
      executionProviders: eps ?? "(unknown — check ort-web session internals)",
    }
  );
}

function ensureSupportedModelId(modelId: string) {
  // MLC-built model IDs typically end with "-MLC" and cannot be loaded by Transformers.js.
  if (/-MLC\b/i.test(modelId)) {
    throw new Error(
      [
        "This model id looks like an MLC-built model, which Transformers.js can't load:",
        modelId,
        "Set NEXT_PUBLIC_TRANSFORMERS_CHAT_MODEL to an ONNX/HF model id (e.g. onnx-community/...).",
      ].join(" ")
    );
  }
}

async function createChatPipeline(args: {
  initProgressCallback?: InitProgressCallback;
}): Promise<TextGenPipeline> {
  const modelId = config.transformersChatModel;
  const dtype = config.transformersChatDtype || "q4f16";
  ensureSupportedModelId(modelId);
  configureOnnxThreads();

  const requestedDevice = pickDevice();
  logOnce("transformers-chat-request", "[transformers] requesting chat pipeline", { requestedDevice, dtype, modelId });
  report(args.initProgressCallback, 0.01, `Loading chat model (${requestedDevice}, ${dtype})`);

  const progress_callback = createAggregatingProgressReporter(args.initProgressCallback, { label: "Chat model" });

  // Try the preferred device. WebGPU can fail silently or throw in some browsers
  // (e.g. Chrome without crossOriginIsolated). Fall back to WASM automatically.
  let pipe: TextGenPipeline;
  let actualDevice: "webgpu" | "wasm" = requestedDevice;
  try {
    pipe = (await pipeline("text-generation", modelId, {
      device: requestedDevice,
      dtype,
      progress_callback,
    })) as unknown as TextGenPipeline;
  } catch (err) {
    if (requestedDevice === "webgpu") {
      logOnce("webgpu-chat-fallback", "[transformers] WebGPU init failed for chat model — falling back to WASM.", err);
      report(args.initProgressCallback, 0.01, "WebGPU unavailable, retrying on WASM…");
      actualDevice = "wasm";
      pipe = (await pipeline("text-generation", modelId, {
        device: "wasm",
        dtype,
        progress_callback,
      })) as unknown as TextGenPipeline;
    } else {
      throw err;
    }
  }

  report(args.initProgressCallback, 0.98, "Finalizing chat model");
  logBackendDiagnostics("chat", actualDevice, dtype, pipe);
  return pipe;
}

async function createEmbedPipeline(args: {
  initProgressCallback?: InitProgressCallback;
}): Promise<EmbedPipeline> {
  const modelId = config.transformersEmbedModel;
  const dtype = config.transformersEmbedDtype || "fp32";
  ensureSupportedModelId(modelId);
  const requestedDevice = pickDevice();
  logOnce("transformers-embed-request", "[transformers] requesting embed pipeline", { requestedDevice, dtype, modelId });
  report(args.initProgressCallback, 0.01, `Loading embedding model (${requestedDevice}, ${dtype})`);

  const progress_callback = createAggregatingProgressReporter(args.initProgressCallback, { label: "Embedding model" });

  let pipe: EmbedPipeline;
  let actualDevice: "webgpu" | "wasm" = requestedDevice;
  try {
    pipe = (await pipeline("feature-extraction", modelId, {
      device: requestedDevice,
      dtype,
      progress_callback,
    })) as unknown as EmbedPipeline;
  } catch (err) {
    if (requestedDevice === "webgpu") {
      logOnce("webgpu-embed-fallback", "[transformers] WebGPU init failed for embed model — falling back to WASM.", err);
      report(args.initProgressCallback, 0.01, "WebGPU unavailable, retrying on WASM…");
      actualDevice = "wasm";
      pipe = (await pipeline("feature-extraction", modelId, {
        device: "wasm",
        dtype,
        progress_callback,
      })) as unknown as EmbedPipeline;
    } else {
      throw err;
    }
  }

  report(args.initProgressCallback, 0.98, "Finalizing embedding model");
  logBackendDiagnostics("embed", actualDevice, dtype, pipe);
  return pipe;
}

export async function getChatPipeline(initProgressCallback?: InitProgressCallback) {
  if (!chatPipePromise) {
    chatPipePromise = createChatPipeline({ initProgressCallback });
  }
  return chatPipePromise;
}

export async function getEmbedPipeline(initProgressCallback?: InitProgressCallback) {
  if (!embedPipePromise) {
    embedPipePromise = createEmbedPipeline({ initProgressCallback });
  }
  return embedPipePromise;
}

// ---- Cache-only probes (no download, no ONNX init) ----
// Check the browser's Cache API directly — the same store transformers.js writes to.
// This avoids any ONNX Runtime initialisation during the probe, and sidesteps the
// `local_files_only` / `allowLocalModels=false` conflict that only exists in browsers.
async function checkBrowserCache(modelId: string): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    const cacheName = (hfEnv.cacheKey as string | undefined) ?? "transformers-cache";
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    const needle = modelId.toLowerCase();
    return keys.some((req) => req.url.toLowerCase().includes(needle));
  } catch {
    return false;
  }
}

export async function loadChatPipelineFromCache(): Promise<boolean> {
  if (chatPipePromise) return true;
  return checkBrowserCache(config.transformersChatModel);
}

export async function loadEmbedPipelineFromCache(): Promise<boolean> {
  if (embedPipePromise) return true;
  return checkBrowserCache(config.transformersEmbedModel);
}

async function deleteIndexedDb(name: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearTransformersModelCache(): Promise<{ cachesDeleted: string[]; idbDeleted: string[] }> {
  const cachesDeleted: string[] = [];
  const idbDeleted: string[] = [];
  const cacheKey = (hfEnv.cacheKey as string | undefined) ?? "transformers-cache";

  // Clear Cache API entries used by transformers.js.
  if (typeof caches !== "undefined") {
    try {
      const names = await caches.keys();
      for (const n of names) {
        if (n === cacheKey || n.startsWith(`${cacheKey}-`) || n.includes(cacheKey)) {
          const ok = await caches.delete(n);
          if (ok) cachesDeleted.push(n);
        }
      }
    } catch {
      // ignore
    }
  }

  // Best-effort clear of IndexedDB caches (varies by transformers.js / ort-web version).
  // This is safe even if the DB names don't exist.
  await deleteIndexedDb(cacheKey);
  idbDeleted.push(cacheKey);
  await deleteIndexedDb(`${cacheKey}-wasm`);
  idbDeleted.push(`${cacheKey}-wasm`);
  await deleteIndexedDb("onnxruntime-web");
  idbDeleted.push("onnxruntime-web");

  resetLocalPipelines();
  return { cachesDeleted, idbDeleted };
}

function llama3ChatTemplate(messages: LlmMessage[]): string {
  // Minimal Llama-3 chat format (works with most Llama 3.x instruct exports).
  // If a different chat model is used, prompts may need adjustment.
  const esc = (s: string) => (s || "").trim();
  const sys = messages.filter((m) => m.role === "system").map((m) => esc(m.content)).join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");

  let out = "<|begin_of_text|>";
  out += `<|start_header_id|>system<|end_header_id|>\n${sys || "You are a helpful assistant."}\n<|eot_id|>`;

  for (const m of rest) {
    const role = m.role === "user" ? "user" : "assistant";
    out += `<|start_header_id|>${role}<|end_header_id|>\n${esc(m.content)}\n<|eot_id|>`;
  }

  // Generation begins after the assistant header.
  out += "<|start_header_id|>assistant<|end_header_id|>\n";
  return out;
}

export async function generateTextFromMessages(
  messages: LlmMessage[],
  opts?: { maxNewTokens?: number; temperature?: number; topP?: number; seed?: number }
): Promise<string> {
  const gen = await getChatPipeline();
  const prompt = llama3ChatTemplate(messages);

  const max_new_tokens = Math.max(1, Math.min(1024, Math.trunc(opts?.maxNewTokens ?? 256)));
  const temperature = opts?.temperature ?? 0;
  const top_p = opts?.topP ?? 1;

  const r = await gen(prompt, {
    max_new_tokens,
    temperature,
    top_p,
    do_sample: temperature > 0,
    // Some backends ignore seed; safe to pass when supported.
    seed: opts?.seed ?? 1,
    return_full_text: false,
  });

  // transformers.js returns either a single object or array, depending on pipeline version/options.
  const first = Array.isArray(r) ? r[0] : r;
  const obj = (first || {}) as TextGenResult;
  const text = String(obj.generated_text ?? obj.text ?? "");
  return text.trim();
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

  // feature-extraction returns (batch, seq, dim). We request pooled mean + normalized vector.
  const t = await extractor(input, { pooling: "mean", normalize: true });
  const maybeTensor = t as { tolist?: () => unknown } | null;
  const vec = typeof maybeTensor?.tolist === "function" ? maybeTensor.tolist() : t;

  // We accept either:
  // - a single embedding vector: number[]
  // - a batch of vectors: number[][]
  let emb: unknown = vec;
  if (Array.isArray(vec) && vec.length > 0 && Array.isArray(vec[0])) {
    emb = vec[0];
  }
  if (!Array.isArray(emb)) throw new Error("Failed to compute embedding.");

  const out = emb.map((x: unknown) => Number(x));
  if (out.length !== config.embeddingDim) {
    throw new Error(`Embedding dim mismatch: expected ${config.embeddingDim}, got ${out.length}`);
  }
  return out;
}

