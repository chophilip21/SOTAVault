"use client";

import { pipeline, type ProgressCallback } from "@huggingface/transformers";

import { config } from "@/lib/config";

export type InitProgressCallback = (r: { progress: number; text: string }) => void;

export type LlmRole = "system" | "user" | "assistant";
export type LlmMessage = { role: LlmRole; content: string };

type TextGenResult = { generated_text?: string; text?: string };
type TextGenPipeline = (input: string, opts: Record<string, unknown>) => Promise<TextGenResult | TextGenResult[]>;
type EmbedPipeline = (input: string, opts: Record<string, unknown>) => Promise<unknown>;

let chatPipePromise: Promise<TextGenPipeline> | null = null;
let embedPipePromise: Promise<EmbedPipeline> | null = null;

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
    report(cb, scaled, text);
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

export async function getChatPipeline(initProgressCallback?: InitProgressCallback) {
  if (!chatPipePromise) {
    chatPipePromise = (async () => {
      const modelId = config.transformersChatModel;
      ensureSupportedModelId(modelId);
      const device = pickDevice();
      report(initProgressCallback, 0.01, `Loading chat model (${device})`);

      const progress_callback = createAggregatingProgressReporter(initProgressCallback, { label: "Chat model" });

      // NOTE: API surface is stable between v3 and v4 preview: pipeline(task, model, { device, progress_callback }).
      const pipe = (await pipeline("text-generation", modelId, { device, progress_callback })) as unknown as TextGenPipeline;
      report(initProgressCallback, 0.98, "Finalizing chat model");
      return pipe;
    })();
  }
  return chatPipePromise;
}

export async function getEmbedPipeline(initProgressCallback?: InitProgressCallback) {
  if (!embedPipePromise) {
    embedPipePromise = (async () => {
      const modelId = config.transformersEmbedModel;
      ensureSupportedModelId(modelId);
      const device = pickDevice();
      report(initProgressCallback, 0.01, `Loading embedding model (${device})`);

      const progress_callback = createAggregatingProgressReporter(initProgressCallback, { label: "Embedding model" });

      const pipe = (await pipeline("feature-extraction", modelId, { device, progress_callback })) as unknown as EmbedPipeline;
      report(initProgressCallback, 0.98, "Finalizing embedding model");
      return pipe;
    })();
  }
  return embedPipePromise;
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

