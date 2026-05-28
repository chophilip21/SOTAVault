"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getBackendBaseUrl } from "@/lib/backendUrl";
import {
  cleanMetricDescription,
  formatMetricSubtitle,
  isPlausibleLeaderboardMetricValue,
  type MetricDirection,
} from "@/lib/metricDescription";
import { formatLeaderboardModelVariant } from "@/lib/modelVariant";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { MathText } from "@/lib/mathText";
import { inter } from "@/lib/fonts";
import { cleanPaperTitle } from "@/lib/paperTitle";

/** Matches GET /datasets/:id → metrics (same direction metadata as leaderboards). */
type DatasetMetric = {
  description: string;
  direction: MetricDirection;
  range_max: number | null;
  range_min: number | null;
};

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
  series_id: string;
  series_name?: string;
  metrics?: Record<string, DatasetMetric>;
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

type PaperRef = {
  id: string;
  title?: string | null;
  logical_id?: string | null;
  official_code?: string[];
  unofficial_code?: string[];
};
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
  has_code?: boolean;
  model_variant?: string | null;
  created_at?: string;
};

/** Matches GET /datasets/:id/leaderboards items. */
type DatasetLeaderboard = {
  id: string;
  dataset_id: string;
  task_id: string;
  metric_name: string;
  direction: MetricDirection;
  metric_description?: string | null;
  metric_range_max?: number | null;
  entries: DatasetLeaderboardEntry[];
  top_k: number;
  computed_at?: string;
};

type DatasetLeaderboardListResponse = {
  items: DatasetLeaderboard[];
  limit_entries?: number | null;
};

type EntryValueStats = { min: number; max: number };

const LEADERBOARD_PAGE_SIZE = 50;

function entryValueStats(entries: DatasetLeaderboardEntry[]): EntryValueStats | null {
  const values = entries.map((e) => e.metric_value).filter((v) => Number.isFinite(v));
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** Bar width 0–100 from API ``direction`` + values in the current leaderboard slice. */
function barWidthPercent(
  direction: MetricDirection,
  value: number,
  stats: EntryValueStats | null,
  rangeMax: number | null | undefined,
): number {
  if (!Number.isFinite(value)) return 0;

  const span = (v: number, min: number, max: number) => {
    if (max === min) return v >= max ? 100 : 0;
    return Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  };

  if (direction === "higher" || direction === "target_centered") {
    if (rangeMax != null && rangeMax > 0) {
      return Math.max(0, Math.min(100, (value / rangeMax) * 100));
    }
    return stats ? span(value, stats.min, stats.max) : 0;
  }

  if (direction === "lower") {
    if (rangeMax != null && rangeMax > 0) {
      return Math.max(0, Math.min(100, (value / rangeMax) * 100));
    }
    return stats ? span(value, stats.min, stats.max) : 0;
  }

  if (direction === "zero_centered") {
    const abs = Math.abs(value);
    let deviation = 0;
    if (rangeMax != null && rangeMax > 0) {
      deviation = Math.max(0, Math.min(100, (abs / rangeMax) * 100));
    } else if (stats) {
      const cap = Math.max(Math.abs(stats.min), Math.abs(stats.max));
      deviation = cap === 0 ? 0 : Math.max(0, Math.min(100, (abs / cap) * 100));
    }
    return Math.max(0, Math.min(100, 100 - deviation));
  }

  return stats ? span(value, stats.min, stats.max) : 0;
}

function barFillClass(direction: MetricDirection): string {
  return direction === "lower"
    ? "bg-gradient-to-r from-orange-400 to-orange-600"
    : "bg-gradient-to-r from-green-400 to-green-600";
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

const CodeIcon = () => (
  <span title="Code available" className="ml-1.5 opacity-70 hover:opacity-100 transition-opacity">
    <i className="fa-solid fa-file-code text-gray-900" aria-hidden="true" />
  </span>
);

const LeaderboardGitHubIcon = () => (
  <span
    title="Code on GitHub"
    className="ml-1.5 inline-flex shrink-0 text-gray-800 opacity-80 hover:opacity-100 transition-opacity"
    aria-label="Code on GitHub"
  >
    <i className="fa-brands fa-github text-base" aria-hidden="true" />
  </span>
);

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
  const [selectedLeaderboardId, setSelectedLeaderboardId] = useState<string>("");
  const [leaderboardPage, setLeaderboardPage] = useState(1);
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

  // Fetch leaderboards + paper titles + task labels before showing the module.
  useEffect(() => {
    if (!datasetId) return;
    const controller = new AbortController();
    const { signal } = controller;

    setLeaderboardsLoading(true);
    setLeaderboards([]);
    setPaperTitleById({});
    setSelectedLeaderboardId("");

    (async () => {
      try {
        const url = new URL(`${getBackendBaseUrl()}/datasets/${datasetId}/leaderboards`);
        url.searchParams.set("limit_entries", "100");
        const res = await fetch(url.toString(), { signal });
        if (!res.ok) {
          if (!signal.aborted) setLeaderboards([]);
          return;
        }
        const data: DatasetLeaderboardListResponse = await res.json();
        const items = data.items || [];

        const paperIds = Array.from(
          new Set(
            items
              .flatMap((lb) => lb.entries || [])
              .map((e) => e.paper_id)
              .filter(Boolean),
          ),
        );

        const titles: Record<string, string> = {};
        for (let i = 0; i < paperIds.length; i += 200) {
          const chunk = paperIds.slice(i, i + 200);
          const bulkUrl = new URL(`${getBackendBaseUrl()}/papers/bulk`);
          chunk.forEach((id) => bulkUrl.searchParams.append("ids", id));
          const r = await fetch(bulkUrl.toString(), { signal });
          if (!r.ok) continue;
          const papersData: PaperListResponse = await r.json();
          const returned = new Set<string>();
          for (const p of papersData.items || []) {
            if (!p?.id) continue;
            returned.add(p.id);
            titles[p.id] = cleanPaperTitle(p.title);
          }
          for (const id of chunk) {
            if (!returned.has(id)) titles[id] = "";
          }
        }

        const lbTaskIds = Array.from(
          new Set(items.map((lb) => lb.task_id).filter(Boolean)),
        );
        const taskPatch: Record<string, Task> = {};
        for (let i = 0; i < lbTaskIds.length; i += 200) {
          const chunk = lbTaskIds.slice(i, i + 200);
          const taskUrl = new URL(`${getBackendBaseUrl()}/tasks/bulk`);
          chunk.forEach((id) => taskUrl.searchParams.append("ids", id));
          const tr = await fetch(taskUrl.toString(), { signal });
          if (!tr.ok) continue;
          const taskData: TasksResponse = await tr.json();
          for (const t of taskData.items || []) {
            if (t?.id) taskPatch[t.id] = t;
          }
        }

        if (signal.aborted) return;

        setPaperTitleById(titles);
        if (Object.keys(taskPatch).length > 0) {
          setTasksById((prev) => ({ ...prev, ...taskPatch }));
        }
        setLeaderboards(items);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (!signal.aborted) setLeaderboards([]);
      } finally {
        if (!signal.aborted) setLeaderboardsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [datasetId]);

  const leaderboardsSorted = useMemo(() => {
    const copy = [...(leaderboards || [])];
    copy.sort((a, b) => {
      const am = (a.metric_name || "").toLowerCase();
      const bm = (b.metric_name || "").toLowerCase();
      if (am < bm) return -1;
      if (am > bm) return 1;
      return (a.id || "").localeCompare(b.id || "");
    });
    return copy;
  }, [leaderboards]);

  const selectedLeaderboard = useMemo(() => {
    if (!selectedLeaderboardId) return null;
    return leaderboardsSorted.find((lb) => lb.id === selectedLeaderboardId) || null;
  }, [leaderboardsSorted, selectedLeaderboardId]);

  // Default to first metric (alphabetical) once we have data.
  useEffect(() => {
    if (selectedLeaderboardId) return;
    if (leaderboardsSorted.length === 0) return;
    setSelectedLeaderboardId(leaderboardsSorted[0].id);
  }, [leaderboardsSorted, selectedLeaderboardId]);

  useEffect(() => {
    setLeaderboardPage(1);
  }, [selectedLeaderboardId]);

  const selectedLeaderboardEntries = useMemo(() => {
    if (!selectedLeaderboard) return [];
    const rangeMax = selectedLeaderboard.metric_range_max;
    const direction = selectedLeaderboard.direction;
    return (selectedLeaderboard.entries || []).filter((e) => {
      if (!isPlausibleLeaderboardMetricValue(e.metric_value, rangeMax, direction)) {
        return false;
      }
      if (Object.keys(paperTitleById).length > 0) {
        const title = paperTitleById[e.paper_id];
        const paperLabel = (title || "").trim().toLowerCase();
        if (!paperLabel || paperLabel === "untitled paper" || paperLabel === "untitled" || paperLabel.includes("survey")) {
          return false;
        }
      }
      return true;
    });
  }, [selectedLeaderboard, paperTitleById]);

  const leaderboardTotalPages = Math.max(
    1,
    Math.ceil(selectedLeaderboardEntries.length / LEADERBOARD_PAGE_SIZE),
  );
  const safeLeaderboardPage = Math.min(leaderboardPage, leaderboardTotalPages);
  const leaderboardPageStart = (safeLeaderboardPage - 1) * LEADERBOARD_PAGE_SIZE;
  const leaderboardPageEntries = selectedLeaderboardEntries.slice(
    leaderboardPageStart,
    leaderboardPageStart + LEADERBOARD_PAGE_SIZE,
  );
  const leaderboardHasPrev = safeLeaderboardPage > 1;
  const leaderboardHasNext = safeLeaderboardPage < leaderboardTotalPages;

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

  const leaderboardLabel = (lb: DatasetLeaderboard) => {
    const taskName = tasksById[lb.task_id]?.name;
    // Never show raw IDs to users (task_id is often a hash-like identifier).
    return taskName ? `${lb.metric_name} · ${taskName}` : lb.metric_name;
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

  const isBookmarked = Boolean(datasetId && bookmarkedIds[datasetId]);

  return (
    <div className="mx-auto w-full max-w-7xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {dataset.series_id ? (
        <Link href={`/dataset-series/${dataset.series_id}`} className="text-green-600 hover:underline inline-flex items-center gap-1">
          <span>←</span> Back to {dataset.series_name || 'Series'}
        </Link>
      ) : (
        <Link href="/benchmark" className="text-green-600 hover:underline inline-flex items-center gap-1">
          <span>←</span> Back to Benchmarks
        </Link>
      )}

      <div className="bg-white border border-gray-100 rounded-2xl p-4 md:p-8 shadow-sm">
        <div className="flex flex-col items-center md:flex-row md:items-start gap-4 md:gap-6">
          <div className="flex-shrink-0 w-24 h-24 md:w-32 md:h-32 relative rounded-xl border border-gray-100 overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
            <Image
              src={getDomainIcon(dataset.domain)}
              alt={`${dataset.domain || 'dataset'} icon`}
              fill
              sizes="(max-width: 768px) 96px, 128px"
              className="object-contain p-2 md:p-3"
            />
          </div>

          <div className="flex-1 min-w-0 w-full max-md:text-center md:text-left">
            <div className="flex flex-col max-md:items-center md:flex-row md:items-start md:justify-between gap-3 md:gap-4">
              <div className="min-w-0 flex-1">
                <h1 className={`text-2xl md:text-4xl font-bold text-gray-900 tracking-tight break-words ${inter.className}`}>
                  <MathText>{dataset.name}</MathText>
                </h1>
                {dataset.full_name && dataset.full_name !== dataset.name && (
                  <p className="text-base md:text-xl text-gray-600 mt-2 break-words">
                    <MathText>{dataset.full_name}</MathText>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => datasetId && toggleBookmark(datasetId, dataset.name)}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full border-2 transition-all text-xs sm:text-sm font-semibold shrink-0 shadow-sm ${isBookmarked
                  ? "border-green-600 bg-green-600 text-white hover:bg-green-700 hover:border-green-700 shadow-green-600/25"
                  : "border-[#007a3a] bg-[#007a3a] text-white hover:bg-[#006631] hover:border-[#006631] shadow-[rgba(0,122,58,0.25)]"
                  }`}
                title={isBookmarked ? "Remove bookmark" : "Bookmark this dataset"}
                aria-pressed={isBookmarked}
              >
                <span aria-hidden="true">{isBookmarked ? "🔖" : "📑"}</span>
                <span>{isBookmarked ? "Bookmarked" : "Bookmark"}</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mt-4 max-md:justify-center md:justify-start w-full">
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
              <MathText>{cleanMetricDescription(dataset.description || "")}</MathText>
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
                      {papers.slice(0, 10).map((p) => {
                        const hasCode = (p.official_code && p.official_code.length > 0) || (p.unofficial_code && p.unofficial_code.length > 0);
                        return (
                          <div key={p.id} className="flex items-center">
                            <a
                              href={`/papers/${p.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-green-700 hover:underline"
                            >
                              {cleanPaperTitle(p.title) || p.id}
                            </a>
                            {hasCode && <CodeIcon />}
                          </div>
                        );
                      })}
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
            <div className="mt-8 flex flex-col items-center justify-center py-12">
              <LoadingSpinner size="md" />
              <p className="mt-3 text-sm text-gray-500">Loading leaderboards…</p>
            </div>
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
                  const { direction, metric_description: metricDescription, metric_range_max: rangeMax } = lb;
                  const entries = leaderboardPageEntries;
                  const totalEntries = selectedLeaderboardEntries.length;
                  const stats = entryValueStats(selectedLeaderboardEntries);
                  const subtitle = formatMetricSubtitle(metricDescription, direction);
                  const rangeEnd = leaderboardPageStart + entries.length;
                  const rangeLabel =
                    totalEntries === 0
                      ? ""
                      : entries.length === 0
                        ? `0 of ${totalEntries}`
                        : `${leaderboardPageStart + 1}–${rangeEnd} of ${totalEntries}`;

                  const goLeaderboardPrev = () => {
                    if (!leaderboardHasPrev) return;
                    setLeaderboardPage((p) => Math.max(1, p - 1));
                  };
                  const goLeaderboardNext = () => {
                    if (!leaderboardHasNext) return;
                    setLeaderboardPage((p) => p + 1);
                  };

                  return (
                    <div className="mt-4 rounded-xl border border-gray-200 bg-white overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate">{leaderboardLabel(lb)}</div>
                            {subtitle ? (
                              <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>
                            ) : null}
                          </div>
                          <div className="text-xs text-gray-500 whitespace-nowrap">{rangeLabel}</div>
                        </div>
                      </div>

                      {entries.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500">No entries.</div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {entries.map((e, idx) => {
                            const paperTitle = paperTitleById[e.paper_id] || "";
                            const paperLabel = paperTitle || "Untitled paper";
                            const modelVariant = formatLeaderboardModelVariant(e.model_variant);
                            const pct = barWidthPercent(direction, e.metric_value, stats, rangeMax);
                            const fillClass = barFillClass(direction);
                            return (
                              <div
                                key={`${lb.id}:${e.paper_id}:${e.paper_result_id}`}
                                className="px-4 py-3 flex items-center gap-4"
                              >
                                <div className="w-8 text-sm text-gray-500 tabular-nums">{leaderboardPageStart + idx + 1}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center min-w-0">
                                      <a
                                        href={`/papers/${e.paper_id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm font-medium text-gray-900 hover:text-green-700 hover:underline truncate"
                                        title={
                                          modelVariant
                                            ? `${paperLabel} — ${modelVariant}`
                                            : paperLabel
                                        }
                                      >
                                        {paperLabel}
                                      </a>
                                      {e.has_code && <LeaderboardGitHubIcon />}
                                    </div>
                                    {modelVariant ? (
                                      <div
                                        className="text-xs text-gray-500 mt-0.5 truncate"
                                        title={modelVariant}
                                      >
                                        <MathText>{modelVariant}</MathText>
                                      </div>
                                    ) : null}
                                    <div
                                      className={`mt-2 h-2 w-full rounded overflow-hidden ${direction === "lower" ? "bg-green-100" : "bg-gray-200"}`}
                                      title={
                                        rangeMax != null && rangeMax > 0
                                          ? `${formatMetricValue(e.metric_value)} / ${formatMetricValue(rangeMax)}`
                                          : undefined
                                      }
                                    >
                                      <div
                                        className={`h-2 rounded ${fillClass}`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
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

                      {leaderboardTotalPages > 1 ? (
                        <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={goLeaderboardPrev}
                            disabled={!leaderboardHasPrev}
                            className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-700 disabled:opacity-50 enabled:hover:bg-gray-50 enabled:hover:border-gray-300"
                          >
                            Previous
                          </button>
                          <div
                            className="inline-flex items-center justify-center w-9 h-9 rounded bg-cyan-500/80 text-white font-serif font-thin select-none"
                            aria-label={`Leaderboard page ${safeLeaderboardPage}`}
                            title={`Page ${safeLeaderboardPage}`}
                            role="status"
                          >
                            {safeLeaderboardPage}
                          </div>
                          <button
                            type="button"
                            onClick={goLeaderboardNext}
                            disabled={!leaderboardHasNext}
                            className="px-4 py-2 text-sm rounded bg-green-500 text-white disabled:opacity-50 enabled:hover:bg-green-600"
                          >
                            Next
                          </button>
                        </div>
                      ) : null}
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
