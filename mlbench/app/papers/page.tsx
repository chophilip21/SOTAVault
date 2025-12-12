"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Playfair_Display } from "next/font/google";
import { config } from "@/lib/config";

const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: ["700"] });

interface Paper {
  id: string;
  title: string;
  abstract?: string;
  authors?: string[];
  venue?: string | null;
  year?: number | null;
  created_at?: string;
  score?: number;
}

interface PapersResponse {
  items: Paper[];
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

  const fetchPage = async (cursor: string | null) => {
    setLoading(true);
    setError(null);
    try {
      // FastAPI redirects /papers -> /papers/ (307); hit the canonical path directly
      const url = new URL(`${config.backendUrl}/papers/`);
      url.searchParams.set("limit", "10");
      url.searchParams.set("sort_dir", sortDir);
      if (cursor) url.searchParams.set("cursor", cursor);

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

  useEffect(() => {
    fetchPage(null);
    setPrevCursors([null]);
    setCurrentCursor(null);
  }, [sortDir]);

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

  // Filter papers based on search query
  const filteredPapers = papers.filter((paper) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      paper.title?.toLowerCase().includes(query) ||
      paper.abstract?.toLowerCase().includes(query) ||
      paper.authors?.some((author) => author.toLowerCase().includes(query))
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8 items-center">
          <div className="flex-none w-full md:w-auto md:max-w-xl flex flex-col gap-3">
            <div>
              <h1 className={`text-5xl font-bold text-gray-900 ${playfairDisplay.className}`}>Papers</h1>
              <p className="text-gray-600 text-base mt-3 break-words">
                Discover the latest papers and groundbreaking research in machine learning and AI.
              </p>
            </div>
            <div className="flex flex-col gap-4">
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
              <button
                onClick={handleSortToggle}
                className={`inline-flex items-center px-4 py-2 text-sm rounded-full border ${
                  sortDir === "desc"
                    ? "bg-gray-200 border-gray-300 text-gray-800"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                } max-w-fit`}
              >
                Sort by newest
              </button>
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
