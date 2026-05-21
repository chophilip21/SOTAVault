import { pipeline, env } from "@huggingface/transformers";
import { EMBEDDING_DIM, EMBEDDING_MODEL_ID } from "@/lib/embedding/constants";

env.allowLocalModels = false;

type WorkerRequest =
  | { type: "embed"; id: number; text: string }
  | { type: "ping" }
  | { type: "check-cache" }
  | { type: "preload" };

type WorkerResponse =
  | { type: "ready" }
  | { type: "cached"; isCached: boolean }
  | { type: "preload-progress"; progress: number }
  | { type: "preload-done" }
  | { type: "success"; id: number; embedding: number[] }
  | { type: "error"; id?: number; error: string };

// Pipeline return type from @huggingface/transformers is too heavy for TS to represent.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractor: any = null;

async function getExtractor() {
  if (!extractor) {
    extractor = await pipeline("feature-extraction", EMBEDDING_MODEL_ID, {
      device: "wasm",
      dtype: "q4",
    });
  }
  return extractor;
}

function toFlatEmbedding(result: unknown): number[] {
  const tensor = result as { tolist: () => unknown };
  const nested = tensor.tolist();
  if (Array.isArray(nested) && nested.length > 0 && Array.isArray(nested[0])) {
    return (nested[0] as number[]).slice(0, EMBEDDING_DIM);
  }
  if (Array.isArray(nested) && typeof nested[0] === "number") {
    return (nested as number[]).slice(0, EMBEDDING_DIM);
  }
  throw new Error("Unexpected embedding tensor shape");
}

/** Check whether the model's core files are present in the transformers-cache Cache API. */
async function checkModelCached(): Promise<boolean> {
  try {
    if (typeof caches === "undefined") return false;
    const cache = await caches.open("transformers-cache");
    const keys = await cache.keys();
    // If ANY cached URL references the model ID, treat it as cached
    const modelSlug = EMBEDDING_MODEL_ID.replace("/", "%2F");
    return keys.some(
      (req) =>
        req.url.includes(EMBEDDING_MODEL_ID) ||
        req.url.includes(modelSlug),
    );
  } catch {
    return false;
  }
}

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const data = event.data;

  if (data.type === "ping") {
    self.postMessage({ type: "ready" } satisfies WorkerResponse);
    return;
  }

  if (data.type === "check-cache") {
    const isCached = await checkModelCached();
    self.postMessage({ type: "cached", isCached } satisfies WorkerResponse);
    return;
  }

  if (data.type === "preload") {
    try {
      await getExtractor();
      self.postMessage({ type: "preload-done" } satisfies WorkerResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: "error", error: message } satisfies WorkerResponse);
    }
    return;
  }

  if (data.type !== "embed") return;

  try {
    const pipe = await getExtractor();
    const result = await pipe(data.text, { pooling: "mean", normalize: true });
    const truncated = toFlatEmbedding(result);
    if (truncated.length !== EMBEDDING_DIM) {
      throw new Error(`Expected ${EMBEDDING_DIM} dimensions, got ${truncated.length}`);
    }
    self.postMessage({
      type: "success",
      id: data.id,
      embedding: truncated,
    } satisfies WorkerResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({
      type: "error",
      id: data.id,
      error: message,
    } satisfies WorkerResponse);
  }
});
