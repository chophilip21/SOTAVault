"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { Playfair_Display } from "next/font/google";
import { config } from "@/lib/config";
import { getBackendBaseUrl } from "@/lib/backendUrl";

const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: ["700"] });

// Cache for tasks data
let tasksCache: Task[] | null = null;
let tasksCacheTime: number | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const PRESET_TASKS = [
  "face-detection",
  "learning-theory",
  "3d-action-recognition",
  "quantization"
];

const DOMAIN_OPTIONS = [
  { value: "", label: "All Domains" },
  { value: "cv", label: "Computer Vision" },
  { value: "nlp", label: "Natural Language Processing" },
  { value: "audio", label: "Audio" },
  { value: "robots", label: "Robotics" },
  { value: "time_series", label: "Time Series" },
  { value: "multimodal", label: "Multimodal" },
  { value: "theory", label: "Theory" },
  { value: "other", label: "Other" },
];

interface Paper {
  id: string;
  title: string;
  abstract?: string;
  authors?: string[];
  venue?: string | null;
  year?: number | null;
  created_at?: string;
  score?: number;
  task_ids?: string[];
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
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskSearchOpen, setTaskSearchOpen] = useState(false);
  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const taskDropdownRef = useRef<HTMLDivElement>(null);

  const fetchPage = async (cursor: string | null, taskIds?: string[]) => {
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

  useEffect(() => {
    fetchPage(null);
    fetchTasks();
    setPrevCursors([null]);
    setCurrentCursor(null);
  }, []);

  useEffect(() => {
    fetchPage(null);
    setPrevCursors([null]);
    setCurrentCursor(null);
  }, [sortDir]);

  // Debounced Meilisearch-backed search for papers tab (single-index search).
  useEffect(() => {
    const q = searchQuery.trim();

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
      fetchPage(null, selectedTasks);
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
    fetchPage(null, []);
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
      const task = tasks.find((t) => t.id === selectedTasks[0]);
      return task ? formatTaskName(task.name) : "1 task";
    }
    return `${selectedTasks.length} tasks`;
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
    // Store the current cursor so we can go back
    setPrevCursors((prev) => [...prev, currentCursor]);
    fetchPage(nextCursor);
  };

  const handlePrev = () => {
    if (prevCursors.length <= 1) return;
    setPrevCursors((prev) => {
      const updated = prev.slice(0, -1);
      const target = updated[updated.length - 1];
      fetchPage(target);
      return updated;
    });
  };

  const handleSortToggle = () => {
    setPrevCursors([null]);
    setNextCursor(null);
    setCurrentCursor(null);
    setHasMore(false);
    setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
  };

  const Pager = ({ align }: { align: "right" | "center" }) => (
    <div
      className={`flex gap-2 ${align === "center" ? "justify-center" : "justify-end"} flex-wrap`}
    >
      <button
        onClick={handlePrev}
        disabled={prevCursors.length <= 1 || loading}
        className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-700 disabled:opacity-50"
      >
        Previous
      </button>
      <button
        onClick={handleNext}
        disabled={!hasMore || loading}
        className="px-4 py-2 text-sm rounded bg-green-500 text-white disabled:opacity-50"
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

    return true;
  });

  return (
    <div className="mx-auto w-full max-w-7xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="bg-gray-50 rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col md:flex-row gap-4 md:gap-8 items-center">
          <div className="flex-none w-full md:w-auto md:max-w-xl flex flex-col gap-3">
            <div>
              <h1 className={`text-5xl font-bold text-gray-900 ${playfairDisplay.className}`}>Papers</h1>
              <p className="text-gray-600 text-base mt-3 break-words">
                Discover the latest papers and groundbreaking research in machine learning and AI.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search papers by title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors ${
                    searchQuery.trim().length > 0 ? "bg-white" : "bg-gray-100"
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
                    className="w-48 px-4 py-2 pl-11 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
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
                    className="w-48 px-4 py-2 pl-11 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white disabled:bg-gray-100 text-left flex items-center justify-between relative"
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
                      
                      {!taskSearchQuery && (
                        <div className="p-2 border-b border-gray-200">
                          <p className="text-xs text-gray-500 mb-2">Quick select:</p>
                          <div className="flex flex-wrap gap-1">
                            {PRESET_TASKS.map((taskId) => {
                              const task = tasks.find(t => t.id === taskId);
                              if (!task) return null;
                              const active = selectedTasks.includes(taskId);
                              return (
                                <button
                                  key={taskId}
                                  onClick={() => toggleTask(taskId)}
                                  className={`px-3 py-1 text-xs rounded-full transition ${
                                    active ? "bg-green-100 text-green-800" : "bg-green-50 text-green-700 hover:bg-green-100"
                                  }`}
                                >
                                  {formatTaskName(task.name)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      <div className="overflow-y-auto max-h-64">
                        {getFilteredTasks().map((task) => {
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
                              <span className={`${checked ? "text-green-700" : "text-gray-800"}`}>
                                {formatTaskName(task.name)}
                              </span>
                            </label>
                          );
                        })}
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
                <button
                  onClick={handleSortToggle}
                  className={`inline-flex items-center px-4 py-2 text-sm rounded-full border transition ${
                    sortDir === "desc"
                      ? "bg-blue-100 border-blue-300 text-blue-800"
                      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Sort by newest
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center min-h-[280px]">
            <Image
              src="/papers.png"
              alt="Research papers illustration"
              width={350}
              height={350}
              className="opacity-80 max-w-full h-auto"
            />
          </div>
          </div>
          {!isSearchMode && <Pager align="center" />}
        </div>
      </div>

      {(loading || searchLoading) && (
        <div className="text-gray-500">Loading papers...</div>
      )}

      {error && (
        <div className="text-red-600 text-sm">{error}</div>
      )}

      {!loading && !searchLoading && !error && isSearchMode && (searchResults?.length === 0) && (
        <div className="text-gray-500">No results found.</div>
      )}

      {!loading && !searchLoading && !error && !isSearchMode && papers.length === 0 && (
        <div className="text-gray-500">No papers found.</div>
      )}

      {!loading && !searchLoading && !error && listToRender.length > 0 && filteredPapers.length === 0 && (
        <div className="text-gray-500">No papers match your filters.</div>
      )}

      <div className="space-y-5">
        {filteredPapers.map((paper) => (
          <div
            key={paper.id}
            className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200"
          >
            <div className="flex justify-between items-start gap-4">
              <div className="flex-shrink-0 w-24 h-24 relative rounded-xl border border-gray-100 overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
                <Image
                  src="/ArXiv_logo_2022.png"
                  alt="Paper thumbnail"
                  fill
                  sizes="96px"
                  className="object-contain p-2"
                />
              </div>
              <div className="flex-1">
                <Link href={`/papers/${paper.id}`}>
                  <h2 className="text-lg font-semibold text-gray-900 hover:text-green-600 transition">
                    {paper.title}
                  </h2>
                </Link>
                {paper.authors && paper.authors.length > 0 && (
                  <p className="text-sm text-gray-600 mt-1">{paper.authors.join(", ")}</p>
                )}
                {(paper.venue || paper.year) && (
                  <p className="text-xs text-gray-500 mt-1">
                    {[paper.venue, paper.year].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </div>
            {paper.abstract && (
              <p className="text-sm text-gray-700 mt-3 line-clamp-3">{paper.abstract}</p>
            )}
            <div className="mt-4 flex flex-col items-center gap-2">
              {paper.created_at && (
                <p className="text-xs text-gray-400">
                  Created {new Date(paper.created_at).toLocaleDateString()}
                </p>
              )}
              <button
                disabled
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 text-gray-600 bg-gray-50 cursor-not-allowed"
              >
                <span className="text-amber-500">★</span>
                <span className="text-sm">Star</span>
                <span className="px-2 py-1 text-sm rounded-full bg-gray-200 border border-gray-300 text-gray-800">
                  {paper.score ?? 0}
                </span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {!isSearchMode && <Pager align="center" />}
    </div>
  );
}
