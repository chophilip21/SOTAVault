/**
 * localServerRuntime.ts
 *
 * Replaces wllamaRuntime.ts. Instead of running WASM in-browser, this module
 * calls the locally-running Docker services:
 *
 *   VLLM  (LFM2.5-1.2B-Instruct-AWQ) → http://localhost:8000  (OpenAI-compatible)
 *   TEI   (snowflake-arctic-embed-s)   → http://localhost:8001  (HuggingFace TEI)
 *
 * Both services are started by `bash local.sh` (via docker-compose.demo.yml).
 * The frontend Next.js dev server proxies /api/vllm/* → localhost:8000
 * and /api/tei/* → localhost:8001 (see next.config.ts rewrites).
 */
"use client";

export type InitProgressCallback = (r: { progress: number; text: string }) => void;
export type LlmRole = "system" | "user" | "assistant";
export type LlmMessage = { role: LlmRole; content: string };

// ─── Health ────────────────────────────────────────────────────────────────────

export async function checkVllmHealth(): Promise<boolean> {
    try {
        const res = await fetch("/api/vllm/health", { cache: "no-store" });
        return res.ok;
    } catch {
        return false;
    }
}

export async function checkTeiHealth(): Promise<boolean> {
    try {
        const res = await fetch("/api/tei/health", { cache: "no-store" });
        return res.ok;
    } catch {
        return false;
    }
}

// ─── Chat (VLLM OpenAI-compatible) ────────────────────────────────────────────

export async function generateTextFromMessages(
    messages: LlmMessage[],
    opts?: { maxNewTokens?: number; temperature?: number; topP?: number; seed?: number }
): Promise<string> {
    const res = await fetch("/api/vllm/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            model: "chophilip21/LFM2.5-1.2B-Instruct-AWQ",
            messages,
            max_tokens: opts?.maxNewTokens ?? 256,
            temperature: opts?.temperature ?? 0,
            top_p: opts?.topP ?? 1,
            ...(opts?.seed != null ? { seed: opts.seed } : {}),
        }),
        cache: "no-store",
    });
    if (!res.ok) {
        throw new Error(`VLLM chat error: ${res.status}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return (data.choices?.[0]?.message?.content ?? "").trim();
}

/** Same function re-exported under the router name — for the demo we use one model for everything. */
export const generateTextFromMessagesRouter = generateTextFromMessages;

// ─── Embeddings (TEI) ─────────────────────────────────────────────────────────

export function cleanEmbeddingText(text: string): string {
    return (text || "")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[`*#>]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1500);
}

export async function embedText(text: string): Promise<number[]> {
    const input = cleanEmbeddingText(text);
    if (!input) throw new Error("Empty embedding input.");

    const res = await fetch("/api/tei/embed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inputs: input, normalize: true, truncate: true }),
        cache: "no-store",
    });
    if (!res.ok) {
        throw new Error(`TEI embed error: ${res.status}`);
    }
    // TEI returns either number[][] or number[] depending on configuration
    const data = await res.json();
    const vec: number[] = Array.isArray(data[0]) ? (data[0] as number[]) : (data as number[]);
    if (!Array.isArray(vec) || vec.length === 0) {
        throw new Error("TEI returned empty embedding.");
    }
    return vec;
}

// ─── Strip model artifacts ─────────────────────────────────────────────────────

export function stripInternalTags(text: string): string {
    return (text || "")
        .replace(/<\|[^|>]*\|>/g, "")
        .replace(/<\/\|[^>]*>+/g, "")
        .replace(/\s*<\|[^>]+>\s*/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

// ─── No-op stubs (for API compatibility with agent.ts) ────────────────────────

/** No-op: VLLM server is always ready when healthy; nothing to warm up in-browser. */
export function resetLocalPipelines(): void {
    // no-op
}

/** No-op: Models live on the server; there's no browser cache to clear. */
export async function clearTransformersModelCache(): Promise<{ cachesDeleted: string[]; idbDeleted: string[] }> {
    return { cachesDeleted: [], idbDeleted: [] };
}
