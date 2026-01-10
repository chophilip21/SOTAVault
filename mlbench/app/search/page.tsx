"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getBackendBaseUrl } from "@/lib/backendUrl";

type FuzzyHit =
  | { type: "paper"; id: string; title?: string | null }
  | { type: "dataset"; id: string; name?: string | null }
  | { type: "venue"; id: string };

type FuzzySearchResponse = {
  query: string;
  papers: FuzzyHit[];
  datasets: FuzzyHit[];
  venues: FuzzyHit[];
};

function stripWrappingQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2) {
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1).trim();
    }
  }
  return t;
}

function ResultIcon({ kind }: { kind: "paper" | "dataset" | "venue" }) {
  // Reuse the same visual language as the left navigation (Sidebar icons).
  if (kind === "paper") {
    return (
      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  }
  if (kind === "dataset") {
    // Use the same chart icon as the "Benchmark" nav item (closest match in existing UI).
    return (
      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

export default function SearchPage() {
  const params = useSearchParams();
  const q = (params.get("q") || "").trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FuzzySearchResponse | null>(null);

  const url = useMemo(() => {
    if (!q) return null;
    const u = new URL(`${getBackendBaseUrl()}/search/fuzzy`);
    u.searchParams.set("q", q);
    u.searchParams.set("limit", "12");
    u.searchParams.append("types", "papers");
    u.searchParams.append("types", "datasets");
    u.searchParams.append("types", "venues");
    return u.toString();
  }, [q]);

  useEffect(() => {
    if (!url) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          // Friendly error handling:
          // - 404 typically means the backend container is stale (missing endpoint).
          // - Other errors may contain useful details (we still cap output).
          const body = await res.text().catch(() => "");
          if (res.status === 404) {
            throw new Error(
              "Search service is not available yet (backend returned 404). Try restarting the backend (api-down/api-up) or run local.sh --build once."
            );
          }
          throw new Error(`Search failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
        }
        return (await res.json()) as FuzzySearchResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || "Search failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="max-w-5xl mx-auto px-4 pt-28 pb-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Search</h1>
          <p className="text-gray-600 mt-1">
            Query: <span className="font-medium text-gray-900">{q || "(empty)"}</span>
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Return to home
        </Link>
      </div>

      {loading && <div className="mt-6 text-gray-500">Searching…</div>}
      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && q && data && (
        <div className="mt-8 space-y-10">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">Papers</h2>
            <div className="mt-3 space-y-2">
              {(data.papers || []).length === 0 ? (
                <div className="text-gray-500">No matches.</div>
              ) : (
                (data.papers || []).map((h) => (
                  <div key={`paper-${h.id}`} className="rounded-lg border border-gray-200 p-3">
                    <Link href={`/papers/${h.id}`} className="flex items-center gap-3 font-medium text-green-700 hover:underline">
                      <span className="flex-shrink-0">
                        <ResultIcon kind="paper" />
                      </span>
                      <span className="min-w-0 truncate">
                        {stripWrappingQuotes((h as any).title || h.id)}
                      </span>
                    </Link>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Datasets</h2>
            <div className="mt-3 space-y-2">
              {(data.datasets || []).length === 0 ? (
                <div className="text-gray-500">No matches.</div>
              ) : (
                (data.datasets || []).map((h) => (
                  <div key={`dataset-${h.id}`} className="rounded-lg border border-gray-200 p-3">
                    <Link href={`/datasets/${h.id}`} className="flex items-center gap-3 font-medium text-green-700 hover:underline">
                      <span className="flex-shrink-0">
                        <ResultIcon kind="dataset" />
                      </span>
                      <span className="min-w-0 truncate">
                        {stripWrappingQuotes((h as any).name || h.id)}
                      </span>
                    </Link>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Venues</h2>
            <div className="mt-3 space-y-2">
              {(data.venues || []).length === 0 ? (
                <div className="text-gray-500">No matches.</div>
              ) : (
                (data.venues || []).map((h) => (
                  <div key={`venue-${h.id}`} className="rounded-lg border border-gray-200 p-3">
                    <Link href={`/conference?q=${encodeURIComponent(h.id)}`} className="flex items-center gap-3 font-medium text-green-700 hover:underline">
                      <ResultIcon kind="venue" />
                      <span>{stripWrappingQuotes(h.id)}</span>
                    </Link>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {!loading && !error && !q && (
        <div className="mt-6 text-gray-500">Type a query in the top search bar.</div>
      )}
    </div>
  );
}


