"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { PaperCoverArt } from "../components/PaperCoverArt";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { GithubRepoStats } from "../components/GithubRepoStats";
import { Playfair_Display } from "next/font/google";
import { config } from "@/lib/config";
import { getBackendBaseUrl } from "@/lib/backendUrl";
import { normalizeGithubRepo, GithubRepoMetadataItem, GithubRepoMetadataResponse } from "@/lib/github";
import { useAuth } from "@/lib/authContext";
import { useBookmarks } from "@/hooks/useBookmarks";
import { MathText } from "@/lib/mathText";
import { cleanPaperTitle, formatPaperAuthorsWithYear } from "@/lib/paperTitle";

const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: ["700"] });

// Small cache for preset task objects (resolved once via bulk endpoint).
let presetTasksCache: Task[] | null = null;

// Persist Papers tab state so navigating to a paper and back doesn't reset filters/page.
const PAPERS_STATE_KEY = "mlbench:papers_state:v1";
const PAPERS_STATE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function hasMeaningfulPapersState(s: any): boolean {
  if (!s || typeof s !== "object") return false;
  if (Array.isArray(s.papers) && s.papers.length > 0) return true;
  if (Array.isArray(s.searchResults)) return true; // search mode explicitly stores an array
  if (typeof s.searchQuery === "string" && s.searchQuery.trim().length > 0) return true;
  if (typeof s.currentCursor === "string" && s.currentCursor.length > 0) return true;
  if (typeof s.nextCursor === "string" && s.nextCursor.length > 0) return true;
  if (s.hasMore === true) return true;
  if (typeof s.sortDir === "string" && (s.sortDir === "asc" || s.sortDir === "desc")) return true;
  if (typeof s.appliedDomain === "string" && s.appliedDomain.length > 0) return true;
  if (Array.isArray(s.appliedTasks) && s.appliedTasks.length > 0) return true;
  return false;
}

const PRESET_TASKS = [
  "image-classification",
  "object-detection",
  "face-detection",
  "natural-language-understanding",
  "text-classification",
  "question-answering",
  "machine-translation",
  "speech-recognition",
  "3d-action-recognition",
  "quantization",
];

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

interface Paper {
  id: string;
  title: string;
  domain?: string;
  abstract?: string;
  authors?: string[];
  venue?: string | null;
  year?: number | null;
  arxiv_id?: string | null;
  created_at?: string;
  score?: number;
  task_ids?: string[];
  official_code?: string[];
  unofficial_code?: string[];
}

interface PapersResponse {
  items: Paper[];
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

export default function PapersPage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [prevCursors, setPrevCursors] = useState<Array<string | null>>([null]);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Paper[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const MIN_CHARS = 3;
  const DEBOUNCE_MS = 350;

  // Temporary filter states (not yet applied)
  const [selectedDomain, setSelectedDomain] = useState("");
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);

  // Applied filter states (used for actual filtering)
  const [appliedDomain, setAppliedDomain] = useState("");
  const [appliedTasks, setAppliedTasks] = useState<string[]>([]);

  // tasks = results shown in the dropdown (search results or presets)
  const [tasks, setTasks] = useState<Task[]>([]);
  // presetTasks = the small fixed set of quick-select tasks (loaded once)
  const [presetTasks, setPresetTasks] = useState<Task[]>([]);
  const [bulkTasksById, setBulkTasksById] = useState<Record<string, Task>>({});
  const [tasksLoading, setTasksLoading] = useState(false);
  const requestedTaskIdsRef = useRef<Set<string>>(new Set());
  const missingTaskIdsRef = useRef<Set<string>>(new Set());
  const [taskSearchOpen, setTaskSearchOpen] = useState(false);
  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const taskSearchDebounceRef = useRef<number | null>(null);
  const taskDropdownRef = useRef<HTMLDivElement>(null);
  const skipNextSearchEffectRef = useRef(false);
  const skipNextSortEffectRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);

  // GitHub metadata (batched per visible page). Backend is authoritative cache.
  const [githubMeta, setGithubMeta] = useState<Record<string, GithubRepoMetadataItem>>({});
  // Local-only bookmarks (UI toggle only for now).
  // Unofficial code is shown on-demand only (collapsed by default).
  const [showUnofficial, setShowUnofficial] = useState<Record<string, boolean>>({});
  const lastGithubBatchKeyRef = useRef<string>("");
  const { user } = useAuth();

  const { bookmarkedIds, toggleBookmark } = useBookmarks("paper");

  const fetchPage = async (cursor: string | null, taskIds?: string[], domain?: string) => {
    setLoading(true);
    setError(null);
    try {
      // FastAPI redirects /papers -> /papers/ (307); hit the canonical path directly
      const url = new URL(`${getBackendBaseUrl()}/papers/`);
      url.searchParams.set("limit", "10");
      url.searchParams.set("sort_dir", sortDir);
      if (cursor) url.searchParams.set("cursor", cursor);

      const taskToUse = taskIds !== undefined ? taskIds : appliedTasks;
      if (taskToUse && taskToUse.length > 0) {
        taskToUse.forEach((t) => url.searchParams.append("task_id", t));
      }

      const domainToUse = domain !== undefined ? domain : appliedDomain;
      if (domainToUse) {
        url.searchParams.set("domain", domainToUse);
      }

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load papers");
      const data: PapersResponse = await res.json();

      setPapers(data.items || []);
      const next = data.next_cursor ?? (data as any).nextCursor ?? null;
      setNextCursor(next);
      // Prefer backend flag; if absent, infer from cursor presence
      const backendHasMore = data.has_more ?? (data as any).hasMore;
      setHasMore(typeof backendHasMore === "boolean" ? backendHasMore : Boolean(next));
      setCurrentCursor(cursor || null);
    } catch (err: any) {
      setError(err.message || "Failed to load papers");
    } finally {
      setLoading(false);
    }
  };

  /** Load the small set of preset quick-select tasks once via the bulk endpoint. */
  const fetchPresetTasks = async () => {
    if (presetTasksCache) {
      setPresetTasks(presetTasksCache);
      return;
    }
    try {
      const url = new URL(`${getBackendBaseUrl()}/tasks/bulk`);
      PRESET_TASKS.forEach((id) => url.searchParams.append("ids", id));
      const res = await fetch(url.toString());
      if (!res.ok) return;
      const data: TasksResponse = await res.json();
      presetTasksCache = data.items || [];
      setPresetTasks(presetTasksCache);
    } catch {
      // non-critical
    }
  };

  /** Debounced Meilisearch task search used by the task filter dropdown. */
  const searchTasks = (q: string) => {
    if (taskSearchDebounceRef.current) window.clearTimeout(taskSearchDebounceRef.current);

    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setTasks([]);
      setTasksLoading(false);
      return;
    }

    setTasksLoading(true);
    taskSearchDebounceRef.current = window.setTimeout(async () => {
      try {
        const url = new URL(`${getBackendBaseUrl()}/search/tasks_meili`);
        url.searchParams.set("q", trimmed);
        url.searchParams.set("limit", "50");
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error("tasks search failed");
        const data: { query: string; hits: Array<{ id: string; name: string }> } = await res.json();
        // Map Meilisearch hits to the Task interface
        setTasks((data.hits || []).map((h) => ({ id: h.id, name: h.name, slug: h.id })));
      } catch {
        setTasks([]);
      } finally {
        setTasksLoading(false);
      }
    }, 300);
  };

  const fetchTasksBulk = async (taskIds: string[]) => {
    const unique = Array.from(new Set(taskIds.filter(Boolean)));
    if (unique.length === 0) return;

    const localKnown = new Set<string>();
    for (const t of tasks) localKnown.add(t.id);
    for (const t of presetTasks) localKnown.add(t.id);
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
      const raw = sessionStorage.getItem(PAPERS_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as any;
        const ts = Number(parsed?.ts || 0);
        if (ts && (Date.now() - ts) < PAPERS_STATE_TTL_MS && hasMeaningfulPapersState(parsed)) {
          setPapers(Array.isArray(parsed?.papers) ? parsed.papers : []);
          setNextCursor(typeof parsed?.nextCursor === "string" ? parsed.nextCursor : null);
          setPrevCursors(Array.isArray(parsed?.prevCursors) ? parsed.prevCursors : [null]);
          setCurrentCursor(typeof parsed?.currentCursor === "string" ? parsed.currentCursor : null);
          setHasMore(Boolean(parsed?.hasMore));

          if (parsed?.sortDir === "asc" || parsed?.sortDir === "desc") {
            setSortDir(parsed.sortDir);
            skipNextSortEffectRef.current = true;
          }
          setSelectedDomain(typeof parsed?.selectedDomain === "string" ? parsed.selectedDomain : "");
          setSelectedTasks(Array.isArray(parsed?.selectedTasks) ? parsed.selectedTasks : []);
          setAppliedDomain(typeof parsed?.appliedDomain === "string" ? parsed.appliedDomain : "");
          setAppliedTasks(Array.isArray(parsed?.appliedTasks) ? parsed.appliedTasks : []);

          const q = typeof parsed?.searchQuery === "string" ? parsed.searchQuery : "";
          const sr = Array.isArray(parsed?.searchResults) ? parsed.searchResults : null;
          if (q) {
            setSearchQuery(q);
            setSearchResults(sr);
            skipNextSearchEffectRef.current = true;
          }

          fetchPresetTasks();
          return () => {
            // When unmounting, check if we are navigating away from papers-related routes.
            // If we are, clear the cached page/filters.
            const nextPath = window.location.pathname;
            if (!nextPath.startsWith("/papers")) {
              try {
                sessionStorage.removeItem(PAPERS_STATE_KEY);
              } catch {
                // ignore
              }
            }
          };
        }
      }
    } catch {
      // ignore restore errors
    }

    fetchPage(null);
    fetchPresetTasks();
    setPrevCursors([null]);
    setCurrentCursor(null);

    return () => {
      // When unmounting, check if we are navigating away from papers-related routes.
      // If we are, clear the cached page/filters.
      const nextPath = window.location.pathname;
      if (!nextPath.startsWith("/papers")) {
        try {
          sessionStorage.removeItem(PAPERS_STATE_KEY);
        } catch {
          // ignore
        }
      }
    };
  }, []);

  useEffect(() => {
    searchTasks(taskSearchQuery);
    return () => {
      if (taskSearchDebounceRef.current) window.clearTimeout(taskSearchDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskSearchQuery]);

  useEffect(() => {
    if (skipNextSortEffectRef.current) {
      skipNextSortEffectRef.current = false;
      return;
    }
    fetchPage(null, appliedTasks, appliedDomain);
    setPrevCursors([null]);
    setCurrentCursor(null);
  }, [sortDir]);

  // Debounced Meilisearch-backed search for papers tab (single-index search).
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

      const searchUrl = new URL(`${getBackendBaseUrl()}/search/papers_meili`);
      searchUrl.searchParams.set("q", q);
      searchUrl.searchParams.set("limit", "80");
      searchUrl.searchParams.set("min_chars", String(MIN_CHARS));

      fetch(searchUrl.toString(), { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`papers_meili ${res.status}`))))
        .then((json: { query: string; hits: Array<{ id: string }> }) => {
          const ids = (json.hits || []).map((h) => h.id).filter(Boolean);
          if (ids.length === 0) {
            setSearchResults([]);
            return;
          }

          const bulkUrl = new URL(`${getBackendBaseUrl()}/papers/bulk`);
          ids.forEach((id) => bulkUrl.searchParams.append("ids", id));
          return fetch(bulkUrl.toString(), { signal: controller.signal })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`papers_bulk ${res.status}`))))
            .then((data: PapersResponse) => {
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

  const resetMobileZoom = () => {
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      const originalContent = viewportMeta.getAttribute("content");
      viewportMeta.setAttribute(
        "content",
        "width=device-width, initial-scale=1, maximum-scale=1"
      );
      setTimeout(() => {
        if (originalContent) {
          viewportMeta.setAttribute("content", originalContent);
        } else {
          viewportMeta.setAttribute("content", "width=device-width, initial-scale=1");
        }
      }, 300);
    }
  };

  useEffect(() => {
    if (!taskSearchOpen) {
      resetMobileZoom();
    }
  }, [taskSearchOpen]);

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
    setAppliedTasks(selectedTasks);
    // Only refetch the paginated list when not in Meilisearch search mode.
    if (searchQuery.trim().length < MIN_CHARS) {
      fetchPage(null, selectedTasks, selectedDomain);
      setPrevCursors([null]);
      setCurrentCursor(null);
    }
  };

  const handleClearFilters = () => {
    setSelectedDomain("");
    setSelectedTasks([]);
    setAppliedDomain("");
    setAppliedTasks([]);
    setSearchQuery("");
    setTaskSearchQuery("");
    setSearchResults(null);
    try {
      sessionStorage.removeItem(PAPERS_STATE_KEY);
    } catch {
      // ignore
    }
    fetchPage(null, [], "");
    setPrevCursors([null]);
    setCurrentCursor(null);
  };

  const toggleTask = (taskId: string) => {
    // Firestore array_contains_any supports up to 10 values.
    setSelectedTasks((prev) => {
      const exists = prev.includes(taskId);
      if (exists) return prev.filter((t) => t !== taskId);
      if (prev.length >= 10) return prev;
      return [...prev, taskId];
    });
  };

  const formatTaskName = (name: string) => {
    return name.replace(/-/g, " ");
  };

  const getSelectedTaskName = () => {
    if (selectedTasks.length === 0) return "All Tasks";
    if (selectedTasks.length === 1) {
      const taskId = selectedTasks[0];
      const task =
        bulkTasksById[taskId] ||
        presetTasks.find((t) => t.id === taskId) ||
        tasks.find((t) => t.id === taskId);
      return task ? formatTaskName(task.name) : "1 task";
    }
    return `${selectedTasks.length} tasks`;
  };

  /** Tasks shown in the scrollable list area of the dropdown. */
  const getFilteredTasks = (): Task[] => {
    if (!taskSearchQuery.trim()) return [];
    return tasks; // already sorted by slug from the backend
  };

  const handleNext = () => {
    if (!hasMore || !nextCursor) return;
    // Store the *next page cursor* so "page N" corresponds to a stable cursor.
    // This makes multi-step    // Store the *next page cursor* so "page N" corresponds to a stable cursor.
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

  const handleSortToggle = () => {
    setPrevCursors([null]);
    setNextCursor(null);
    setCurrentCursor(null);
    setHasMore(false);
    setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
  };

  // Persist state for Back/forward nav. Debounced to avoid blocking navigation.
  useEffect(() => {
    try {
      // Avoid persisting a blank state before initial fetch completes.
      const shouldPersist =
        papers.length > 0 ||
        searchResults !== null ||
        searchQuery.trim().length > 0 ||
        (currentCursor ?? "") !== "" ||
        (nextCursor ?? "") !== "" ||
        hasMore ||
        appliedDomain !== "" ||
        appliedTasks.length > 0 ||
        sortDir !== "desc";
      if (!shouldPersist) return;

      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = window.setTimeout(() => {
        try {
          const payload = {
            ts: Date.now(),
            papers,
            nextCursor,
            prevCursors,
            currentCursor,
            hasMore,
            sortDir,
            selectedDomain,
            selectedTasks,
            appliedDomain,
            appliedTasks,
            searchQuery,
            searchResults,
            scrollY: typeof window !== "undefined" ? window.scrollY : 0,
          };
          sessionStorage.setItem(PAPERS_STATE_KEY, JSON.stringify(payload));
        } catch {
          // ignore
        }
      }, 150);
    } catch {
      // ignore
    }
    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    };
  }, [
    papers,
    nextCursor,
    prevCursors,
    currentCursor,
    hasMore,
    sortDir,
    selectedDomain,
    selectedTasks,
    appliedDomain,
    appliedTasks,
    searchQuery,
    searchResults,
  ]);

  const Pager = ({ align }: { align: "right" | "center" }) => (
    <div
      className={`flex gap-2 ${align === "center" ? "justify-center" : "justify-end"} flex-wrap`}
    >
      <button
        onClick={handlePrev}
        disabled={prevCursors.length <= 1 || loading}
        className="inline-flex h-9 items-center justify-center px-4 text-sm font-medium leading-none rounded-lg border border-gray-200 bg-white text-gray-700 enabled:hover:bg-gray-50 enabled:hover:border-gray-300 disabled:bg-gray-100 disabled:border-gray-300 disabled:text-gray-400 disabled:cursor-not-allowed"
      >
        Previous
      </button>
      <div
        className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-cyan-500/80 text-white text-sm font-medium tabular-nums leading-none select-none"
        aria-label={`Current page ${currentPage}`}
        title={`Page ${currentPage}`}
        role="status"
      >
        {currentPage}
      </div>
      <button
        onClick={handleNext}
        disabled={!hasMore || loading}
        className="inline-flex h-9 items-center justify-center px-4 text-sm font-medium leading-none rounded-lg border border-transparent bg-green-500 text-white enabled:hover:bg-green-600 disabled:bg-gray-200 disabled:border-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
      >
        Next
      </button>
    </div>
  );

  const isSearchMode = searchQuery.trim().length >= MIN_CHARS;
  const listToRender = searchResults !== null ? searchResults : papers;

  // Filter papers based on applied domain/tasks (always client-side).
  const filteredPapers = listToRender.filter((paper) => {
    if (appliedTasks.length > 0) {
      const hasAnyTask = (paper.task_ids || []).some((id) => appliedTasks.includes(id));
      if (!hasAnyTask) return false;
    }

    // Domain filter (client-side) - filter based on task domains
    if (appliedDomain && paper.task_ids) {
      const paperTasks = tasks.filter(t => paper.task_ids?.includes(t.id));
      const hasMatchingDomain = paperTasks.some(t => t.domain === appliedDomain);
      if (!hasMatchingDomain) return false;
    }

    // Task filter (client-side AND logic) - paper must have ALL selected tasks
    if (appliedTasks && appliedTasks.length > 0) {
      const paperTaskIds = paper.task_ids || [];
      const hasAllTasks = appliedTasks.every(taskId => paperTaskIds.includes(taskId));
      if (!hasAllTasks) return false;
    }

    return true;
  });

  const taskIdsForPapers = useMemo(() => {
    const ids: string[] = [];
    for (const p of filteredPapers) {
      for (const tid of p.task_ids || []) ids.push(tid);
    }
    return ids;
  }, [filteredPapers]);

  // Best-effort: fetch task names for tasks referenced by the currently displayed papers, selected, and applied tasks.
  useEffect(() => {
    const ids = Array.from(new Set([...taskIdsForPapers, ...selectedTasks, ...appliedTasks]));
    fetchTasksBulk(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIdsForPapers, selectedTasks, appliedTasks]);

  const taskById: Record<string, Task> = (() => {
    const out: Record<string, Task> = { ...bulkTasksById };
    // Merge preset tasks and current search results so display names resolve.
    for (const t of presetTasks) out[t.id] = t;
    for (const t of tasks) out[t.id] = t;
    return out;
  })();

  const officialRepoKeys = useMemo(() => {
    const repos = new Set<string>();
    for (const p of filteredPapers || []) {
      for (const url of (p as any)?.official_code || []) {
        const key = normalizeGithubRepo(String(url));
        if (key) repos.add(key);
      }
    }
    return Array.from(repos).sort();
  }, [filteredPapers]);

  useEffect(() => {
    // Batch fetch GitHub metadata for visible papers (official_code only).
    // Only request missing/pending keys, and dedupe identical batches across re-renders.
    if (officialRepoKeys.length === 0) return;

    const missing = officialRepoKeys.filter((k) => !githubMeta[k] || githubMeta[k]?.status === "pending");
    if (missing.length === 0) return;

    const batchKey = missing.join(",");
    if (lastGithubBatchKeyRef.current === batchKey) return;
    lastGithubBatchKeyRef.current = batchKey;

    const controller = new AbortController();
    const run = async () => {
      try {
        const res = await fetch(`${getBackendBaseUrl()}/github/repo-metadata`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repos: missing }),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data: GithubRepoMetadataResponse = await res.json();
        if (!data?.items) return;
        setGithubMeta((prev) => ({ ...prev, ...data.items }));
      } catch {
        // ignore
      }
    };
    run();
    return () => controller.abort();
  }, [officialRepoKeys, githubMeta]);

  const fetchGithubGetMany = async (reposOrUrls: string[]) => {
    // Lazy batch via GET (used when user expands unofficial code).
    if (!reposOrUrls || reposOrUrls.length === 0) return;
    try {
      const url = new URL(`${getBackendBaseUrl()}/github/repo-metadata`);
      reposOrUrls.forEach((r) => url.searchParams.append("repo", r));
      const res = await fetch(url.toString(), { method: "GET" });
      if (!res.ok) return;
      const data: GithubRepoMetadataResponse = await res.json();
      if (!data?.items) return;
      setGithubMeta((prev) => ({ ...prev, ...data.items }));
    } catch {
      // ignore
    }
  };

  const renderBubbles = (paper: Paper) => {
    const taskNames = (paper.task_ids || [])
      .map((id) => taskById[id]?.name)
      .filter(Boolean)
      .filter((name) => /^[\x00-\x7F]*$/.test(name as string)) // Filter out non-English (non-ASCII) tags
      .map((name) => formatTaskName(name as string))
      .filter((name) => name.toLowerCase() !== "task"); // Filter out generic "task" label
    const uniq = Array.from(new Set(taskNames)).sort((a, b) => a.localeCompare(b));
    const taskBubbles = uniq.slice(0, 7).map((t) => (
      <span
        key={`t:${t}`}
        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100"
      >
        {t}
      </span>
    ));

    const hasUnresolvedTasks = (paper.task_ids || []).some(
      (id) => !taskById[id] && !missingTaskIdsRef.current.has(id),
    );

    if (!paper.domain && taskBubbles.length === 0 && !hasUnresolvedTasks) return null;

    return (
      <div className="mt-3 flex flex-wrap gap-1">
        {paper.domain && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100">
            {paper.domain}
          </span>
        )}
        {taskBubbles}
        {taskBubbles.length === 0 && hasUnresolvedTasks && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-400 border border-blue-100">
            Loading tasks…
          </span>
        )}
      </div>
    );
  };

  const toggleUnofficial = (paperId: string, urls: string[]) => {
    setShowUnofficial((prev) => {
      const next = !prev[paperId];
      // If opening, fetch missing GitHub metadata for the unofficial repos in a single GET.
      if (next) {
        const keys = Array.from(
          new Set(
            (urls || [])
              .map((u) => normalizeGithubRepo(u))
              .filter((x): x is string => Boolean(x))
          )
        ).sort();
        const missing = keys.filter((k) => !githubMeta[k] || githubMeta[k]?.status === "pending");
        if (missing.length > 0) fetchGithubGetMany(missing);
      }
      return { ...prev, [paperId]: next };
    });
  };

  return (
    <div className="mx-auto w-full max-w-7xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="bg-gradient-to-br from-green-50 to-blue-50 border border-green-200 rounded-2xl p-6 shadow-sm max-md:p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col md:flex-row gap-4 md:gap-8 max-md:gap-1 items-center">
            <div className="flex-none w-full md:w-auto md:max-w-xl flex flex-col gap-3 max-md:order-2 max-md:gap-2">
              <div className="max-md:text-center">
                <h1 className={`text-5xl font-bold text-gray-900 max-md:text-3xl max-md:leading-tight ${playfairDisplay.className}`}>Papers</h1>
                <p className="text-gray-600 text-base mt-3 break-words max-md:text-sm max-md:mt-2">
                  Discover the latest papers and groundbreaking research in machine learing.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search papers by title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onBlur={resetMobileZoom}
                    className={`w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors max-md:py-2.5 max-md:text-base ${searchQuery.trim().length > 0 ? "bg-white" : "bg-gray-100"
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
                <div className="flex gap-2 flex-wrap items-center max-md:flex-col max-md:items-stretch max-md:w-full">
                  <div className="relative max-md:w-full">
                    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
                      </svg>
                    </div>
                    <select
                      value={selectedDomain}
                      onChange={(e) => setSelectedDomain(e.target.value)}
                      className="w-48 max-md:w-full px-4 py-2 pl-11 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white max-md:py-2.5 max-md:text-base"
                    >
                      {DOMAIN_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Custom searchable task dropdown */}
                  <div ref={taskDropdownRef} className="relative min-w-[200px] max-md:w-full max-md:min-w-0">
                    <button
                      onClick={() => setTaskSearchOpen(!taskSearchOpen)}
                      disabled={tasksLoading}
                      className="w-48 max-md:w-full px-4 py-2 pl-11 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white disabled:bg-gray-100 text-left flex items-center justify-between relative max-md:py-2.5 max-md:text-base"
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
                            placeholder="Search tasks…"
                            value={taskSearchQuery}
                            onChange={(e) => setTaskSearchQuery(e.target.value)}
                            onBlur={resetMobileZoom}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                            autoFocus
                          />
                        </div>

                        <div className="p-2 border-b border-gray-200 flex items-center justify-between gap-2">
                          <p className="text-xs text-gray-500">Select up to 10 tasks</p>
                          <button
                            onClick={() => setSelectedTasks([])}
                            className="text-xs text-gray-700 hover:text-gray-900 underline"
                            type="button"
                          >
                            Clear
                          </button>
                        </div>

                        {!taskSearchQuery.trim() ? (
                          <div className="p-3">
                            {/* Selected Tasks section */}
                            {selectedTasks.length > 0 && (
                              <div className="mb-3 pb-3 border-b border-gray-100">
                                <p className="text-xs font-semibold text-gray-500 mb-2">Selected Tasks:</p>
                                <div className="flex flex-wrap gap-1">
                                  {selectedTasks.map((taskId) => {
                                    const task =
                                      bulkTasksById[taskId] ||
                                      presetTasks.find((t) => t.id === taskId) ||
                                      tasks.find((t) => t.id === taskId) ||
                                      { id: taskId, name: taskId };
                                    return (
                                      <button
                                        key={taskId}
                                        onClick={() => toggleTask(taskId)}
                                        className="inline-flex w-fit max-w-[9.5rem] items-center justify-between gap-1.5 px-2.5 py-1 text-xs text-left leading-tight whitespace-normal break-words rounded-full bg-green-100 text-green-800 hover:bg-green-200 transition"
                                      >
                                        <span className="truncate">{formatTaskName(task.name)}</span>
                                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {presetTasks.length > 0 && (
                              <>
                                <p className="text-xs text-gray-500 mb-2">Quick select:</p>
                                <div className="flex flex-wrap gap-1">
                                  {presetTasks.map((task) => {
                                    const active = selectedTasks.includes(task.id);
                                    return (
                                      <button
                                        key={task.id}
                                        onClick={() => toggleTask(task.id)}
                                        className={`inline-flex w-fit max-w-[9.5rem] items-start justify-start px-3 py-1 text-xs text-left leading-tight whitespace-normal break-words rounded-full transition ${active ? "bg-green-100 text-green-800" : "bg-green-50 text-green-700 hover:bg-green-100"}`}
                                      >
                                        {formatTaskName(task.name)}
                                      </button>
                                    );
                                  })}
                                </div>
                              </>
                            )}
                            <p className="text-xs text-gray-400 mt-3">Type to search all tasks…</p>
                          </div>
                        ) : (
                          <div className="overflow-y-auto max-h-64">
                            {tasksLoading && (
                              <div className="px-3 py-2 text-sm text-gray-400">Searching…</div>
                            )}
                            {!tasksLoading && getFilteredTasks().map((task) => {
                              const checked = selectedTasks.includes(task.id);
                              return (
                                <label
                                  key={task.id}
                                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleTask(task.id)}
                                    className="h-4 w-4 shrink-0 accent-green-600"
                                  />
                                  <span className={checked ? "text-green-700" : "text-gray-800"}>
                                    {formatTaskName(task.name)}
                                  </span>
                                </label>
                              );
                            })}
                            {!tasksLoading && getFilteredTasks().length === 0 && (
                              <div className="px-3 py-2 text-sm text-gray-500">No tasks found</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 max-md:w-full max-md:space-x-2">
                    <button
                      onClick={handleApplyFilters}
                      className="px-4 py-2 text-sm rounded-lg bg-green-500 text-white hover:bg-green-600 transition max-md:flex-1 max-md:py-2.5"
                    >
                      Apply
                    </button>
                    <button
                      onClick={handleClearFilters}
                      className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition max-md:flex-1 max-md:py-2.5"
                    >
                      Clear
                    </button>
                  </div>
                  {/* <button
                    disabled
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-400 cursor-not-allowed select-none transition-opacity hover:opacity-100 opacity-70"
                  >
                    <span>Upload Papers</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-yellow-200 text-black border border-yellow-300 uppercase tracking-wide leading-none">
                      Coming Soon
                    </span>
                  </button> */}
                </div>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center min-h-[280px] max-md:order-1 max-md:min-h-0 max-md:py-0 max-md:flex-none">
              <Image
                src="/papers.png"
                alt="Research papers illustration"
                width={350}
                height={350}
                className="opacity-80 max-w-full h-auto max-md:w-40 max-md:h-40"
              />
            </div>
          </div>
          {!isSearchMode && <Pager align="center" />}
        </div>
      </div>

      {(loading || searchLoading) && (
        <div className="flex flex-col items-center justify-center py-12">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-500 font-medium">Loading papers...</p>
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
            <p className="text-white text-base text-center font-bold">No results found.</p>
          </div>
        </div>
      )}

      {!loading && !searchLoading && !error && !isSearchMode && papers.length === 0 && (
        <div className="rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center w-fit mx-auto bg-gradient-to-br from-orange-500 to-yellow-400">
          <Image
            src="/404.png"
            alt="No papers were found that meets your filters."
            width={300}
            height={300}
            className="opacity-100"
          />
          <div className="bg-black w-full py-3 px-6 mt-0 rounded">
            <p className="text-white text-base text-center font-bold">No papers meet your filter requirement 😔</p>
          </div>
        </div>
      )}

      {!loading && !searchLoading && !error && listToRender.length > 0 && filteredPapers.length === 0 && (
        <div className="rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center w-fit mx-auto bg-gradient-to-br from-orange-500 to-yellow-400">
          <Image
            src="/404.png"
            alt="No results found"
            width={300}
            height={300}
            className="opacity-100"
          />
          <div className="bg-black w-full py-3 px-6 mt-0 rounded space-y-1">
            <div className="text-white text-base text-center font-bold space-y-1">
              <p>No papers match requirements for:</p>
              {appliedDomain && <p>Domain: {appliedDomain}</p>}
              {appliedTasks.length > 0 && (
                <p>Tasks: {appliedTasks.map(id => taskById[id]?.name || id).map(name => formatTaskName(name)).join(", ")}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-5">
        {filteredPapers.map((paper) => {
          const displayTitle = cleanPaperTitle(paper.title);
          const authorsLine = formatPaperAuthorsWithYear(paper.authors, paper.year);
          return (
            <div
              key={paper.id}
              className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 max-md:p-4"
            >
              <div className="flex justify-between items-start gap-4">
                <div className="flex-shrink-0 w-24 h-24 relative rounded-xl border border-gray-100 overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 max-md:w-20 max-md:h-20">
                  <PaperCoverArt
                    seed={paper.arxiv_id || paper.id}
                    title={displayTitle}
                    authors={paper.authors}
                    year={paper.year}
                    className="absolute inset-0"
                    ariaLabel={displayTitle ? `Paper cover: ${displayTitle}` : "Paper cover"}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/papers/${paper.id}`}>
                    <h2 className="text-lg font-semibold text-gray-900 hover:text-green-600 transition max-md:text-base max-md:break-words">
                      <MathText>{displayTitle}</MathText>
                    </h2>
                  </Link>
                  {/* Code badges + GitHub stats */}
                  <div className="mt-2 space-y-1 text-xs">
                    {paper.official_code && paper.official_code.length > 0 ? (
                      <div className="space-y-1">
                        {paper.official_code.map((u) => {
                          const key = normalizeGithubRepo(u);
                          const meta = key ? githubMeta[key] : undefined;
                          return (
                            <div key={u} className="flex flex-wrap items-center gap-2">
                              <GithubRepoStats
                                status={(meta?.status as any) || (key ? "pending" : "invalid")}
                                stars={meta?.data?.stars}
                                forks={meta?.data?.forks}
                              />
                              <a className="text-green-600 hover:underline break-all" href={u} target="_blank" rel="noreferrer">
                                Official
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <GithubRepoStats status="ok" stars={0} forks={0} />
                      </div>
                    )}

                    {paper.unofficial_code && paper.unofficial_code.length > 0 && (
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => toggleUnofficial(paper.id, paper.unofficial_code || [])}
                          className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700"
                        >
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded border border-gray-200 bg-gray-50 text-gray-500">
                            {showUnofficial[paper.id] ? "−" : "+"}
                          </span>
                          <span className="underline underline-offset-2">
                            Unofficial code ({paper.unofficial_code.length})
                          </span>
                        </button>

                        {showUnofficial[paper.id] && (
                          <div className="space-y-1 pl-7">
                            {paper.unofficial_code.map((u) => {
                              const key = normalizeGithubRepo(u);
                              const meta = key ? githubMeta[key] : undefined;
                              return (
                                <div key={u} className="flex flex-wrap items-center gap-2">
                                  <GithubRepoStats
                                    status={(meta?.status as any) || (key ? "pending" : "invalid")}
                                    stars={meta?.data?.stars}
                                    forks={meta?.data?.forks}
                                  />
                                  <a className="text-green-600 hover:underline break-all" href={u} target="_blank" rel="noreferrer">
                                    Unofficial
                                  </a>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {authorsLine && (
                    <p className="text-sm text-gray-600 mt-1 max-md:break-words">{authorsLine}</p>
                  )}
                  {paper.venue && (
                    <p className="text-xs text-gray-500 mt-1 max-md:break-words">{paper.venue}</p>
                  )}
                </div>
              </div>
              {paper.abstract && (
                <p className="text-sm text-gray-700 mt-3 line-clamp-3 max-md:break-words">{paper.abstract}</p>
              )}
              {renderBubbles(paper)}
              <div className="mt-4 flex flex-col items-center gap-2">

                <button
                  onClick={() => toggleBookmark(paper.id, displayTitle)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border transition ${bookmarkedIds[paper.id]
                    ? "border-green-300 bg-green-50 text-green-800"
                    : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                    }`}
                >
                  <span aria-hidden="true">{bookmarkedIds[paper.id] ? "🔖" : "📑"}</span>
                  <span className="text-sm">{bookmarkedIds[paper.id] ? "Bookmarked" : "Bookmark"}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!isSearchMode && <Pager align="center" />}
    </div>
  );
}
