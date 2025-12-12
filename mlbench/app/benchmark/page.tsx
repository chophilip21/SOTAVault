"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Playfair_Display } from "next/font/google";
import { config } from "@/lib/config";

const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: ["700"] });

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
  total: number;
  limit: number;
  offset: number;
}

export default function BenchmarkPage() {
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchPage = async (offset: number) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`${config.backendUrl}/datasets/`);
      url.searchParams.set("limit", limit.toString());
      url.searchParams.set("offset", offset.toString());

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load benchmarks");
      const data: BenchmarksResponse = await res.json();

      setBenchmarks(data.items || []);
      setTotal(data.total || 0);
      setHasMore(offset + limit < (data.total || 0));
      setCurrentOffset(offset);
    } catch (err: any) {
      setError(err.message || "Failed to load benchmarks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(0);
  }, []);

  const handleNext = () => {
    if (!hasMore) return;
    fetchPage(currentOffset + limit);
  };

  const handlePrev = () => {
    if (currentOffset === 0) return;
    const newOffset = Math.max(0, currentOffset - limit);
    fetchPage(newOffset);
  };

  const Pager = ({ align }: { align: "right" | "center" }) => (
    <div
      className={`flex gap-2 ${align === "center" ? "justify-center" : "justify-end"} flex-wrap`}
    >
      <button
        onClick={handlePrev}
        disabled={currentOffset === 0 || loading}
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

  // Filter benchmarks based on search query
  const filteredBenchmarks = benchmarks.filter((benchmark) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      benchmark.name?.toLowerCase().includes(query) ||
      benchmark.full_name?.toLowerCase().includes(query) ||
      benchmark.description?.toLowerCase().includes(query) ||
      benchmark.domain?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-1 flex flex-col gap-3">
            <div className="max-w-2xl">
              <h1 className={`text-5xl font-bold text-gray-900 ${playfairDisplay.className}`}>Benchmarks</h1>
              <p className="text-gray-600 text-base mt-3 break-words">
                Discover the latest benchmarks and datasets in machine learning and AI.
              </p>
            </div>
            <div className="relative max-w-2xl">
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
          </div>
          <div className="flex-shrink-0">
            <Image
              src="/benchmark.png"
              alt="Benchmarks illustration"
              width={180}
              height={180}
              className="opacity-80"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-gray-600 text-sm">
            Showing {benchmarks.length > 0 ? currentOffset + 1 : 0} - {Math.min(currentOffset + limit, total)} of {total} benchmarks
          </p>
          <Pager align="center" />
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

      <div className="space-y-4">
        {filteredBenchmarks.map((benchmark) => (
          <div
            key={benchmark.id}
            className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition"
          >
            <div className="flex justify-between items-start gap-4">
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
                {benchmark.domain && (
                  <p className="text-xs text-gray-500 mt-2">
                    Domain: {benchmark.domain}
                  </p>
                )}
                {(benchmark.modalities && benchmark.modalities.length > 0) && (
                  <p className="text-xs text-gray-500 mt-1">
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
