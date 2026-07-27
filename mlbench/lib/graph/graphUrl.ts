/**
 * URL helpers for the pre-generated graph Arrow files.
 *
 * Routing logic:
 *   - local (launch-local / NEXT_PUBLIC_ENV=local):
 *       Try the FastAPI backend first via /api/graph/*, which FileResponse-serves
 *       the Arrow file from ~/storage/*.arrow.  Falls back to CDN automatically
 *       if the backend returns 404 (file not generated locally yet).
 *   - production / staging:
 *       Fetch directly from the Cloud CDN endpoint — no backend hop.
 *       URL is injected at build/deploy time via NEXT_PUBLIC_GRAPH_CDN_URL.
 */

/** Base URL for the graph asset CDN (cdn.sotavault.ai in production). */
const GRAPH_CDN_BASE =
  process.env.NEXT_PUBLIC_GRAPH_CDN_URL?.replace(/\/$/, "") ||
  "https://cdn.sotavault.ai";

const GRAPH_FILENAMES: Record<"paper" | "dataset", string> = {
  paper: "paper.arrow",
  dataset: "dataset.arrow",
};

/** CDN URL for a graph Arrow file. Used in production and as the local fallback. */
export function getGraphCdnUrl(name: "paper" | "dataset"): string {
  return `${GRAPH_CDN_BASE}/${GRAPH_FILENAMES[name]}`;
}

/**
 * Fetch the graph Arrow file bytes, choosing the right source for the
 * current environment.
 *
 * - **local**: tries the FastAPI `/api/graph/*` endpoint first; on 404 falls
 *   back to CDN so you can test the viz without running the offline graph job.
 * - **production/staging**: fetches from CDN directly (`force-cache` so the
 *   browser reuses an already-cached response instead of re-validating).
 */
export async function fetchGraphBytes(
  name: "paper" | "dataset",
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const isLocal = process.env.NEXT_PUBLIC_ENV === "local";

  if (isLocal) {
    const localPath = name === "paper" ? "papers" : "datasets";
    const localUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/api/graph/${localPath}`
        : `http://localhost:8080/graph/${localPath}`;

    try {
      const res = await fetch(localUrl, { signal, cache: "no-store" });
      if (res.ok) {
        return new Uint8Array(await res.arrayBuffer());
      }
      if (res.status !== 404) {
        throw new Error(`Local graph fetch failed: HTTP ${res.status}`);
      }
      // 404 = file not generated locally yet → fall through to CDN
      console.info(
        `[graph] ${GRAPH_FILENAMES[name]} not found locally (404) — falling back to CDN`,
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      // Network error (API not running, etc.) → try CDN
      console.warn(`[graph] Local fetch error — falling back to CDN:`, err);
    }
  }

  // Production path and local CDN fallback.
  const cdnUrl = getGraphCdnUrl(name);
  const res = await fetch(cdnUrl, {
    signal,
    // Production: re-use browser cache (24 h CDN TTL, same max-age client-side).
    // Local fallback: cache is fine — we only reach here when local is missing.
    cache: "force-cache",
  });
  if (!res.ok) {
    throw new Error(`Graph CDN fetch failed for ${GRAPH_FILENAMES[name]}: HTTP ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
