"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { PaperCoverArt } from "../../components/PaperCoverArt";
import { GithubRepoStats } from "../../components/GithubRepoStats";
import { config } from "@/lib/config";
import { getBackendBaseUrl } from "@/lib/backendUrl";
import { normalizeGithubRepo, GithubRepoMetadataItem, GithubRepoMetadataResponse } from "@/lib/github";
import { useBookmarks } from "@/hooks/useBookmarks";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { MathText } from "@/lib/mathText";

function stripOuterQuotes(s: string): string {
  const t = (s || "").trim();
  return t.replace(/^["'“”]+/, "").replace(/["'“”]+$/, "").trim();
}

interface PaperDetail {
  id: string;
  logical_id?: string | null;
  title: string;
  domain?: string;
  task_ids?: string[];
  abstract?: string;
  authors?: string[];
  venue?: string | null;
  year?: number | null;
  arxiv_id?: string | null;
  doi?: string | null;
  project_url?: string | null;
  pdf_url?: string | null;
  created_at?: string;
  updated_at?: string;
  score?: number;
  tags?: string[];
  official_code?: string[];
  unofficial_code?: string[];
  dataset_ids?: string[];
}

interface PaperResult {
  id: string;
  task_id?: string;
  dataset_id: string;
  split?: string;
  metric_name: string;
  metric_value: number;
  higher_is_better?: boolean;
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

interface Dataset {
  id: string;
  name: string;
}

interface DatasetsResponse {
  items: Dataset[];
}

export default function PaperDetailPage() {
  const params = useParams();
  const router = useRouter();
  const paperId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [paper, setPaper] = useState<PaperDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PaperResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [related, setRelated] = useState<PaperDetail[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [githubMeta, setGithubMeta] = useState<Record<string, GithubRepoMetadataItem>>({});
  const [showUnofficial, setShowUnofficial] = useState(false);
  const [tasksById, setTasksById] = useState<Record<string, Task>>({});
  const [tasksLoading, setTasksLoading] = useState(false);
  const [datasetsById, setDatasetsById] = useState<Record<string, Dataset>>({});
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(true);
  const { bookmarkedIds, toggleBookmark } = useBookmarks("paper");

  const displayTitle = paper ? stripOuterQuotes(paper.title || "") : "";

  useEffect(() => {
    const load = async () => {
      if (!paperId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${getBackendBaseUrl()}/papers/${paperId}`);
        if (res.status === 404) {
          setError("Paper not found");
          setLoading(false);
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to load paper");
        }
        const data = await res.json();
        setPaper(data);
      } catch (err: any) {
        setError(err.message || "Failed to load paper");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [paperId]);

  useEffect(() => {
    // Fetch GitHub metadata for official_code repos (best-effort; do not block render).
    if (!paper?.official_code || paper.official_code.length === 0) return;

    const repos = Array.from(
      new Set(
        paper.official_code
          .map((u) => normalizeGithubRepo(u))
          .filter((x): x is string => Boolean(x))
      )
    );
    if (repos.length === 0) return;

    const controller = new AbortController();
    const run = async () => {
      try {
        const res = await fetch(`${getBackendBaseUrl()}/github/repo-metadata`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repos }),
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
  }, [paper?.id, paper?.official_code]);

  const fetchGithubGetMany = async (reposOrUrls: string[]) => {
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

  useEffect(() => {
    const loadResults = async () => {
      if (!paper || !paper.dataset_ids || paper.dataset_ids.length === 0) {
        setResults([]);
        return;
      }
      setResultsLoading(true);
      setResultsError(null);
      try {
        const res = await fetch(`${getBackendBaseUrl()}/papers/${paper.id}/results`);
        if (res.status === 404) {
          setResults([]);
          setResultsLoading(false);
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to load results");
        }
        const data = await res.json();
        setResults(data.items || []);
      } catch (err: any) {
        setResultsError(err.message || "Failed to load results");
      } finally {
        setResultsLoading(false);
      }
    };
    loadResults();
  }, [paper]);

  useEffect(() => {
    // Collect all task IDs + dataset IDs from both Paper AND Results
    const allTaskIds = new Set<string>();
    if (paper?.task_ids) paper.task_ids.forEach((id) => allTaskIds.add(id));
    results.forEach((r) => { if (r.task_id) allTaskIds.add(r.task_id); });
    const missingTaskIds = Array.from(allTaskIds).filter((id) => !tasksById[id]);

    const allDatasetIds = new Set<string>();
    if (paper?.dataset_ids) paper.dataset_ids.forEach((id) => allDatasetIds.add(id));
    results.forEach((r) => { if (r.dataset_id) allDatasetIds.add(r.dataset_id); });
    const missingDatasetIds = Array.from(allDatasetIds).filter((id) => !datasetsById[id]);

    const fetchTasks = async (ids: string[]) => {
      setTasksLoading(true);
      try {
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
        for (const chunk of chunks) {
          const url = new URL(`${getBackendBaseUrl()}/tasks/bulk`);
          chunk.forEach((id) => url.searchParams.append("ids", id));
          const res = await fetch(url.toString());
          if (!res.ok) continue;
          const data: TasksResponse = await res.json();
          const items = data.items || [];
          setTasksById((prev) => {
            const next = { ...prev };
            for (const t of items) next[t.id] = t;
            return next;
          });
        }
      } catch (err) {
        console.error("Failed to fetch tasks", err);
      } finally {
        setTasksLoading(false);
      }
    };

    const fetchDatasets = async (ids: string[]) => {
      setDatasetsLoading(true);
      try {
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
        for (const chunk of chunks) {
          const url = new URL(`${getBackendBaseUrl()}/datasets/bulk`);
          chunk.forEach((id) => url.searchParams.append("ids", id));
          const res = await fetch(url.toString());
          if (!res.ok) continue;
          const data: DatasetsResponse = await res.json();
          const items = data.items || [];
          setDatasetsById((prev) => {
            const next = { ...prev };
            for (const d of items) next[d.id] = d;
            return next;
          });
        }
      } catch (err) {
        console.error("Failed to fetch datasets", err);
      } finally {
        setDatasetsLoading(false);
      }
    };

    if (missingTaskIds.length > 0) fetchTasks(missingTaskIds);
    if (missingDatasetIds.length > 0) fetchDatasets(missingDatasetIds);

    // Dependencies: trigger when paper or results change. 
    // We do NOT depend on tasksById/datasetsById to avoid loops, 
    // instead rely on the missing check inside the effect body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper, results]);

  useEffect(() => {
    const loadRelated = async () => {
      if (!paperId) return;
      if (!paper?.logical_id) {
        setRelated([]);
        return;
      }
      setRelatedLoading(true);
      try {
        const url = new URL(`${getBackendBaseUrl()}/papers/${paperId}/related`);
        url.searchParams.set("limit", "10");
        const res = await fetch(url.toString());
        if (!res.ok) {
          setRelated([]);
          return;
        }
        const data = await res.json();
        setRelated((data.items || []) as PaperDetail[]);
      } catch {
        setRelated([]);
      } finally {
        setRelatedLoading(false);
      }
    };
    loadRelated();
  }, [paperId, paper?.logical_id]);

  const created = paper?.created_at
    ? new Date(paper.created_at).toLocaleDateString()
    : null;
  const updated = paper?.updated_at
    ? new Date(paper.updated_at).toLocaleDateString()
    : null;

  return (
    <div className="mx-auto w-full max-w-7xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Link href="/papers" className="text-green-600 hover:underline">
          ← Back to Papers
        </Link>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-24">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-500 font-medium">Loading paper details...</p>
        </div>
      )}
      {error && !loading && (
        <div className="text-red-600 text-sm">{error}</div>
      )}

      {!loading && !error && paper && (
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-24 h-24 relative rounded border border-gray-200 overflow-hidden bg-gray-50 group">
              <PaperCoverArt
                seed={paper.arxiv_id || paper.id}
                title={displayTitle}
                authors={paper.authors}
                year={paper.year}
                className="absolute inset-0"
                ariaLabel={displayTitle ? `Paper cover: ${displayTitle}` : "Paper cover"}
              />
              {/* Bookmark button overlay */}
              <button
                onClick={() => paperId && toggleBookmark(paperId as string, displayTitle)}
                className={`absolute top-1 right-1 p-1.5 rounded-full border transition-all shadow-sm ${paperId && bookmarkedIds[paperId as string]
                  ? "border-green-300 bg-green-50 text-green-800 opacity-100"
                  : "border-white bg-white/90 text-gray-600 opacity-0 group-hover:opacity-100"
                  }`}
                title={paperId && bookmarkedIds[paperId as string] ? "Remove bookmark" : "Add bookmark"}
                aria-label={paperId && bookmarkedIds[paperId as string] ? "Remove bookmark" : "Add bookmark"}
              >
                <span aria-hidden="true" className="text-base leading-none">
                  {paperId && bookmarkedIds[paperId as string] ? "🔖" : "📑"}
                </span>
              </button>
            </div>
            <div className="flex-1 space-y-2">
              <h1 className="text-2xl font-bold text-gray-900">
                <MathText>{displayTitle}</MathText>
              </h1>
              {paper.authors && paper.authors.length > 0 && (
                <p className="text-sm text-gray-700">
                  {paper.authors.join(", ")}
                </p>
              )}
              {(paper.venue || paper.year) && (
                <p className="text-sm text-gray-600">
                  {[paper.venue, paper.year].filter(Boolean).join(" · ")}
                </p>
              )}


              <div className="flex flex-wrap gap-1 mt-2">
                {paper.domain && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                    {paper.domain}
                  </span>
                )}
                {paper.task_ids && paper.task_ids.length > 0 && (
                  <>
                    {paper.task_ids
                      .map(id => tasksById[id]?.name)
                      .filter(Boolean)
                      .map(name => name.replace(/-/g, " "))
                      .filter((name) => name.toLowerCase() !== "task") // Filter out generic "task" label
                      .filter((name, i, arr) => arr.indexOf(name) === i) // Deduplicate names
                      .sort((a, b) => a.localeCompare(b))
                      .map(name => (
                        <span
                          key={name}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100"
                        >
                          {name}
                        </span>
                      ))
                    }
                    {tasksLoading && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-400 border border-blue-100">
                        Loading tasks...
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {paper.abstract && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Abstract
              </h2>
              <p className="text-sm text-gray-800 whitespace-pre-line">
                <MathText>{paper.abstract}</MathText>
              </p>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2">
                <span role="img" aria-label="versions">🧩</span>
                <h2 className="text-lg font-semibold text-gray-900">Other versions</h2>
              </div>
              {relatedLoading ? <span className="text-xs text-gray-500">Loading...</span> : null}
            </div>
            {!relatedLoading && related.length === 0 ? (
              <div className="mt-2 text-sm text-gray-500">No other versions found.</div>
            ) : related.length > 0 ? (
              <div className="mt-3 space-y-2">
                {related.map((p) => (
                  <Link
                    key={p.id}
                    href={`/papers/${p.id}`}
                    className="block rounded-md border border-gray-200 px-3 py-2 hover:bg-gray-50"
                  >
                    <div className="text-sm font-medium text-gray-900">
                      <MathText>{stripOuterQuotes(p.title || "")}</MathText>
                    </div>
                    {(p.venue || p.year) && (
                      <div className="text-xs text-gray-600 mt-0.5">
                        {[p.venue, p.year].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Resources</h3>
            <div className="flex flex-wrap gap-3">
              {paper.arxiv_id && (
                <a
                  href={`https://arxiv.org/abs/${paper.arxiv_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors text-sm font-medium"
                >
                  <span role="img" aria-label="arxiv">📄</span>
                  <span>arXiv: {paper.arxiv_id}</span>
                </a>
              )}
              {paper.doi && (
                <a
                  href={`https://doi.org/${paper.doi}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-50 text-yellow-800 border border-yellow-200 hover:bg-yellow-100 transition-colors text-sm font-medium"
                >
                  <span role="img" aria-label="doi">🔗</span>
                  <span>DOI</span>
                </a>
              )}
              {paper.project_url && (
                <a
                  href={paper.project_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors text-sm font-medium"
                >
                  <span role="img" aria-label="project">🌐</span>
                  <span>Project Page</span>
                </a>
              )}
              {paper.pdf_url && (
                <a
                  href={paper.pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 text-red-800 border border-red-200 hover:bg-red-100 transition-colors text-sm font-medium"
                >
                  <span role="img" aria-label="pdf">📑</span>
                  <span>PDF</span>
                </a>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Code</h4>
              <div className="flex flex-col gap-2">
                {paper.official_code && paper.official_code.length > 0 ? (
                  paper.official_code.map((url) => {
                    const key = normalizeGithubRepo(url);
                    const meta = key ? githubMeta[key] : undefined;
                    return (
                      <div key={url} className="flex flex-wrap items-center gap-2">
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-gray-800 border border-gray-200 hover:bg-gray-200 transition-colors text-sm font-medium"
                        >
                          <span role="img" aria-label="code">💻</span>
                          <span>Official Code</span>
                        </a>
                        {key && (
                          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-full px-2 py-1 text-xs text-gray-600 shadow-sm">
                            <GithubRepoStats
                              status={meta?.status as any}
                              stars={meta?.data?.stars}
                              forks={meta?.data?.forks}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <span className="text-gray-500 text-sm italic">No official code available.</span>
                )}

                {paper.unofficial_code && paper.unofficial_code.length > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() => {
                        const next = !showUnofficial;
                        setShowUnofficial(next);
                        if (next) {
                          const keys = Array.from(
                            new Set(
                              (paper.unofficial_code || [])
                                .map((u) => normalizeGithubRepo(u))
                                .filter((x): x is string => Boolean(x))
                            )
                          ).sort();
                          const missing = keys.filter((k) => !githubMeta[k] || githubMeta[k]?.status === "pending");
                          if (missing.length > 0) fetchGithubGetMany(missing);
                        }
                      }}
                      className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-2 font-medium"
                    >
                      <span>{showUnofficial ? "Hide" : "Show"} Unofficial Code ({paper.unofficial_code.length})</span>
                    </button>
                    {showUnofficial && (
                      <div className="flex flex-col gap-2 pl-2 border-l-2 border-gray-100">
                        {paper.unofficial_code.map((url) => {
                          const key = normalizeGithubRepo(url);
                          const meta = key ? githubMeta[key] : undefined;
                          return (
                            <div key={url} className="flex flex-wrap items-center gap-2">
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 transition-colors text-sm"
                              >
                                <span role="img" aria-label="code">💻</span>
                                <span>Unofficial</span>
                              </a>
                              {key && (
                                <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-full px-2 py-1 text-xs text-gray-600 shadow-sm">
                                  <GithubRepoStats
                                    status={meta?.status as any}
                                    stars={meta?.data?.stars}
                                    forks={meta?.data?.forks}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <div
              className="flex items-center justify-between cursor-pointer select-none"
              onClick={() => setResultsOpen(!resultsOpen)}
            >
              <div className="inline-flex items-center gap-2">
                <span role="img" aria-label="results">📊</span>
                <h2 className="text-lg font-semibold text-gray-900">Results</h2>
              </div>
              <div className="flex items-center gap-3">
                {resultsLoading && <span className="text-xs text-gray-500">Loading...</span>}
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <i className={`fa-solid fa-chevron-${resultsOpen ? "up" : "down"}`}></i>
                </button>
              </div>
            </div>
            {resultsOpen && (
              <>
                {resultsError && (
                  <div className="text-sm text-red-600">{resultsError}</div>
                )}
                {!resultsLoading && !resultsError && results.length === 0 && (
                  <div className="text-sm text-gray-500">No results available.</div>
                )}
                {!resultsLoading && results.length > 0 && (
                  <div className="space-y-4">
                    {(() => {
                      // Group results by dataset_id
                      const grouped: Record<string, PaperResult[]> = {};
                      results.forEach((r) => {
                        const did = r.dataset_id;
                        if (!grouped[did]) grouped[did] = [];
                        grouped[did].push(r);
                      });

                      // Sort groups alphabetically by dataset name
                      const sortedDatasetIds = Object.keys(grouped).sort((a, b) => {
                        const nameA = (datasetsById[a]?.name || a).toLowerCase();
                        const nameB = (datasetsById[b]?.name || b).toLowerCase();
                        return nameA.localeCompare(nameB);
                      });

                      return sortedDatasetIds.map((did) => {
                        const datasetName = datasetsById[did]?.name || did;
                        const groupResults = grouped[did];

                        return (
                          <div key={did} className="border border-gray-200 rounded-lg overflow-hidden">
                            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 font-medium text-gray-900 flex items-center justify-between">
                              <Link href={`/datasets/${did}`} className="hover:underline hover:text-green-700">
                                {datasetName}
                              </Link>
                              <span className="text-xs text-gray-500 font-normal">{groupResults.length} results</span>
                            </div>
                            <div className="divide-y divide-gray-100">
                              {groupResults.map((r) => (
                                <div key={r.id} className="p-3 text-sm text-gray-800 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                                  <div className="mt-0.5 text-gray-400">
                                    <i className="fa-solid fa-chart-simple"></i>
                                  </div>
                                  <div className="flex-1">
                                    <div className="font-medium text-gray-900">
                                      {r.metric_name}: {r.metric_value}
                                      {r.higher_is_better === false ? " (lower is better)" : ""}
                                    </div>
                                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mt-0.5">
                                      {r.task_id && (
                                        <span>
                                          {tasksById[r.task_id]?.name || r.task_id}
                                        </span>
                                      )}
                                      {r.split && <span>Split: {r.split}</span>}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2">
                <span role="img" aria-label="comments">💬</span>
                <h2 className="text-lg font-semibold text-gray-900">Comments</h2>
              </div>
              <span className="text-xs text-gray-500">Coming soon</span>
            </div>
            <button
              disabled
              className="px-4 py-2 rounded-md border border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed"
            >
              Comments are disabled for now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

