"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { Playfair_Display } from "next/font/google";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { config } from "@/lib/config";
import { getBackendBaseUrl } from "@/lib/backendUrl";
import { useAuth } from "@/lib/authContext";
import { useBookmarks } from "@/hooks/useBookmarks";
import { MathText } from "@/lib/mathText";

const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: ["700"] });

// Cache for tasks data
let tasksCache: Task[] | null = null;
let tasksCacheTime: number | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Persist Benchmark tab state so navigating to a dataset and back doesn't reset filters/page.
const BENCHMARK_STATE_KEY = "mlbench:benchmark_state:v2";
const BENCHMARK_STATE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function hasMeaningfulBenchmarkState(s: any): boolean {
  if (!s || typeof s !== "object") return false;
  if (Array.isArray(s.benchmarks) && s.benchmarks.length > 0) return true;
  if (Array.isArray(s.searchResults)) return true; // search mode explicitly stores an array
  if (typeof s.searchQuery === "string" && s.searchQuery.trim().length > 0) return true;
  if (typeof s.currentCursor === "string" && s.currentCursor.length > 0) return true;
  if (typeof s.nextCursor === "string" && s.nextCursor.length > 0) return true;
  if (s.hasMore === true) return true;
  if (typeof s.appliedDomain === "string" && s.appliedDomain.length > 0) return true;
  if (typeof s.appliedTask === "string" && s.appliedTask.length > 0) return true;
  return false;
}

const PRESET_TASKS = [
  "face-detection",
  "learning-theory",
  "3d-action-recognition",
  "quantization"
];

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

const getDomainIcon = (domain?: string): string => {
  if (!domain) return "/icons/cv.png";
  return DOMAIN_ICONS[domain] || "/icons/cv.png";
};

interface Benchmark {
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

interface BenchmarksResponse {
  items: Benchmark[];
  limit: number;
  next_cursor?: string | null;
  has_more: boolean;
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

type PaperRef = { id: string; title?: string | null };
type PaperListResponse = {
  items: PaperRef[];
  limit: number;
  next_cursor?: string | null;
  has_more: boolean;
};

const DOMAIN_OPTIONS = [
  { value: "", label: "All Domains" },
  { value: "cv", label: "Computer Vision" },
  { value: "nlp", label: "Natural Language Processing" },
  { value: "audio", label: "Audio" },
  { value: "robots", label: "Robotics" },
  { value: "time_series_tabular", label: "Time Series & Tabular" },
  { value: "graph", label: "Graph" },
  { value: "multimodal", label: "Multimodal" },
  { value: "theory", label: "Theory" },
  { value: "efficient", label: "Efficient ML" },
  { value: "other", label: "Other" },
];

export default function BenchmarkPage() {
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [prevCursors, setPrevCursors] = useState<Array<string | null>>([null]);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [limit] = useState(12);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Benchmark[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const MIN_CHARS = 3;
  const DEBOUNCE_MS = 350;

  // Temporary filter states (not yet applied)
  const [selectedDomain, setSelectedDomain] = useState("");
  const [selectedTask, setSelectedTask] = useState("");

  // Applied filter states (used for actual filtering)
  const [appliedDomain, setAppliedDomain] = useState("");
  const [appliedTask, setAppliedTask] = useState("");

  const [tasks, setTasks] = useState<Task[]>([]);
  const [bulkTasksById, setBulkTasksById] = useState<Record<string, Task>>({});
  const [tasksLoading, setTasksLoading] = useState(false);
  const requestedTaskIdsRef = useRef<Set<string>>(new Set());
  const missingTaskIdsRef = useRef<Set<string>>(new Set());
  const [taskSearchOpen, setTaskSearchOpen] = useState(false);
  const [taskSearchQuery, setTaskSearchQuery] = useState("");

  // On-demand "papers using this dataset" preview.
  const [openPapersFor, setOpenPapersFor] = useState<string | null>(null);
  const [papersByDatasetId, setPapersByDatasetId] = useState<Record<string, PaperRef[]>>({});
  const [papersLoadingByDatasetId, setPapersLoadingByDatasetId] = useState<Record<string, boolean>>({});
  const taskDropdownRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const skipNextSearchEffectRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);

  const { bookmarkedIds, toggleBookmark } = useBookmarks("dataset");

  const fetchPage = async (cursor: string | null, task?: string, domain?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`${getBackendBaseUrl()}/datasets/`);
      url.searchParams.set("limit", limit.toString());
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }

      const taskToUse = task !== undefined ? task : appliedTask;
      if (taskToUse) {
        url.searchParams.set("task_id", taskToUse);
      }

      const domainToUse = domain !== undefined ? domain : appliedDomain;
      if (domainToUse) {
        url.searchParams.set("domain", domainToUse);
      }

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load benchmarks");
      const data: BenchmarksResponse = await res.json();

      setBenchmarks(data.items || []);
      const next = data.next_cursor ?? null;
      setNextCursor(next);
      setHasMore(data.has_more ?? false);
      setCurrentCursor(cursor || null);
    } catch (err: any) {
      setError(err.message || "Failed to load benchmarks");
    } finally {
      setLoading(false);
    }
  };

  const fetchTasks = async () => {
    // Check cache first
    const now = Date.now();
    if (tasksCache && tasksCacheTime && (now - tasksCacheTime) < CACHE_DURATION) {
      setTasks(tasksCache);
      return;
    }

    setTasksLoading(true);
    try {
      const url = new URL(`${getBackendBaseUrl()}/tasks/`);
      url.searchParams.set("limit", "100");

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load tasks");
      const data: TasksResponse = await res.json();

      const taskList = data.items || [];
      setTasks(taskList);

      // Update cache
      tasksCache = taskList;
      tasksCacheTime = Date.now();
    } catch (err: any) {
      console.error("Failed to load tasks:", err);
    } finally {
      setTasksLoading(false);
    }
  };

  const fetchTasksBulk = async (taskIds: string[]) => {
    const unique = Array.from(new Set(taskIds.filter(Boolean)));
    if (unique.length === 0) return;

    const localKnown = new Set<string>();
    for (const t of tasks) localKnown.add(t.id);
    if (tasksCache) for (const t of tasksCache) localKnown.add(t.id);
    for (const id of Object.keys(bulkTasksById)) localKnown.add(id);

    const missing = unique.filter((id) => !localKnown.has(id) && !requestedTaskIdsRef.current.has(id));
    if (missing.length === 0) return;

    // Mark as requested up-front to prevent request storms.
    for (const id of missing) requestedTaskIdsRef.current.add(id);

    const chunks: string[][] = [];
    for (let i = 0; i < missing.length; i += 200) chunks.push(missing.slice(i, i + 200));

    for (const chunk of chunks) {
      try {
        const url = new URL(`${getBackendBaseUrl()}/tasks/bulk`);
        chunk.forEach((id) => url.searchParams.append("ids", id));
        const res = await fetch(url.toString());
        if (!res.ok) {
          // Allow retry later.
          for (const id of chunk) requestedTaskIdsRef.current.delete(id);
          continue;
        }
        const data: TasksResponse = await res.json();
        const items = data.items || [];
        const returned = new Set(items.map((t) => t.id));
        // If the backend returns 200 but doesn't include some ids, treat them as missing
        // so we don't show "Loading tasks…" forever.
        for (const id of chunk) {
          if (!returned.has(id)) missingTaskIdsRef.current.add(id);
        }
        if (items.length === 0) continue;
        setBulkTasksById((prev) => {
          const next = { ...prev };
          for (const t of items) next[t.id] = t;
          return next;
        });
      } catch {
        // Allow retry later.
        for (const id of chunk) requestedTaskIdsRef.current.delete(id);
      }
    }
  };

  useEffect(() => {
    // Best-effort restore of prior state (so Back works even if the route remounts).
    try {
      const raw = sessionStorage.getItem(BENCHMARK_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as any;
        const ts = Number(parsed?.ts || 0);
        if (ts && (Date.now() - ts) < BENCHMARK_STATE_TTL_MS && hasMeaningfulBenchmarkState(parsed)) {
          restoredRef.current = true;

          setBenchmarks(Array.isArray(parsed?.benchmarks) ? parsed.benchmarks : []);
          setNextCursor(typeof parsed?.nextCursor === "string" ? parsed.nextCursor : null);
          setPrevCursors(Array.isArray(parsed?.prevCursors) ? parsed.prevCursors : [null]);
          setCurrentCursor(typeof parsed?.currentCursor === "string" ? parsed.currentCursor : null);
          setHasMore(Boolean(parsed?.hasMore));

          setSelectedDomain(typeof parsed?.selectedDomain === "string" ? parsed.selectedDomain : "");
          setSelectedTask(typeof parsed?.selectedTask === "string" ? parsed.selectedTask : "");
          setAppliedDomain(typeof parsed?.appliedDomain === "string" ? parsed.appliedDomain : "");
          setAppliedTask(typeof parsed?.appliedTask === "string" ? parsed.appliedTask : "");

          const q = typeof parsed?.searchQuery === "string" ? parsed.searchQuery : "";
          const sr = Array.isArray(parsed?.searchResults) ? parsed.searchResults : null;
          if (q) {
            setSearchQuery(q);
            setSearchResults(sr);
            // Prevent immediate re-fetch that would wipe restored results.
            skipNextSearchEffectRef.current = true;
          }



          // Still load the task list for the dropdown (cached client-side).
          fetchTasks();
          return;
        }
      }
    } catch {
      // ignore restore errors
    }

    fetchPage(null);
    fetchTasks();
    setPrevCursors([null]);
    setCurrentCursor(null);
  }, []);

  // Persist state for Back/forward nav. Keep it conservative: only store what we need to restore UX.
  useEffect(() => {
    try {
      // Avoid persisting a "blank" state on first mount before initial fetch completes.
      // Otherwise we can restore emptiness and skip loading on subsequent mounts.
      const shouldPersist =
        benchmarks.length > 0 ||
        searchResults !== null ||
        searchQuery.trim().length > 0 ||
        (currentCursor ?? "") !== "" ||
        (nextCursor ?? "") !== "" ||
        hasMore ||
        appliedDomain !== "" ||
        appliedTask !== "";
      if (!shouldPersist) return;

      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = window.setTimeout(() => {
        try {
          const payload = {
            ts: Date.now(),
            benchmarks,
            nextCursor,
            prevCursors,
            currentCursor,
            hasMore,
            selectedDomain,
            selectedTask,
            appliedDomain,
            appliedTask,
            searchQuery,
            searchResults,
            scrollY: typeof window !== "undefined" ? window.scrollY : 0,
          };
          sessionStorage.setItem(BENCHMARK_STATE_KEY, JSON.stringify(payload));
        } catch {
          // ignore storage errors
        }
      }, 150);
    } catch {
      // ignore storage errors
    }
    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    };
  }, [
    benchmarks,
    nextCursor,
    prevCursors,
    currentCursor,
    hasMore,
    selectedDomain,
    selectedTask,
    appliedDomain,
    appliedTask,
    searchQuery,
    searchResults,
  ]);

  // Debounced Meilisearch-backed dataset search for benchmark tab.
  useEffect(() => {
    const q = searchQuery.trim();

    if (skipNextSearchEffectRef.current) {
      skipNextSearchEffectRef.current = false;
      return;
    }

    if (q.length < MIN_CHARS) {
      searchAbortRef.current?.abort();
      if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
      setSearchLoading(false);
      setSearchResults(null);
      return;
    }

    if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    searchAbortRef.current?.abort();

    searchDebounceRef.current = window.setTimeout(() => {
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearchLoading(true);
      setSearchResults(null);

      const searchUrl = new URL(`${getBackendBaseUrl()}/search/datasets_meili`);
      searchUrl.searchParams.set("q", q);
      searchUrl.searchParams.set("limit", "80");
      searchUrl.searchParams.set("min_chars", String(MIN_CHARS));

      fetch(searchUrl.toString(), { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`datasets_meili ${res.status}`))))
        .then((json: { query: string; hits: Array<{ id: string }> }) => {
          const ids = (json.hits || []).map((h) => h.id).filter(Boolean);
          if (ids.length === 0) {
            setSearchResults([]);
            return;
          }

          const bulkUrl = new URL(`${getBackendBaseUrl()}/datasets/bulk`);
          ids.forEach((id) => bulkUrl.searchParams.append("ids", id));
          return fetch(bulkUrl.toString(), { signal: controller.signal })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`datasets_bulk ${res.status}`))))
            .then((data: BenchmarksResponse) => {
              setSearchResults(data.items || []);
            });
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          setSearchResults([]);
        })
        .finally(() => setSearchLoading(false));
    }, DEBOUNCE_MS);

    return () => {
      if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (taskDropdownRef.current && !taskDropdownRef.current.contains(event.target as Node)) {
        setTaskSearchOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleApplyFilters = () => {
    setAppliedDomain(selectedDomain);
    setAppliedTask(selectedTask);
    if (searchQuery.trim().length < MIN_CHARS) {
      fetchPage(null, selectedTask, selectedDomain);
      setPrevCursors([null]);
      setCurrentCursor(null);
    }
  };

  const handleClearFilters = () => {
    setSelectedDomain("");
    setSelectedTask("");
    setAppliedDomain("");
    setAppliedTask("");
    setSearchQuery("");
    setTaskSearchQuery("");
    setSearchResults(null);
    setBulkTasksById({});
    requestedTaskIdsRef.current = new Set();
    missingTaskIdsRef.current = new Set();
    try {
      sessionStorage.removeItem(BENCHMARK_STATE_KEY);
    } catch {
      // ignore
    }
    fetchPage(null, "", "");
    setPrevCursors([null]);
    setCurrentCursor(null);
  };

  const handleTaskSelect = (taskId: string) => {
    setSelectedTask(taskId);
    setTaskSearchOpen(false);
    setTaskSearchQuery("");
  };

  const formatTaskName = (name: string) => {
    return name.replace(/-/g, " ");
  };

  const getSelectedTaskName = () => {
    if (!selectedTask) return "All Tasks";
    const task = tasks.find(t => t.id === selectedTask);
    return task ? formatTaskName(task.name) : "All Tasks";
  };

  const getFilteredTasks = () => {
    if (!taskSearchQuery.trim()) {
      // Show preset tasks at the top, then alphabetically sorted others
      const presetTaskObjects = tasks.filter(t => PRESET_TASKS.includes(t.id));
      const otherTasks = tasks
        .filter(t => !PRESET_TASKS.includes(t.id))
        .sort((a, b) => a.name.localeCompare(b.name));
      return [...presetTaskObjects, ...otherTasks];
    }

    const query = taskSearchQuery.toLowerCase();
    return tasks
      .filter(task =>
        task.name.toLowerCase().replace(/-/g, " ").includes(query) ||
        task.id.toLowerCase().includes(query)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const handleNext = () => {
    if (!hasMore || !nextCursor) return;
    // Store the *next page cursor* so "page N" corresponds to a stable cursor.
    setPrevCursors((prev) => [...prev, nextCursor]);
    fetchPage(nextCursor);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePrev = () => {
    if (prevCursors.length <= 1) return;
    setPrevCursors((prev) => {
      const updated = prev.slice(0, -1);
      const target = updated[updated.length - 1];
      fetchPage(target);
      return updated;
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const currentPage = prevCursors.length; // 1-indexed
  // currentPage is derived from cursor history; cursor-based pagination doesn't support arbitrary page jumps
  // without precomputing cursors / total counts.

  const Pager = ({ align }: { align: "right" | "center" }) => (
    <div
      className={`flex gap-2 ${align === "center" ? "justify-center" : "justify-end"} flex-wrap`}
    >
      <button
        onClick={handlePrev}
        disabled={prevCursors.length <= 1 || loading}
        className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-700 disabled:opacity-50 enabled:hover:bg-gray-50 enabled:hover:border-gray-300"
      >
        Previous
      </button>
      <div
        className="inline-flex items-center justify-center w-9 h-9 rounded bg-cyan-500/80 text-white font-serif font-thin select-none"
        aria-label={`Current page ${currentPage}`}
        title={`Page ${currentPage}`}
        role="status"
      >
        {currentPage}
      </div>
      <button
        onClick={handleNext}
        disabled={!hasMore || loading}
        className="px-4 py-2 text-sm rounded bg-green-500 text-white disabled:opacity-50 enabled:hover:bg-green-600"
      >
        Next
      </button>
    </div>
  );

  const isSearchMode = searchQuery.trim().length >= MIN_CHARS;
  const listToRender = searchResults !== null ? searchResults : benchmarks;

  // Filter benchmarks based on applied filters (client-side).
  const filteredBenchmarks = useMemo(() => {
    return listToRender.filter((benchmark) => {
      // Task filter (client-side) - use applied task
      if (appliedTask && benchmark.task_ids) {
        if (!benchmark.task_ids.includes(appliedTask)) return false;
      }

      // Domain filter (client-side)
      if (appliedDomain) {
        if ((benchmark.domain || "") !== appliedDomain) return false;
      }

      return true;
    });
  }, [listToRender, appliedTask, appliedDomain]);

  const taskIdsForBenchmarks = useMemo(() => {
    const ids: string[] = [];
    for (const b of filteredBenchmarks) {
      for (const tid of b.task_ids || []) ids.push(tid);
    }
    return ids;
  }, [filteredBenchmarks]);

  // Best-effort: fetch task names for tasks referenced by the currently displayed benchmarks.
  useEffect(() => {
    fetchTasksBulk(taskIdsForBenchmarks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIdsForBenchmarks]);

  const taskById: Record<string, Task> = (() => {
    const out: Record<string, Task> = { ...bulkTasksById };
    for (const t of tasks) out[t.id] = t;
    // also merge cached tasks (if present) so we don't depend on state timing
    if (tasksCache) {
      for (const t of tasksCache) out[t.id] = t;
    }
    return out;
  })();

  const renderBubbles = (benchmark: Benchmark) => {
    const MAX_VISIBLE_TAGS = 8;

    const validModalities = (benchmark.modalities || [])
      .filter((m) => /^[\x00-\x7F]*$/.test(m)); // Filter out non-English modalities

    const validTaskNames = (benchmark.task_ids || [])
      .map((id) => taskById[id]?.name)
      .filter(Boolean)
      .filter((name) => /^[\x00-\x7F]*$/.test(name as string)) // Filter out non-English (non-ASCII) tags
      .map((name) => formatTaskName(name as string))
      .filter((name) => name.toLowerCase() !== "task"); // Filter out generic "task" label

    // Deduplicate task names
    const uniqTasks = Array.from(new Set(validTaskNames)).sort((a, b) => a.localeCompare(b));

    const totalCount = validModalities.length + uniqTasks.length;
    let visibleModalities = validModalities;
    let visibleTasks = uniqTasks;
    let overflowCount = 0;

    if (totalCount > MAX_VISIBLE_TAGS) {
      // Prioritize modalities, then fill remaining slots with task tags.
      // If modalities alone exceed MAX, they get truncated too.
      if (validModalities.length >= MAX_VISIBLE_TAGS) {
        visibleModalities = validModalities.slice(0, MAX_VISIBLE_TAGS);
        visibleTasks = [];
        overflowCount = totalCount - MAX_VISIBLE_TAGS;
      } else {
        const remainingSlots = MAX_VISIBLE_TAGS - validModalities.length;
        visibleTasks = uniqTasks.slice(0, remainingSlots);
        overflowCount = totalCount - (validModalities.length + visibleTasks.length);
      }
    }

    const modalityBubbles = visibleModalities.map((m) => (
      <span
        key={`m:${m}`}
        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100"
      >
        {m}
      </span>
    ));

    const taskBubbles = visibleTasks.map((t) => (
      <span
        key={`t:${t}`}
        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100"
      >
        {t}
      </span>
    ));

    const hasUnresolvedTasks = (benchmark.task_ids || []).some(
      (id) => !taskById[id] && !missingTaskIdsRef.current.has(id),
    );

    if (modalityBubbles.length === 0 && taskBubbles.length === 0) return null;

    return (
      <div className="mt-3 flex flex-wrap gap-1">
        {modalityBubbles}
        {taskBubbles}
        {overflowCount > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200" title={`${overflowCount} more tags`}>
            more tags...
          </span>
        )}
        {taskBubbles.length === 0 && hasUnresolvedTasks && overflowCount === 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-400 border border-blue-100">
            Loading tasks…
          </span>
        )}
      </div>
    );
  };

  const togglePapersPreview = async (datasetId: string) => {
    setOpenPapersFor((prev) => (prev === datasetId ? null : datasetId));
    if (papersByDatasetId[datasetId]) return;
    if (papersLoadingByDatasetId[datasetId]) return;

    setPapersLoadingByDatasetId((prev) => ({ ...prev, [datasetId]: true }));
    try {
      const url = new URL(`${getBackendBaseUrl()}/datasets/${datasetId}/papers`);
      url.searchParams.set("limit", "6");
      url.searchParams.set("offset", "0");
      const res = await fetch(url.toString());
      if (!res.ok) return;
      const data: PaperListResponse = await res.json();
      setPapersByDatasetId((prev) => ({ ...prev, [datasetId]: data.items || [] }));
    } finally {
      setPapersLoadingByDatasetId((prev) => ({ ...prev, [datasetId]: false }));
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="bg-gradient-to-br from-green-50 to-blue-50 border border-green-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col md:flex-row gap-4 md:gap-8 items-center">
            <div className="flex-none w-full md:w-auto md:max-w-4xl flex flex-col gap-3">
              <div>
                <h1 className={`text-5xl font-bold text-gray-900 ${playfairDisplay.className}`}>Benchmarks</h1>
                <p className="text-gray-600 text-base mt-2 break-words">
                  Discover the latest benchmarks and datasets in machine learning and AI.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search benchmarks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors ${searchQuery.trim().length > 0 ? "bg-white" : "bg-gray-100"
                      }`}
                  />
                  <svg
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  <div className="relative">
                    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
                      </svg>
                    </div>
                    <select
                      value={selectedDomain}
                      onChange={(e) => setSelectedDomain(e.target.value)}
                      className="px-4 py-2 pl-11 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                    >
                      {DOMAIN_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Custom searchable task dropdown */}
                  <div ref={taskDropdownRef} className="relative min-w-[200px]">
                    <button
                      onClick={() => setTaskSearchOpen(!taskSearchOpen)}
                      disabled={tasksLoading}
                      className="w-full px-4 py-2 pl-11 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white disabled:bg-gray-100 text-left flex items-center justify-between relative"
                    >
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
                        </svg>
                      </span>
                      <span className="truncate">{getSelectedTaskName()}</span>
                      <svg
                        className={`w-4 h-4 transition-transform ${taskSearchOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {taskSearchOpen && (
                      <div className="absolute z-50 mt-1 w-full max-w-md bg-white border border-gray-300 rounded-lg shadow-lg max-h-96 overflow-hidden">
                        <div className="p-2 border-b border-gray-200">
                          <input
                            type="text"
                            placeholder="Search tasks..."
                            value={taskSearchQuery}
                            onChange={(e) => setTaskSearchQuery(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                            autoFocus
                          />
                        </div>

                        {!taskSearchQuery && (
                          <div className="p-2 border-b border-gray-200">
                            <p className="text-xs text-gray-500 mb-2">Quick select:</p>
                            <div className="flex flex-wrap gap-1">
                              {PRESET_TASKS.map((taskId) => {
                                const task = tasks.find(t => t.id === taskId);
                                if (!task) return null;
                                return (
                                  <button
                                    key={taskId}
                                    onClick={() => handleTaskSelect(taskId)}
                                    className="px-3 py-1 text-xs bg-green-50 text-green-700 rounded-full hover:bg-green-100 transition"
                                  >
                                    {formatTaskName(task.name)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="overflow-y-auto max-h-64">
                          <button
                            onClick={() => handleTaskSelect("")}
                            className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 transition"
                          >
                            All Tasks
                          </button>
                          {getFilteredTasks().map((task) => (
                            <button
                              key={task.id}
                              onClick={() => handleTaskSelect(task.id)}
                              className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-50 transition ${selectedTask === task.id ? 'bg-green-50 text-green-700' : ''
                                }`}
                            >
                              {formatTaskName(task.name)}
                            </button>
                          ))}
                          {getFilteredTasks().length === 0 && (
                            <div className="px-3 py-2 text-sm text-gray-500">No tasks found</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleApplyFilters}
                      className="px-4 py-2 text-sm rounded-lg bg-green-500 text-white hover:bg-green-600 transition"
                    >
                      Apply
                    </button>
                    <button
                      onClick={handleClearFilters}
                      className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                {/* Upload Dataset Button (Below filters) */}
                <div>
                  {/* <button
                    disabled
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-400 cursor-not-allowed select-none transition-opacity hover:opacity-100 opacity-70"
                  >
                    <span>Upload Dataset</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-yellow-200 text-black border border-yellow-300 uppercase tracking-wide leading-none">
                      Coming Soon
                    </span>
                  </button> */}
                </div>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center min-h-[280px]">
              <Image
                src="/benchmark.png"
                alt="Benchmarks illustration"
                width={350}
                height={350}
                className="opacity-80 max-w-full h-auto"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {!isSearchMode && <Pager align="center" />}
          </div>
        </div>
      </div>

      {(loading || searchLoading) && (
        <div className="flex flex-col items-center justify-center py-12">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-500 font-medium">Loading benchmarks...</p>
        </div>
      )}

      {error && (
        <div className="text-red-600 text-sm">{error}</div>
      )}

      {!loading && !searchLoading && !error && isSearchMode && (searchResults?.length === 0) && (
        <div className="rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center w-fit mx-auto bg-gradient-to-br from-orange-500 to-yellow-400">
          <Image
            src="/404.png"
            alt="No results found"
            width={300}
            height={300}
            className="opacity-100"
          />
          <div className="bg-black w-full py-3 px-6 mt-0 rounded">
            <p className="text-white text-base text-center font-bold">No benchmark datasets match your filters.</p>
          </div>
        </div>
      )}

      {!loading && !searchLoading && !error && !isSearchMode && benchmarks.length === 0 && (
        <div className="rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center w-fit mx-auto bg-gradient-to-br from-orange-500 to-yellow-400">
          <Image
            src="/404.png"
            alt="No benchmarks were found that meets your filters."
            width={300}
            height={300}
            className="opacity-100"
          />
          <div className="bg-black w-full py-3 px-6 mt-0 rounded">
            <p className="text-white text-base text-center font-bold">No benchmark datasets match your filters.</p>
          </div>
        </div>
      )}

      {!loading && !searchLoading && !error && listToRender.length > 0 && filteredBenchmarks.length === 0 && (
        <div className="rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center w-fit mx-auto bg-gradient-to-br from-orange-500 to-yellow-400">
          <Image
            src="/404.png"
            alt="No results found"
            width={300}
            height={300}
            className="opacity-100"
          />
          <div className="bg-black w-full py-3 px-6 mt-0 rounded">
            <p className="text-white text-base text-center font-bold">No benchmark datasets match your filters.</p>
          </div>
        </div>
      )}

      {/* Responsive grid: 1 col mobile, 2 tablet, 3 desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredBenchmarks.map((benchmark) => (
          <div
            key={benchmark.id}
            className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-green-200 transition-all duration-200 flex flex-col"
          >
            {/* Header: Icon + Title */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-14 h-14 relative rounded-lg border border-gray-100 overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
                <Image
                  src={getDomainIcon(benchmark.domain)}
                  alt={`${benchmark.domain || 'dataset'} icon`}
                  fill
                  sizes="56px"
                  className="object-contain p-2"
                />
              </div>
              <div className="flex-1 min-w-0">
                <Link href={`/datasets/${benchmark.id}`}>
                  <h2 className="text-base font-semibold text-gray-900 hover:text-green-600 transition leading-tight line-clamp-2">
                    <MathText>{benchmark.name}</MathText>
                  </h2>
                </Link>
                {benchmark.full_name && benchmark.full_name !== benchmark.name && (
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    <MathText>{benchmark.full_name}</MathText>
                  </p>
                )}
              </div>
            </div>

            {/* Description */}
            {benchmark.description && (
              <p className="text-sm text-gray-700 mt-3 line-clamp-3">{benchmark.description}</p>
            )}

            {/* Bubbles for modalities and tasks */}
            {renderBubbles(benchmark)}

            {/* Paper count & preview */}
            {benchmark.paper_count !== undefined && (
              <div className="mt-3 text-sm text-gray-600">
                <button
                  type="button"
                  onClick={() => togglePapersPreview(benchmark.id)}
                  className="inline-flex items-center gap-2 text-gray-700 hover:text-green-700"
                  aria-expanded={openPapersFor === benchmark.id}
                >
                  <span className="text-xs">
                    {benchmark.paper_count} {benchmark.paper_count === 1 ? "paper" : "papers"}
                  </span>
                  <span className="text-gray-400 text-xs" aria-hidden>
                    {openPapersFor === benchmark.id ? "▴" : "▾"}
                  </span>
                </button>

                {openPapersFor === benchmark.id && (
                  <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    {papersLoadingByDatasetId[benchmark.id] ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <LoadingSpinner size="sm" />
                        <span>Loading papers…</span>
                      </div>
                    ) : (papersByDatasetId[benchmark.id] || []).length === 0 ? (
                      <div className="text-sm text-gray-500">No paper references found.</div>
                    ) : (
                      <div className="space-y-1">
                        {(papersByDatasetId[benchmark.id] || []).slice(0, 6).map((p) => (
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

            {/* Footer: Created date & Bookmark button */}
            <div className="mt-auto pt-3 space-y-2 flex flex-col items-center">

              <button
                onClick={() => toggleBookmark(benchmark.id)}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full border transition-all text-xs ${bookmarkedIds[benchmark.id]
                  ? "border-green-300 bg-green-50 text-green-800"
                  : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                  }`}
                title={bookmarkedIds[benchmark.id] ? "Remove bookmark" : "Bookmark this benchmark"}
              >
                <span aria-hidden="true">{bookmarkedIds[benchmark.id] ? "🔖" : "📑"}</span>
                <span>{bookmarkedIds[benchmark.id] ? "Bookmarked" : "Bookmark"}</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {!isSearchMode && <Pager align="center" />}
    </div>
  );
}
