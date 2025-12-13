"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { Playfair_Display } from "next/font/google";
import { config } from "@/lib/config";

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
  
  // Temporary filter states (not yet applied)
  const [selectedDomain, setSelectedDomain] = useState("");
  const [selectedTask, setSelectedTask] = useState("");
  
  // Applied filter states (used for actual filtering)
  const [appliedDomain, setAppliedDomain] = useState("");
  const [appliedTask, setAppliedTask] = useState("");
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskSearchOpen, setTaskSearchOpen] = useState(false);
  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const taskDropdownRef = useRef<HTMLDivElement>(null);

  const fetchPage = async (cursor: string | null, taskId?: string) => {
    setLoading(true);
    setError(null);
    try {
      // FastAPI redirects /papers -> /papers/ (307); hit the canonical path directly
      const url = new URL(`${config.backendUrl}/papers/`);
      url.searchParams.set("limit", "10");
      url.searchParams.set("sort_dir", sortDir);
      if (cursor) url.searchParams.set("cursor", cursor);
      
      const taskToUse = taskId !== undefined ? taskId : appliedTask;
      if (taskToUse) {
        url.searchParams.set("task_id", taskToUse);
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
      const url = new URL(`${config.backendUrl}/tasks/`);
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
    fetchPage(null, selectedTask);
    setPrevCursors([null]);
    setCurrentCursor(null);
  };

  const handleClearFilters = () => {
    setSelectedDomain("");
    setSelectedTask("");
    setAppliedDomain("");
    setAppliedTask("");
    setSearchQuery("");
    setTaskSearchQuery("");
    fetchPage(null, "");
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

  // Filter papers based on search query and applied domain
  const filteredPapers = papers.filter((paper) => {
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = (
        paper.title?.toLowerCase().includes(query) ||
        paper.abstract?.toLowerCase().includes(query) ||
        paper.authors?.some((author) => author.toLowerCase().includes(query))
      );
      if (!matchesSearch) return false;
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
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
                  placeholder="Search papers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
                <select
                  value={selectedDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                >
                  {DOMAIN_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                
                {/* Custom searchable task dropdown */}
                <div ref={taskDropdownRef} className="relative min-w-[200px]">
                  <button
                    onClick={() => setTaskSearchOpen(!taskSearchOpen)}
                    disabled={tasksLoading}
                    className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white disabled:bg-gray-100 text-left flex items-center justify-between"
                  >
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
                            className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-50 transition ${
                              selectedTask === task.id ? 'bg-green-50 text-green-700' : ''
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
                
                <button
                  onClick={handleApplyFilters}
                  className="px-4 py-2 text-sm rounded-lg bg-green-500 text-white hover:bg-green-600 transition"
                >
                  Apply
                </button>
                <button
                  onClick={handleClearFilters}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition"
                >
                  Clear
                </button>
                <button
                  onClick={handleSortToggle}
                  className="inline-flex items-center px-4 py-2 text-sm rounded-lg border bg-white border-gray-300 text-gray-700 hover:bg-gray-50 transition"
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
          <Pager align="center" />
        </div>
      </div>

      {loading && (
        <div className="text-gray-500">Loading papers...</div>
      )}

      {error && (
        <div className="text-red-600 text-sm">{error}</div>
      )}

      {!loading && !error && papers.length === 0 && (
        <div className="text-gray-500">No papers found.</div>
      )}

      {!loading && !error && papers.length > 0 && filteredPapers.length === 0 && (
        <div className="text-gray-500">No papers match your search.</div>
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

      <Pager align="center" />
    </div>
  );
}
