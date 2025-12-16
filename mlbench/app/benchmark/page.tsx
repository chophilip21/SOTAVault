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

const DOMAIN_ICONS: Record<string, string> = {
  cv: "/icons/cv.png",
  nlp: "/icons/nlp.png",
  audio: "/icons/audio.png",
  robots: "/icons/robotics.png",
  time_series: "/icons/timeseries.png",
  multimodal: "/icons/multi.png",
  theory: "/icons/theory.png",
  other: "/icons/cv.png", // Default fallback
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

export default function BenchmarkPage() {
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [prevCursors, setPrevCursors] = useState<Array<string | null>>([null]);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [limit] = useState(10);
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

  const fetchPage = async (cursor: string | null, domain?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`${config.backendUrl}/datasets/`);
      url.searchParams.set("limit", limit.toString());
      if (cursor) {
        url.searchParams.set("cursor", cursor);
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
    fetchPage(null, selectedDomain);
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

  // Filter benchmarks based on search query and applied task filter
  const filteredBenchmarks = benchmarks.filter((benchmark) => {
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = (
        benchmark.name?.toLowerCase().includes(query) ||
        benchmark.full_name?.toLowerCase().includes(query) ||
        benchmark.description?.toLowerCase().includes(query) ||
        benchmark.domain?.toLowerCase().includes(query)
      );
      if (!matchesSearch) return false;
    }

    // Task filter (client-side) - use applied task
    if (appliedTask && benchmark.task_ids) {
      if (!benchmark.task_ids.includes(appliedTask)) return false;
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
              <h1 className={`text-5xl font-bold text-gray-900 ${playfairDisplay.className}`}>Benchmarks</h1>
              <p className="text-gray-600 text-base mt-3 break-words">
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
            <Pager align="center" />
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-gray-500">Loading benchmarks...</div>
      )}

      {error && (
        <div className="text-red-600 text-sm">{error}</div>
      )}

      {!loading && !error && benchmarks.length === 0 && (
        <div className="text-gray-500">No benchmarks found.</div>
      )}

      {!loading && !error && benchmarks.length > 0 && filteredBenchmarks.length === 0 && (
        <div className="text-gray-500">No benchmarks match your search.</div>
      )}

      <div className="space-y-5">
        {filteredBenchmarks.map((benchmark) => (
          <div
            key={benchmark.id}
            className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200"
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-20 h-20 relative rounded-xl border border-gray-100 overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
                <Image
                  src={getDomainIcon(benchmark.domain)}
                  alt={`${benchmark.domain || 'dataset'} icon`}
                  fill
                  sizes="80px"
                  className="object-contain p-2"
                />
              </div>
              <div className="flex-1">
                <Link href={`/datasets/${benchmark.id}`}>
                  <h2 className="text-lg font-semibold text-gray-900 hover:text-green-600 transition">
                    {benchmark.name}
                  </h2>
                </Link>
                {benchmark.full_name && benchmark.full_name !== benchmark.name && (
                  <p className="text-sm text-gray-600 mt-1">{benchmark.full_name}</p>
                )}
                {benchmark.description && (
                  <p className="text-sm text-gray-700 mt-2 line-clamp-3">{benchmark.description}</p>
                )}
                {(benchmark.modalities && benchmark.modalities.length > 0) && (
                  <p className="text-xs text-gray-500 mt-2">
                    Modalities: {benchmark.modalities.join(", ")}
                  </p>
                )}
                {benchmark.paper_count !== undefined && (
                  <div className="flex gap-4 mt-3 text-sm text-gray-600">
                    <span>{benchmark.paper_count} {benchmark.paper_count === 1 ? 'paper' : 'papers'}</span>
                  </div>
                )}
              </div>
            </div>
            {benchmark.created_at && (
              <div className="mt-4 flex items-center gap-2">
                <p className="text-xs text-gray-400">
                  Created {new Date(benchmark.created_at).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <Pager align="center" />
    </div>
  );
}
