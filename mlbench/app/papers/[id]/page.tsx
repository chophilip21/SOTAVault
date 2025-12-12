"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { config } from "@/lib/config";

interface PaperDetail {
  id: string;
  title: string;
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

  useEffect(() => {
    const load = async () => {
      if (!paperId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${config.backendUrl}/papers/${paperId}`);
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
    const loadResults = async () => {
      if (!paper || !paper.dataset_ids || paper.dataset_ids.length === 0) {
        setResults([]);
        return;
      }
      setResultsLoading(true);
      setResultsError(null);
      try {
        const res = await fetch(`${config.backendUrl}/papers/${paper.id}/results`);
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

  const created = paper?.created_at
    ? new Date(paper.created_at).toLocaleDateString()
    : null;
  const updated = paper?.updated_at
    ? new Date(paper.updated_at).toLocaleDateString()
    : null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Link href="/papers" className="text-green-600 hover:underline">
          ← Back to Papers
        </Link>
      </div>

      {loading && <div className="text-gray-500">Loading paper...</div>}
      {error && !loading && (
        <div className="text-red-600 text-sm">{error}</div>
      )}

      {!loading && !error && paper && (
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-24 h-24 relative rounded border border-gray-200 overflow-hidden bg-gray-50">
              <Image
                src="/ArXiv_logo_2022.png"
                alt="Paper thumbnail"
                fill
                sizes="96px"
                className="object-contain p-2"
              />
            </div>
            <div className="flex-1 space-y-2">
              <h1 className="text-2xl font-bold text-gray-900">{paper.title}</h1>
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
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                {created && <span>Created {created}</span>}
                {updated && <span>Updated {updated}</span>}
                {paper.score !== undefined && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-700">
                    ★ {paper.score}
                  </span>
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
                {paper.abstract}
              </p>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2 text-sm text-gray-800">
            {paper.arxiv_id && (
              <div className="flex justify-between items-center gap-3">
                <span className="inline-flex items-center gap-2 text-gray-600">
                  <span role="img" aria-label="arxiv">📄</span>
                  arXiv
                </span>
                <a
                  className="text-green-600 hover:underline"
                  href={`https://arxiv.org/abs/${paper.arxiv_id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {paper.arxiv_id}
                </a>
              </div>
            )}
            {paper.doi && (
              <div className="flex justify-between items-center gap-3">
                <span className="inline-flex items-center gap-2 text-gray-600">
                  <span role="img" aria-label="doi">🔗</span>
                  DOI
                </span>
                <a
                  className="text-green-600 hover:underline break-all text-right"
                  href={`https://doi.org/${paper.doi}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {paper.doi}
                </a>
              </div>
            )}
            {paper.project_url && (
              <div className="flex justify-between items-center gap-3">
                <span className="inline-flex items-center gap-2 text-gray-600">
                  <span role="img" aria-label="project">🌐</span>
                  Project
                </span>
                <a
                  className="text-green-600 hover:underline break-all text-right"
                  href={paper.project_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {paper.project_url}
                </a>
              </div>
            )}
            {paper.pdf_url && (
              <div className="flex justify-between items-center gap-3">
                <span className="inline-flex items-center gap-2 text-gray-600">
                  <span role="img" aria-label="pdf">📑</span>
                  PDF
                </span>
                <a
                  className="text-green-600 hover:underline break-all text-right"
                  href={paper.pdf_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {paper.pdf_url}
                </a>
              </div>
            )}
            <div className="pt-2 border-t border-gray-200 mt-2 space-y-1">
              <div className="text-gray-600 font-semibold">Code</div>
              {paper.official_code && paper.official_code.length > 0 && (
                <div className="space-y-1">
                  {paper.official_code.map((url) => (
                    <div key={url} className="flex justify-between items-center gap-3">
                      <span className="inline-flex items-center gap-2 text-gray-600">
                        <span role="img" aria-label="code">💻</span>
                        Official
                      </span>
                      <a
                        className="text-green-600 hover:underline break-all text-right"
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {url}
                      </a>
                    </div>
                  ))}
                </div>
              )}
              {paper.unofficial_code && paper.unofficial_code.length > 0 && (
                <div className="space-y-1">
                  {paper.unofficial_code.map((url) => (
                    <div key={url} className="flex justify-between items-center gap-3">
                      <span className="inline-flex items-center gap-2 text-gray-600">
                        <span role="img" aria-label="code">💻</span>
                        Unofficial
                      </span>
                      <a
                        className="text-green-600 hover:underline break-all text-right"
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {url}
                      </a>
                    </div>
                  ))}
                </div>
              )}
              {(!paper.official_code || paper.official_code.length === 0) &&
               (!paper.unofficial_code || paper.unofficial_code.length === 0) && (
                <div className="text-gray-500 text-sm">Code is not available yet.</div>
              )}
            </div>
          </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-2">
                  <span role="img" aria-label="results">📊</span>
                  <h2 className="text-lg font-semibold text-gray-900">Results</h2>
                </div>
              {resultsLoading && <span className="text-xs text-gray-500">Loading...</span>}
            </div>
            {resultsError && (
              <div className="text-sm text-red-600">{resultsError}</div>
            )}
            {!resultsLoading && !resultsError && results.length === 0 && (
              <div className="text-sm text-gray-500">No results available.</div>
            )}
            {!resultsLoading && results.length > 0 && (
              <div className="space-y-2">
                {results.map((r) => (
                  <div
                    key={r.id}
                    className="border border-gray-200 rounded-lg p-3 text-sm text-gray-800"
                  >
                    <div className="flex flex-wrap gap-2 text-gray-600 text-xs mb-1">
                      {r.dataset_id && <span>Dataset: {r.dataset_id}</span>}
                      {r.task_id && <span>Task: {r.task_id}</span>}
                      {r.split && <span>Split: {r.split}</span>}
                    </div>
                    <div className="font-semibold">
                      {r.metric_name}: {r.metric_value}
                      {r.higher_is_better === false ? " (lower is better)" : ""}
                    </div>
                  </div>
                ))}
              </div>
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

