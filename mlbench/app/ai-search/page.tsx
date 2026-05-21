"use client";

import { Playfair_Display } from "next/font/google";
import { useCallback, useState } from "react";
import { getBackendBaseUrl } from "@/lib/backendUrl";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { SearchResults } from "./components/SearchResults";
import { useEmbeddingWorker } from "./useEmbeddingWorker";
import type { VectorSearchHit, VectorSearchResponse } from "@/lib/aiSearch/types";
import { EMBEDDING_MODEL_ID, VECTOR_SEARCH_THRESHOLD } from "@/lib/embedding/constants";

const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: ["700"] });

const SAMPLE_QUERIES = [
  "retrieval-augmented generation for code",
  "diffusion models for image generation",
  "object detection on COCO",
] as const;

const VECTOR_SEARCH_LIMIT = 50;

// ─── Model Cache Status Banner ──────────────────────────────────────────────

function ModelCacheGate({
  modelCached,
  downloading,
  workerReady,
  onDownload,
  error,
}: {
  modelCached: boolean | null;
  downloading: boolean;
  workerReady: boolean;
  onDownload: () => void;
  error: string | null;
}) {
  // Still initialising worker / checking cache
  if (!workerReady || modelCached === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <LoadingSpinner size="md" />
        <p className="text-sm text-gray-500 font-sans">Initialising embedding worker…</p>
      </div>
    );
  }

  // Model is already in the browser cache → green light
  if (modelCached) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/80 w-fit mx-auto">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
        <span className="text-sm font-medium text-emerald-800 font-sans">
          Embedding model ready — running entirely in your browser
        </span>
      </div>
    );
  }

  // Model is NOT cached — show download CTA
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-6 py-5 max-w-md w-full text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
          </span>
          <span className="text-sm font-semibold text-amber-800 font-sans">
            Embedding model not cached
          </span>
        </div>
        <p className="text-xs text-amber-700 font-sans mb-4 leading-relaxed">
          AI Search runs the embedding model (<code className="font-mono bg-amber-100 px-1 rounded">{EMBEDDING_MODEL_ID}</code>)
          directly in your browser. Download it once (~30 MB) and it will be cached locally — no API calls, no data sent to any server.
        </p>
        {error && (
          <p className="text-xs text-red-700 mb-3 font-sans bg-red-50 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
        <button
          onClick={onDownload}
          disabled={downloading}
          className={[
            "inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold text-white shadow-sm transition-all",
            downloading
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600",
          ].join(" ")}
        >
          {downloading ? (
            <>
              <LoadingSpinner size="sm" />
              Downloading model…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 3v12m0 0-4-4m4 4 4-4M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Download &amp; cache model
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AiSearchPage() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hits, setHits] = useState<VectorSearchHit[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const {
    embed,
    workerReady,
    modelCached,
    downloading,
    modelLoading,
    error: workerError,
    downloadModel,
  } = useEmbeddingWorker();

  const isModelReady = workerReady && modelCached === true;
  const busy = searching || modelLoading;
  const canSearch = query.trim().length > 0 && isModelReady && !busy;

  const runSearch = useCallback(
    async (text?: string) => {
      const q = (text ?? query).trim();
      if (!q || !isModelReady) return;

      setSearching(true);
      setSearchError(null);
      setHasSearched(true);

      try {
        const embedding = await embed(q);
        const url = new URL(`${getBackendBaseUrl()}/search/vector`);
        const res = await fetch(url.toString(), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ embedding, limit: VECTOR_SEARCH_LIMIT }),
          cache: "no-store",
        });

        if (!res.ok) {
          setHits([]);
          setSearchError(
            res.status === 401 || res.status === 403
              ? "Sign in is required to run semantic search."
              : "Paper search failed. Check that the API is running and try again.",
          );
          return;
        }

        const data = (await res.json()) as VectorSearchResponse;
        const allHits = data.items || [];
        // Only keep hits that are within the similarity threshold
        const relevantHits = allHits.filter(
          (h) => h.distance == null || h.distance <= VECTOR_SEARCH_THRESHOLD,
        );
        setHits(relevantHits);
      } catch (err) {
        setHits([]);
        const msg = err instanceof Error ? err.message : "";
        setSearchError(
          msg.includes("Enter a search query")
            ? msg
            : msg
              ? `Embedding failed: ${msg}`
              : "Search could not be completed. Check the browser console for details.",
        );
      } finally {
        setSearching(false);
      }
    },
    [query, isModelReady, embed],
  );

  return (
    <div className="min-h-[calc(100vh-5rem)] h-[calc(100vh-5rem)] flex flex-col overflow-hidden px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex-1 min-h-0 mx-auto w-full max-w-6xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px] flex flex-col">
        <div className="flex-1 min-h-0 rounded-[28px] bg-gradient-to-br from-slate-50 via-rose-50 to-violet-100 p-4 sm:p-6 border border-white/60 shadow-[0_20px_60px_rgba(15,23,42,0.10)] flex flex-col">
          <div className="relative flex-1 min-h-0 rounded-[24px] bg-white/65 backdrop-blur-xl border border-white/70 shadow-sm overflow-hidden flex flex-col">

            {/* ── Header ── */}
            <div className="flex-shrink-0 border-b border-white/60 px-5 sm:px-7 pt-5 sm:pt-7 pb-4">
              <div className="flex justify-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/70 border border-white/80 shadow-sm">
                  <div className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center shadow-sm">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M10.5 3.75a6.75 6.75 0 1 0 3.955 12.285l4.394 4.394a.75.75 0 0 0 1.06-1.06l-4.395-4.395A6.751 6.751 0 0 0 10.5 3.75Z"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 font-sans">SotaVault AI Search</span>
                </div>
              </div>

              <div className="mt-5 flex flex-col items-center text-center">
                <h1 className={`text-2xl sm:text-4xl font-bold text-gray-900 tracking-tight ${playfairDisplay.className}`}>
                  Semantic paper search
                </h1>
                <p className="text-sm text-gray-600 mt-2 max-w-2xl font-sans">
                  Embeddings run entirely in your browser via Transformers.js — no VLLM or TEI required.
                  Results are capped at {VECTOR_SEARCH_LIMIT}.
                </p>
              </div>

              {/* Cache gate */}
              <div className="mt-5">
                <ModelCacheGate
                  modelCached={modelCached}
                  downloading={downloading}
                  workerReady={workerReady}
                  onDownload={downloadModel}
                  error={workerError}
                />
              </div>

              {/* Sample queries — only rendered when model is ready */}
              {isModelReady && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {SAMPLE_QUERIES.map((q, idx) => {
                    const gradient =
                      idx === 0
                        ? "from-emerald-400/25 via-teal-400/15 to-sky-400/20"
                        : idx === 1
                          ? "from-violet-400/25 via-fuchsia-400/15 to-rose-400/20"
                          : "from-amber-300/30 via-orange-400/15 to-rose-400/20";
                    return (
                      <button
                        key={q}
                        type="button"
                        disabled={!canSearch}
                        onClick={() => {
                          setQuery(q);
                          void runSearch(q);
                        }}
                        className={[
                          "text-left rounded-2xl border border-white/70 bg-gradient-to-br transition shadow-sm px-4 py-3 font-sans",
                          gradient,
                          !canSearch ? "opacity-60 cursor-not-allowed" : "hover:brightness-[1.02]",
                        ].join(" ")}
                      >
                        <div className="text-sm font-semibold text-gray-900 line-clamp-2">{q}</div>
                        <div className="text-xs text-gray-700/80 mt-1">Try this</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Results area ── */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-7 py-4">
              {busy && (
                <div className="flex flex-col items-center justify-center py-16">
                  <LoadingSpinner size="md" />
                  <p className="mt-3 text-sm text-gray-600 font-sans">
                    {modelLoading ? "Running embedding model…" : "Searching papers…"}
                  </p>
                </div>
              )}

              {!busy && searchError && (
                <p className="text-sm text-red-700 text-center py-8">{searchError}</p>
              )}

              {!busy && !searchError && hasSearched && hits.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-12 font-sans">
                  No matching papers found. Try a more specific query.
                </p>
              )}

              {!busy && !searchError && hits.length > 0 && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-gray-900 font-sans">
                    {hits.length} result{hits.length === 1 ? "" : "s"}
                  </p>
                  <SearchResults hits={hits} />
                </div>
              )}

              {!busy && !hasSearched && isModelReady && (
                <div className="flex items-center justify-center py-16 text-center">
                  <p className="text-sm text-gray-500 font-sans">
                    Enter a query below or pick a sample to search.
                  </p>
                </div>
              )}
            </div>

            {/* ── Search bar — disabled until model is cached ── */}
            <div className="flex-shrink-0 px-4 sm:px-7 py-4 border-t border-white/60 bg-white/50">
              <div className="flex gap-2 items-stretch font-sans">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void runSearch();
                    }
                  }}
                  disabled={!isModelReady || busy}
                  placeholder={
                    !workerReady
                      ? "Starting worker…"
                      : modelCached === null
                        ? "Checking model cache…"
                        : !modelCached
                          ? "Download the model above to enable search"
                          : "Search papers by topic, method, or benchmark…"
                  }
                  className="flex-1 h-12 px-4 rounded-2xl border border-white/70 bg-white/75 text-gray-900 text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:border-white placeholder:text-gray-500 disabled:bg-white/50 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={() => void runSearch()}
                  disabled={!canSearch}
                  className={[
                    "shrink-0 h-12 px-5 rounded-2xl text-sm font-semibold text-white shadow-sm transition-all",
                    canSearch
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                      : "bg-slate-400 opacity-60 cursor-not-allowed",
                  ].join(" ")}
                >
                  {busy ? "…" : "Search"}
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
