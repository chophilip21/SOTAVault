import { AutoModel, AutoTokenizer, env } from "@huggingface/transformers";
import { EMBEDDING_DIM, EMBEDDING_MODEL_ID, EMBEDDING_QUERY_PREFIX } from "@/lib/embedding/constants";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tokenizer: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let model: any = null;

/**
 * Lazily load the tokenizer and model.
 *
 * dtype "q8" (model_quantized.onnx, ~23 MB) is chosen deliberately:
 *   - Smaller download than q4 (54.6 MB) and fp16 (45.7 MB)
 *   - Embeddings are nearly identical to fp32 (INT8 introduces < 0.1% cosine error)
 *   - Stored document vectors were generated with full-precision VLLM; using a
 *     higher-fidelity dtype keeps the query embeddings in the same angular space
 */
async function getModelAndTokenizer() {
  if (!tokenizer) {
    tokenizer = await AutoTokenizer.from_pretrained(EMBEDDING_MODEL_ID);
  }
  if (!model) {
    model = await AutoModel.from_pretrained(EMBEDDING_MODEL_ID, {
      device: "wasm",
      dtype: "q8",
    });
  }
  return { tokenizer, model };
}

/**
 * Post-processes the model's native sentence_embedding output:
 * 1. Slices to the target Matryoshka dimension (256).
 * 2. Re-normalizes the resulting vector (required after slicing).
 *
 * sentence_embedding shape: [1, EMBEDDING_NATIVE_DIM] (batch=1, dim=384)
 * tolist() → [[f0, f1, ..., f383]]  →  nested[0] is the 384-dim vector
 */
function toNormalizedFlatEmbedding(result: unknown): number[] {
  const tensor = result as { tolist: () => unknown };
  const nested = tensor.tolist();
  let vector: number[];

  if (Array.isArray(nested) && nested.length > 0 && Array.isArray(nested[0])) {
    vector = (nested[0] as number[]).slice(0, EMBEDDING_DIM);
  } else if (Array.isArray(nested) && typeof nested[0] === "number") {
    vector = (nested as number[]).slice(0, EMBEDDING_DIM);
  } else {
    throw new Error("Unexpected embedding tensor shape");
  }

  // Re-normalize after Matryoshka slicing (sentence_embedding is L2-normalized
  // at 384 dims; slicing breaks that invariant so we must re-normalize)
  const sumSq = vector.reduce((sum, val) => sum + val * val, 0);
  const norm = Math.sqrt(sumSq);
  if (norm < 1e-9) return vector;
  return vector.map((val) => val / norm);
}

/** Check whether the model's core files are present in the transformers-cache Cache API. */
async function checkModelCached(): Promise<boolean> {
  try {
    if (typeof caches === "undefined") return false;
    const cache = await caches.open("transformers-cache");
    const keys = await cache.keys();
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
      await getModelAndTokenizer();
      self.postMessage({ type: "preload-done" } satisfies WorkerResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: "error", error: message } satisfies WorkerResponse);
    }
    return;
  }

  if (data.type !== "embed") return;

  try {
    const { tokenizer: tok, model: mdl } = await getModelAndTokenizer();

    /**
     * Prepend the asymmetric query prefix so that the query is embedded in
     * "query space", matching documents which are indexed without a prefix.
     */
    const inputText = `${EMBEDDING_QUERY_PREFIX}${data.text}`;

    // Tokenize — padding + truncation to stay within the model's context window
    const inputs = tok(inputText, { padding: true, truncation: true });

    // Run the model and extract the native sentence embedding.
    // AutoModel returns { sentence_embedding: Tensor[1, 384] } for this model,
    // which is the same output that sentence_transformers / VLLM produce on the
    // server. Using this output (instead of pipeline mean-pooling last_hidden_state)
    // guarantees that query and document vectors occupy the same embedding space.
    const outputs = await mdl(inputs);
    const embeddingTensor = outputs.sentence_embedding;
    if (!embeddingTensor) {
      throw new Error("Model did not return sentence_embedding — check ONNX export");
    }

    // Slice to Matryoshka target dim and re-normalize
    const truncated = toNormalizedFlatEmbedding(embeddingTensor);

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
