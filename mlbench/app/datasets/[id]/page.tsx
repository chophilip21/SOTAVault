"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { config } from "@/lib/config";
import { getBackendBaseUrl } from "@/lib/backendUrl";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { MathText } from "@/lib/mathText";

interface Dataset {
  id: string;
  name: string;
  full_name?: string;
  slug: string;
  description?: string;
  domain?: string;
  homepage?: string;
  introduced_date?: string;
  modalities?: string[];
  languages?: string[];
  variants?: string[];
  task_ids?: string[];
  paper_count?: number;
  created_at?: string;
  updated_at?: string;
}

interface Task {
  id: string;
  name: string;
  slug: string;
  description?: string;
  domain?: string;
}

interface TasksResponse {
  items: Task[];
  limit: number;
  next_cursor?: string | null;
  has_more: boolean;
}

type PaperRef = { id: string; title?: string | null; logical_id?: string | null };
type PaperListResponse = {
  items: PaperRef[];
  limit: number;
  next_cursor?: string | null;
  has_more: boolean;
};

type DatasetLeaderboardEntry = {
  paper_id: string;
  paper_result_id: string;
  metric_value: number;
  created_at?: string;
};

type DatasetLeaderboard = {
  id: string;
  dataset_id: string;
  task_id: string;
  metric_name: string;
  higher_is_better: boolean;
  entries: DatasetLeaderboardEntry[];
  top_k: number;
  computed_at?: string;
};

type DatasetLeaderboardListResponse = {
  items: DatasetLeaderboard[];
  limit_entries?: number | null;
};

function stripTrailingSourceLink(desc: string): string {
  let s = (desc || "").trim();
  if (!s) return s;

  // Remove a trailing "Source: <url>" (or "source <url>") suffix, common in ingested descriptions.
  // Do this iteratively to handle repeated "Source:" lines.
  // Examples we want to catch:
  // - "Source:https://example.com"
  // - "Source: https://example.com"
  // - "\nSource: https://example.com\n"
  const re = /\s*(?:source)\s*:?\s*https?:\/\/\S+\s*$/i;
  while (re.test(s)) s = s.replace(re, "").trim();
  return s;
}

function stripWrappingQuotes(s: string): string {
  const t = (s || "").trim();
  if (t.length >= 2) {
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1).trim();
    }
  }
  return t;
}

const DOMAIN_ICONS: Record<string, string> = {
  cv: "/icons/cv.png",
  nlp: "/icons/nlp.png",
  audio: "/icons/audio.png",
  robots: "/icons/robotics.png",
  time_series_tabular: "/icons/timeseries.png",
  graph: "/icons/graph.png",
  multimodal: "/icons/multi.png",
  theory: "/icons/theory.png",
  efficient: "/icons/efficiency.png",
  other: "/icons/others.png",
};

import { useBookmarks } from "@/hooks/useBookmarks";

const getDomainIcon = (domain?: string): string => {
  if (!domain) return "/icons/cv.png";
  return DOMAIN_ICONS[domain] || "/icons/cv.png";
};

export default function DatasetDetailPage() {
  const params = useParams();
  const datasetId = params.id as string;

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasksById, setTasksById] = useState<Record<string, Task>>({});
  const [tasksLoading, setTasksLoading] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);

  const [papersOpen, setPapersOpen] = useState(false);
  const [papersLoading, setPapersLoading] = useState(false);
  const [papers, setPapers] = useState<PaperRef[]>([]);

  const [leaderboardsLoading, setLeaderboardsLoading] = useState(false);
  const [leaderboards, setLeaderboards] = useState<DatasetLeaderboard[]>([]);
  const [paperTitleById, setPaperTitleById] = useState<Record<string, string>>({});
  const [paperLogicalIdById, setPaperLogicalIdById] = useState<Record<string, string>>({});
  const [selectedLeaderboardId, setSelectedLeaderboardId] = useState<string>("");
  const { bookmarkedIds, toggleBookmark } = useBookmarks("dataset");

  useEffect(() => {
    const fetchDataset = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${getBackendBaseUrl()}/datasets/${datasetId}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Dataset not found");
          }
          throw new Error("Failed to load dataset");
        }
        const data: Dataset = await res.json();
        setDataset(data);
      } catch (err: any) {
        setError(err.message || "Failed to load dataset");
      } finally {
        setLoading(false);
      }
    };

    if (datasetId) {
      fetchDataset();
    }
  }, [datasetId]);

  // Fetch dataset leaderboards (derived view).
  useEffect(() => {
    if (!datasetId) return;
    const controller = new AbortController();
    setLeaderboardsLoading(true);
    (async () => {
      try {
        const url = new URL(`${getBackendBaseUrl()}/datasets/${datasetId}/leaderboards`);
        url.searchParams.set("limit_entries", "10");
        const res = await fetch(url.toString(), { signal: controller.signal });
        if (!res.ok) {
          setLeaderboards([]);
          return;
        }
        const data: DatasetLeaderboardListResponse = await res.json();
        const items = data.items || [];
        setLeaderboards(items);

        // Bulk fetch paper titles for entries shown.
        const paperIds = Array.from(
          new Set(
            items
              .flatMap((lb) => lb.entries || [])
              .map((e) => e.paper_id)
              .filter(Boolean)
          )
        );
        if (paperIds.length === 0) return;

        const missing = paperIds.filter((id) => !paperTitleById[id]);
        if (missing.length === 0) return;

        const chunks: string[][] = [];
        for (let i = 0; i < missing.length; i += 200) chunks.push(missing.slice(i, i + 200));

        for (const chunk of chunks) {
          const bulkUrl = new URL(`${getBackendBaseUrl()}/papers/bulk`);
          chunk.forEach((id) => bulkUrl.searchParams.append("ids", id));
          const r = await fetch(bulkUrl.toString(), { signal: controller.signal });
          if (!r.ok) continue;
          const papersData: PaperListResponse = await r.json();
          const fetched = papersData.items || [];
          if (fetched.length === 0) continue;
          setPaperTitleById((prev) => {
            const next = { ...prev };
            for (const p of fetched) {
              if (p?.id) next[p.id] = stripWrappingQuotes(p.title || "");
            }
            return next;
          });
          setPaperLogicalIdById((prev) => {
            const next = { ...prev };
            for (const p of fetched) {
              if (p?.id && p.logical_id) next[p.id] = String(p.logical_id);
            }
            return next;
          });
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setLeaderboards([]);
      } finally {
        setLeaderboardsLoading(false);
      }
    })();
    return () => controller.abort();
    // paperTitleById intentionally omitted: we only use it to skip already-known titles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  const leaderboardsSorted = useMemo(() => {
    const copy = [...(leaderboards || [])];
    copy.sort((a, b) => {
      const am = (a.metric_name || "").toLowerCase();
      const bm = (b.metric_name || "").toLowerCase();
      if (am < bm) return -1;
      if (am > bm) return 1;
      const at = (a.task_id || "").toLowerCase();
      const bt = (b.task_id || "").toLowerCase();
      if (at < bt) return -1;
      if (at > bt) return 1;
      return (a.id || "").localeCompare(b.id || "");
    });
    return copy;
  }, [leaderboards]);

  // Default to first metric (alphabetical) once we have data.
  useEffect(() => {
    if (selectedLeaderboardId) return;
    if (leaderboardsSorted.length === 0) return;
    setSelectedLeaderboardId(leaderboardsSorted[0].id);
  }, [leaderboardsSorted, selectedLeaderboardId]);

  const togglePapers = async () => {
    const next = !papersOpen;
    setPapersOpen(next);
    if (!next) return;
    if (papers.length > 0) return;
    if (papersLoading) return;

    setPapersLoading(true);
    try {
      const url = new URL(`${getBackendBaseUrl()}/datasets/${datasetId}/papers`);
      url.searchParams.set("limit", "10");
      url.searchParams.set("offset", "0");
      const res = await fetch(url.toString());
      if (!res.ok) return;
      const data: PaperListResponse = await res.json();
      setPapers(data.items || []);
    } finally {
      setPapersLoading(false);
    }
  };

  const taskIds = dataset?.task_ids || [];
  const totalTaskCount = taskIds.length;
  const visibleTaskIds = useMemo(() => {
    if (showAllTasks) return taskIds;
    return taskIds.slice(0, 7);
  }, [taskIds, showAllTasks]);

  // Resolve task_ids -> task names for this dataset.
  // Performance: only fetch the first 7 initially; fetch all when expanded.
  useEffect(() => {
    if (!dataset || visibleTaskIds.length === 0) return;

    const controller = new AbortController();
    setTasksLoading(true);
    (async () => {
      try {
        // Only request IDs we don't already have.
        const missing = visibleTaskIds.filter((id) => !tasksById[id]);
        if (missing.length === 0) return;

        const chunks: string[][] = [];
        for (let i = 0; i < missing.length; i += 200) chunks.push(missing.slice(i, i + 200));

        for (const chunk of chunks) {
          const url = new URL(`${getBackendBaseUrl()}/tasks/bulk`);
          chunk.forEach((id) => url.searchParams.append("ids", id));
          const res = await fetch(url.toString(), { signal: controller.signal });
          if (!res.ok) continue;
          const data: TasksResponse = await res.json();
          const items = data.items || [];
          if (items.length === 0) continue;
          setTasksById((prev) => {
            const next = { ...prev };
            for (const t of items) next[t.id] = t;
            return next;
          });
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      } finally {
        setTasksLoading(false);
      }
    })();

    return () => controller.abort();
  }, [dataset, visibleTaskIds, tasksById]);

  const formatMetricValue = (v: number) => {
    if (!Number.isFinite(v)) return "-";
    // Keep it readable but compact (Geekbench-style "Score" column).
    const abs = Math.abs(v);
    if (abs >= 1000) return Math.round(v).toString();
    if (abs >= 10) return v.toFixed(2);
    return v.toFixed(4);
  };

  const selectedLeaderboard = useMemo(() => {
    if (!selectedLeaderboardId) return null;
    return leaderboardsSorted.find((lb) => lb.id === selectedLeaderboardId) || null;
  }, [leaderboardsSorted, selectedLeaderboardId]);

  const leaderboardLabel = (lb: DatasetLeaderboard) => {
    const taskName = tasksById[lb.task_id]?.name;
    // Never show raw IDs to users (task_id is often a hash-like identifier).
    return taskName ? `${lb.metric_name} · ${taskName}` : lb.metric_name;
  };

  const barPct = (lb: DatasetLeaderboard, value: number, best: number) => {
    if (!Number.isFinite(value) || !Number.isFinite(best)) return 0;
    if (lb.higher_is_better) {
      if (best === 0) return 0;
      return Math.max(0, Math.min(100, (value / best) * 100));
    }
    // Lower is better: normalize against best (min). If values are non-positive, fall back to 0.
    if (value <= 0 || best <= 0) return 0;
    return Math.max(0, Math.min(100, (best / value) * 100));
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-7xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px] px-4 sm:px-6 lg:px-8 py-24">
        <div className="flex flex-col items-center justify-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-500 font-medium">Loading dataset details...</p>
        </div>
      </div>
    );
  }

  if (error || !dataset) {
    return (
      <div className="mx-auto w-full max-w-7xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px] px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-red-600">{error || "Dataset not found"}</div>
        <Link href="/benchmark" className="text-green-600 hover:underline mt-4 inline-block">
          ← Back to Benchmarks
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <Link href="/benchmark" className="text-green-600 hover:underline inline-flex items-center gap-1">
        <span>←</span> Back to Benchmarks
      </Link>

      <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm">
        <div className="flex items-start gap-6">
          <div className="flex-shrink-0 w-32 h-32 relative rounded-xl border border-gray-100 overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 group">
            <Image
              src={getDomainIcon(dataset.domain)}
              alt={`${dataset.domain || 'dataset'} icon`}
              fill
              sizes="128px"
              className="object-contain p-3"
            />
            {/* Bookmark button overlay */}
            <button
              onClick={() => datasetId && toggleBookmark(datasetId, dataset.name)}
              className={`absolute top-2 right-2 p-2 rounded-full border transition-all shadow-sm ${datasetId && bookmarkedIds[datasetId]
                ? "border-green-300 bg-green-50 text-green-800 opacity-100"
                : "border-white bg-white/90 text-gray-600 opacity-0 group-hover:opacity-100"
                }`}
              title={datasetId && bookmarkedIds[datasetId] ? "Remove bookmark" : "Add bookmark"}
              aria-label={datasetId && bookmarkedIds[datasetId] ? "Remove bookmark" : "Add bookmark"}
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {datasetId && bookmarkedIds[datasetId] ? "🔖" : "📑"}
              </span>
            </button>
          </div>

          <div className="flex-1">
            <h1 className="text-4xl font-bold text-gray-900">
              <MathText>{dataset.name}</MathText>
            </h1>
            {dataset.full_name && dataset.full_name !== dataset.name && (
              <p className="text-xl text-gray-600 mt-2">
                <MathText>{dataset.full_name}</MathText>
              </p>
            )}

            <div className="flex flex-wrap gap-2 mt-4">
              {dataset.domain && (
                <span className="px-3 py-1 text-sm bg-gray-100 text-gray-800 rounded-full">
                  {dataset.domain}
                </span>
              )}
              {dataset.modalities && dataset.modalities.map((modality) => (
                <span key={modality} className="px-3 py-1 text-sm bg-green-50 text-green-700 border border-green-100 rounded-full">
                  {modality}
                </span>
              ))}
              {(dataset.task_ids && dataset.task_ids.length > 0) && (
                <>
                  {visibleTaskIds
                    .map((id) => tasksById[id]?.name)
                    .filter(Boolean)
                    .map((name) => (
                      <span
                        key={name as string}
                        className="px-3 py-1 text-sm bg-blue-50 text-blue-700 border border-blue-100 rounded-full"
                      >
                        {name as string}
                      </span>
                    ))}
                  {!showAllTasks && totalTaskCount > 7 && (
                    <button
                      type="button"
                      onClick={() => setShowAllTasks(true)}
                      className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 px-1 py-0.5"
                    >
                      Show all tasks <span aria-hidden>»</span>
                    </button>
                  )}
                  {showAllTasks && totalTaskCount > 7 && (
                    <button
                      type="button"
                      onClick={() => setShowAllTasks(false)}
                      className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 px-1 py-0.5"
                    >
                      <span aria-hidden>«</span> Hide tasks
                    </button>
                  )}
                  {tasksLoading && (
                    <span className="px-3 py-1 text-sm bg-blue-50 text-blue-400 border border-blue-100 rounded-full">
                      Loading tasks…
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {dataset.description && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Description</h2>
            <p className="text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
              <MathText>{stripTrailingSourceLink(dataset.description)}</MathText>
            </p>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-6">
          {dataset.homepage && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Homepage</h3>
              <a
                href={dataset.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-600 hover:underline break-all"
              >
                {dataset.homepage}
              </a>
            </div>
          )}

          {dataset.introduced_date && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Introduced</h3>
              <p className="text-gray-700">{new Date(dataset.introduced_date).toLocaleDateString()}</p>
            </div>
          )}

          {dataset.languages && dataset.languages.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Languages</h3>
              <p className="text-gray-700">{dataset.languages.join(", ")}</p>
            </div>
          )}

          {dataset.variants && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Variants</h3>
              {(() => {
                const filteredVariants = dataset.variants.filter(
                  (v) => v.toLowerCase() !== dataset.name.toLowerCase()
                );
                if (filteredVariants.length === 0) {
                  return <p className="text-gray-500 italic">No variants</p>;
                }
                return <p className="text-gray-700">{filteredVariants.join(", ")}</p>;
              })()}
            </div>
          )}

          {dataset.paper_count !== undefined && dataset.paper_count > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Papers</h3>
              <button
                type="button"
                onClick={togglePapers}
                className="inline-flex items-center gap-2 text-gray-700 hover:text-green-700"
                aria-expanded={papersOpen}
              >
                <span>
                  {dataset.paper_count} {dataset.paper_count === 1 ? "paper" : "papers"}
                </span>
                <span className="text-gray-400" aria-hidden>
                  {papersOpen ? "▴" : "▾"}
                </span>
              </button>

              {papersOpen && (
                <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  {papersLoading ? (
                    <div className="text-sm text-gray-500">Loading papers…</div>
                  ) : papers.length === 0 ? (
                    <div className="text-sm text-gray-500">No paper references found.</div>
                  ) : (
                    <div className="space-y-1">
                      {papers.slice(0, 10).map((p) => (
                        <a
                          key={p.id}
                          href={`/papers/${p.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-sm text-green-700 hover:underline"
                        >
                          {p.title || p.id}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Leaderboards */}
        <div className="mt-6 pt-6 border-t border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Leaderboards</h2>

          {leaderboardsLoading ? (
            <div className="mt-4 text-sm text-gray-500">Loading leaderboards…</div>
          ) : leaderboardsSorted.length === 0 ? (
            <div className="mt-4 text-sm text-gray-500">No leaderboard data yet for this dataset.</div>
          ) : (
            <div className="mt-4">
              {/* Metric selector (Geekbench-style: one chart at a time) */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-sm font-medium bg-green-50 text-green-700 border border-green-100 w-fit">
                  Metric
                </span>
                <div className="relative w-full sm:w-auto">
                  <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
                      />
                    </svg>
                  </div>
                  <select
                    value={selectedLeaderboardId || leaderboardsSorted[0]?.id || ""}
                    onChange={(e) => setSelectedLeaderboardId(e.target.value)}
                    className="w-full sm:w-auto pl-11 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    {leaderboardsSorted.map((lb) => (
                      <option key={lb.id} value={lb.id}>
                        {leaderboardLabel(lb)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Selected metric bar chart */}
              {selectedLeaderboard ? (
                (() => {
                  const lb = selectedLeaderboard;
                  const entriesAll = lb.entries || [];
                  // Dedupe by logical_id (if available), otherwise by paper_id.
                  const seenLogical = new Set<string>();
                  const entries = entriesAll.filter((e) => {
                    const lid = paperLogicalIdById[e.paper_id] || e.paper_id;
                    if (!lid) return false;
                    if (seenLogical.has(lid)) return false;
                    seenLogical.add(lid);
                    return true;
                  });
                  const values = entries.map((e) => e.metric_value).filter((v) => Number.isFinite(v)) as number[];
                  const best = lb.higher_is_better ? Math.max(...values, 0) : Math.min(...values, 0);
                  return (
                    <div className="mt-4 rounded-xl border border-gray-200 bg-white overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate">{leaderboardLabel(lb)}</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {lb.higher_is_better ? "Higher is better" : "Lower is better"}
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 whitespace-nowrap">Top {entries.length}</div>
                        </div>
                      </div>

                      {entries.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500">No entries.</div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {entries.map((e, idx) => {
                            const paperTitle = stripWrappingQuotes(paperTitleById[e.paper_id] || "");
                            const paperLabel = paperTitle || "Untitled paper";
                            const pct = barPct(lb, e.metric_value, best);
                            return (
                              <div
                                key={`${lb.id}:${e.paper_id}:${e.paper_result_id}`}
                                className="px-4 py-3 flex items-center gap-4"
                              >
                                <div className="w-8 text-sm text-gray-500 tabular-nums">{idx + 1}</div>
                                <div className="flex-1 min-w-0">
                                  <a
                                    href={`/papers/${e.paper_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-medium text-gray-900 hover:text-green-700 hover:underline truncate block"
                                    title={paperLabel}
                                  >
                                    {paperLabel}
                                  </a>
                                  <div className="mt-2 h-2 w-full rounded bg-gray-200 overflow-hidden">
                                    <div
                                      className="h-2 rounded bg-green-500"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                                <div className="w-24 text-right text-sm font-semibold text-gray-900 tabular-nums">
                                  {formatMetricValue(e.metric_value)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : null}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}


