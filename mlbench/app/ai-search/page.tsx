"use client";

import { Playfair_Display } from "next/font/google";
import { useCallback, useState } from "react";
import { getBackendBaseUrl } from "@/lib/backendUrl";
import { useAuth } from "@/lib/authContext";
import { requestLogin } from "@/lib/routeAccess";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { DatasetSeriesSearchResults } from "./components/DatasetSeriesSearchResults";
import { SearchResults } from "./components/SearchResults";
import { useEmbeddingWorker } from "./useEmbeddingWorker";
import type {
  AiSearchMode,
  DatasetSeriesVectorSearchResponse,
  VectorSearchHit,
  VectorSearchResponse,
} from "@/lib/aiSearch/types";
import { config } from "@/lib/config";
import { EMBEDDING_MODEL_ID } from "@/lib/embedding/constants";

const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: ["700"] });

const SEARCH_MODES: {
  id: AiSearchMode;
  label: string;
  gradient: string;
  selectedRing: string;
}[] = [
  {
    id: "paper",
    label: "Paper",
    gradient: "from-emerald-400/25 via-teal-400/15 to-sky-400/20",
    selectedRing: "ring-emerald-400/70",
  },
  {
    id: "dataset",
    label: "Dataset",
    gradient: "from-violet-400/25 via-fuchsia-400/15 to-rose-400/20",
    selectedRing: "ring-violet-400/70",
  },
];

const VECTOR_PATHS: Record<AiSearchMode, string> = {
  paper: "/search/vector",
  dataset: "/search/dataset_series/vector",
};

const { resultLimit } = config.aiSearch;

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
  if (!workerReady || modelCached === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <LoadingSpinner size="md" />
        <p className="text-sm text-gray-500 font-sans">Initialising embedding worker…</p>
      </div>
    );
  }

  if (modelCached) {
    return (
      <div className="flex items-center justify-center gap-2.5 px-3 sm:px-4 py-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/80 w-full max-w-xl mx-auto">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
        <span className="text-sm font-medium text-emerald-800 font-sans text-center leading-snug">
          Embedding model ready — running entirely in your browser
        </span>
      </div>
    );
  }

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
  const [searchMode, setSearchMode] = useState<AiSearchMode>("paper");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [paperHits, setPaperHits] = useState<VectorSearchHit[]>([]);
  const [datasetHits, setDatasetHits] = useState<
    DatasetSeriesVectorSearchResponse["items"]
  >([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [queryInputFocused, setQueryInputFocused] = useState(false);

  const { user } = useAuth();

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
  const activeHits = searchMode === "paper" ? paperHits : datasetHits;
  const queryHasText = query.trim().length > 0;
  const queryBorderActive = queryInputFocused || queryHasText;

  const clearResults = useCallback(() => {
    setPaperHits([]);
    setDatasetHits([]);
    setSearchError(null);
    setHasSearched(false);
  }, []);

  const runSearch = useCallback(
    async (text?: string) => {
      const q = (text ?? query).trim();
      if (!q || !isModelReady) return;

      if (!user) {
        requestLogin();
        return;
      }

      setSearching(true);
      setSearchError(null);
      setHasSearched(true);
      if (searchMode === "paper") {
        setPaperHits([]);
      } else {
        setDatasetHits([]);
      }

      try {
        const embedding = await embed(q);
        const path = VECTOR_PATHS[searchMode];
        const url = new URL(`${getBackendBaseUrl()}${path}`);

        const headers: Record<string, string> = { "content-type": "application/json" };
        try {
          const token = user ? await user.getIdToken() : null;
          if (token) headers["Authorization"] = `Bearer ${token}`;
        } catch {
          // Non-fatal — fall back to IP-based rate limiting on the backend.
        }

        const res = await fetch(url.toString(), {
          method: "POST",
          headers,
          body: JSON.stringify({ embedding, limit: resultLimit }),
          cache: "no-store",
        });

        if (!res.ok) {
          if (searchMode === "paper") {
            setPaperHits([]);
          } else {
            setDatasetHits([]);
          }

          if (res.status === 429) {
            const body = await res.json().catch(() => ({}));
            setSearchError(
              (body?.detail as { message?: string })?.message ??
                "RAG search is an experimental feature with limited availability. Please wait until your quota refreshes.",
            );
            return;
          }

          setSearchError(
            res.status === 401 || res.status === 403
              ? "Sign in is required to run semantic search."
              : searchMode === "paper"
                ? "Paper search failed. Check that the API is running and try again."
                : "Dataset search failed. Check that the API is running and try again.",
          );
          return;
        }

        if (searchMode === "paper") {
          const data = (await res.json()) as VectorSearchResponse;
          setPaperHits(data.items || []);
        } else {
          const data = (await res.json()) as DatasetSeriesVectorSearchResponse;
          setDatasetHits(data.items || []);
        }
      } catch (err) {
        if (searchMode === "paper") {
          setPaperHits([]);
        } else {
          setDatasetHits([]);
        }
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
    [query, searchMode, isModelReady, embed, user],
  );

  return (
    <div className="min-h-[calc(100vh-5rem)] h-[calc(100vh-5rem)] flex flex-col overflow-hidden px-3 sm:px-6 lg:px-8 py-4 sm:py-6 min-w-0">
      <div className="flex-1 min-h-0 mx-auto w-full max-w-6xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px] flex flex-col min-w-0">
        <div className="flex-1 min-h-0 rounded-[28px] bg-gradient-to-br from-slate-50 via-rose-50 to-violet-100 p-3 sm:p-6 border border-white/60 shadow-[0_20px_60px_rgba(15,23,42,0.10)] flex flex-col min-w-0">
          <div className="relative flex-1 min-h-0 rounded-[24px] bg-white/65 backdrop-blur-xl border border-white/70 shadow-sm overflow-hidden flex flex-col min-w-0">

            <div className="flex-shrink-0 border-b border-white/60 px-4 sm:px-7 pt-4 sm:pt-7 pb-4 min-w-0">
              <div className="flex justify-center max-w-full">
                <div className="inline-flex max-w-full items-center gap-2 px-3 sm:px-4 py-2 rounded-2xl bg-white/70 border border-white/80 shadow-sm">
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
                  Semantic search
                </h1>
                <p className="text-sm text-gray-600 mt-2 max-w-2xl font-sans">
                  Search papers or dataset series with the same embedding model — results depend on which mode you select.
                </p>
              </div>

              <div className="mt-5">
                <ModelCacheGate
                  modelCached={modelCached}
                  downloading={downloading}
                  workerReady={workerReady}
                  onDownload={downloadModel}
                  error={workerError}
                />
              </div>

              {isModelReady && (
                <div className="mt-4 grid grid-cols-2 gap-2 w-full max-w-[17rem] mx-auto sm:flex sm:w-auto sm:justify-center sm:gap-3 sm:max-w-none">
                  {SEARCH_MODES.map((mode) => {
                    const selected = searchMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setSearchMode(mode.id);
                          clearResults();
                        }}
                        className={[
                          "w-full sm:w-auto rounded-2xl border border-white/70 bg-gradient-to-br transition shadow-sm px-4 py-2.5 sm:px-5 font-sans text-center",
                          mode.gradient,
                          selected
                            ? `ring-2 ${mode.selectedRing} brightness-[1.03]`
                            : "opacity-80 hover:opacity-100 hover:brightness-[1.02]",
                        ].join(" ")}
                      >
                        <div className="text-sm font-semibold text-gray-900">{mode.label}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-7 py-4">
              {busy && (
                <div className="flex flex-col items-center justify-center py-16">
                  <LoadingSpinner size="md" />
                  <p className="mt-3 text-sm text-gray-600 font-sans">
                    {modelLoading
                      ? "Running embedding model…"
                      : searchMode === "paper"
                        ? "Searching papers…"
                        : "Searching dataset series…"}
                  </p>
                </div>
              )}

              {!busy && searchError && (
                <p className="text-sm text-red-700 text-center py-8 font-sans">{searchError}</p>
              )}

              {!busy && !searchError && hasSearched && activeHits.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-12 font-sans">
                  {searchMode === "paper"
                    ? "No matching papers found. Try a more specific query."
                    : "No matching dataset series found. Try a more specific query."}
                </p>
              )}

              {!busy && !searchError && searchMode === "paper" && paperHits.length > 0 && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-gray-900 font-sans">
                    {paperHits.length} paper{paperHits.length === 1 ? "" : "s"}
                  </p>
                  <SearchResults hits={paperHits} />
                </div>
              )}

              {!busy && !searchError && searchMode === "dataset" && datasetHits.length > 0 && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-gray-900 font-sans">
                    {datasetHits.length} dataset series
                  </p>
                  <DatasetSeriesSearchResults hits={datasetHits} />
                </div>
              )}

              {!busy && !hasSearched && isModelReady && (
                <div className="flex items-center justify-center py-16 text-center">
                  <p className="text-sm text-gray-500 font-sans">
                    Choose Paper or Dataset, then enter a query below.
                  </p>
                </div>
              )}
            </div>

            <div className="flex-shrink-0 px-4 sm:px-7 py-5 sm:py-4 border-t border-emerald-100 bg-white/95 shadow-[0_-8px_30px_rgba(16,185,129,0.12)] min-w-0">
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-2 items-stretch font-sans min-w-0 max-w-3xl mx-auto w-full">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setQueryInputFocused(true)}
                  onBlur={() => setQueryInputFocused(false)}
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
                          : searchMode === "paper"
                            ? "Search papers by topic, method, or benchmark…"
                            : "Search dataset series by name or task…"
                  }
                  className={[
                    "w-full min-w-0 flex-1 min-h-[3.25rem] sm:min-h-0 sm:h-12 px-4 rounded-2xl border-2 bg-white text-gray-900 text-base sm:text-[15px] transition-colors focus:outline-none placeholder:text-gray-500 disabled:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-200",
                    queryBorderActive
                      ? "border-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]"
                      : "border-emerald-200",
                    queryInputFocused ? "ring-2 ring-emerald-500/45" : "",
                  ].join(" ")}
                />
                <button
                  type="button"
                  onClick={() => void runSearch()}
                  disabled={!canSearch}
                  className={[
                    "w-full sm:w-auto sm:shrink-0 h-12 px-5 rounded-2xl text-sm font-semibold text-white shadow-sm transition-all",
                    canSearch
                      ? searchMode === "paper"
                        ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                        : "bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
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
