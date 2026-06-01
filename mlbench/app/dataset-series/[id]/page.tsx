"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getBackendBaseUrl } from "@/lib/backendUrl";
import { useBookmarks } from "@/hooks/useBookmarks";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { MathText } from "@/lib/mathText";
import { inter } from "@/lib/fonts";
import { cleanMetricDescription } from "@/lib/metricDescription";
import { capitalizeSeriesName } from "@/lib/formatName";

interface DatasetSeries {
  id: string;
  name: string;
  description?: string;
  homepage?: string;
  domain?: string;
  task_ids?: string[];
  algorithms?: string[];
}

interface Dataset {
  id: string;
  name: string;
  full_name?: string;
  variant_key?: string;
  description?: string;
}

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

function normalizeForMatch(s: string): string {
  return (s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length];
}

/** Higher score = closer to the series name (e.g. COCO before coco-stuff before CIRCO). */
function seriesNameMatchScore(seriesName: string, datasetName: string): number {
  const series = normalizeForMatch(seriesName);
  const dataset = normalizeForMatch(datasetName);
  if (!series || !dataset) return 0;
  if (dataset === series) return 1000;
  if (dataset.startsWith(series)) return 800 - Math.min(dataset.length - series.length, 200);
  if (series.startsWith(dataset)) return 750 - Math.min(series.length - dataset.length, 200);
  if (dataset.includes(series)) return 600 - Math.min(dataset.length - series.length, 200);
  if (series.includes(dataset)) return 550 - Math.min(series.length - dataset.length, 200);

  const dist = levenshtein(series, dataset);
  const maxLen = Math.max(series.length, dataset.length, 1);
  return Math.round((1 - dist / maxLen) * 100);
}

function sortDatasetsForSeries(seriesName: string, items: Dataset[]): Dataset[] {
  return [...items].sort((a, b) => {
    const aBase = a.variant_key?.toLowerCase() === "base";
    const bBase = b.variant_key?.toLowerCase() === "base";
    if (aBase !== bBase) return aBase ? -1 : 1;

    const scoreDiff =
      seriesNameMatchScore(seriesName, b.name) - seriesNameMatchScore(seriesName, a.name);
    if (scoreDiff !== 0) return scoreDiff;

    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export default function DatasetSeriesDetailPage() {
  const params = useParams();
  const seriesId = params.id as string;

  const [series, setSeries] = useState<DatasetSeries | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [datasetsLoading, setDatasetsLoading] = useState(false);

  const { bookmarkedIds, toggleBookmark } = useBookmarks("dataset_series");

  useEffect(() => {
    const fetchSeriesAndDatasets = async () => {
      setLoading(true);
      setError(null);
      try {
        const seriesRes = await fetch(`${getBackendBaseUrl()}/dataset_series/${seriesId}`);
        if (!seriesRes.ok) {
          if (seriesRes.status === 404) {
            throw new Error("Dataset series not found");
          }
          throw new Error("Failed to load dataset series");
        }
        const seriesData: DatasetSeries = await seriesRes.json();
        setSeries(seriesData);

        setDatasetsLoading(true);
        const datasetsRes = await fetch(`${getBackendBaseUrl()}/dataset_series/${seriesId}/datasets`);
        if (datasetsRes.ok) {
          const datasetsData = await datasetsRes.json();
          setDatasets(datasetsData.items || []);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load data");
      } finally {
        setLoading(false);
        setDatasetsLoading(false);
      }
    };

    if (seriesId) {
      fetchSeriesAndDatasets();
    }
  }, [seriesId]);

  const sortedDatasets = useMemo(
    () => (series ? sortDatasetsForSeries(series.name, datasets) : datasets),
    [series, datasets],
  );

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-24 flex flex-col items-center justify-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-gray-500 font-medium">Loading dataset series...</p>
      </div>
    );
  }

  if (error || !series) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8">
        <div className="text-red-600">{error || "Dataset series not found"}</div>
        <Link href="/benchmark" className="text-green-600 hover:underline mt-4 inline-block">
          ← Back to Benchmarks
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <Link href="/benchmark" className="text-green-600 hover:underline inline-flex items-center gap-1">
        <span>←</span> Back to Benchmarks
      </Link>

      <div className="bg-white border border-gray-100 rounded-2xl p-4 md:p-8 shadow-sm">
        <div className="flex flex-col items-center md:flex-row md:items-start gap-4 md:gap-6">
          <div className="flex-shrink-0 w-24 h-24 md:w-32 md:h-32 relative rounded-xl border border-gray-100 overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
            <Image
              src={getDomainIcon(series.domain)}
              alt={`${series.domain || 'domain'} icon`}
              fill
              sizes="(max-width: 768px) 96px, 128px"
              className="object-contain p-2 md:p-3"
            />
          </div>

          <div className="flex-1 min-w-0 w-full max-md:text-center md:text-left">
            <div className="flex flex-col max-md:items-center md:flex-row md:items-start md:justify-between gap-3 md:gap-4">
              <h1 className={`min-w-0 flex-1 text-2xl md:text-4xl font-bold text-gray-900 tracking-tight break-words ${inter.className}`}>
                <MathText>{capitalizeSeriesName(series.name)}</MathText>
              </h1>
              <button
                type="button"
                onClick={() => toggleBookmark(seriesId, series.name)}
                className={`inline-flex w-auto items-center justify-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full border transition-all text-xs sm:text-sm font-semibold shrink-0 ${
                  bookmarkedIds[seriesId]
                    ? "border-teal-300 bg-teal-50 text-teal-800"
                    : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
                title={bookmarkedIds[seriesId] ? "Remove bookmark" : "Bookmark this series"}
                aria-pressed={Boolean(bookmarkedIds[seriesId])}
              >
                <span aria-hidden="true">{bookmarkedIds[seriesId] ? "🔖" : "📑"}</span>
                <span>{bookmarkedIds[seriesId] ? "Bookmarked" : "Bookmark Series"}</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mt-4 max-md:justify-center md:justify-start">
              {series.domain && (
                <span className="px-3 py-1 text-sm bg-gray-100 text-gray-800 rounded-full">
                  {series.domain}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Datasets */}
        <div className="mt-6 pt-6 border-t border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Dataset variants</h2>

          {datasetsLoading ? (
            <div className="mt-4 text-sm text-gray-500">Loading datasets...</div>
          ) : datasets.length === 0 ? (
            <div className="mt-4 text-sm text-gray-500">No datasets found for this series.</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {sortedDatasets.map((dataset) => {
                const isBase = dataset.variant_key?.toLowerCase() === "base";
                
                const GRADIENTS = [
                  "bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700 shadow-blue-50",
                  "bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-700 shadow-indigo-50",
                  "bg-gradient-to-br from-slate-50 to-slate-200 text-slate-700 shadow-slate-50",
                  "bg-gradient-to-br from-purple-50 to-purple-100 text-purple-700 shadow-purple-50",
                  "bg-gradient-to-br from-teal-50 to-teal-100 text-teal-800 shadow-teal-50",
                  "bg-gradient-to-br from-cyan-50 to-cyan-100 text-cyan-800 shadow-cyan-50",
                  "bg-gradient-to-br from-sky-50 to-sky-100 text-sky-800 shadow-sky-50",
                  "bg-gradient-to-br from-gray-50 to-gray-200 text-gray-700 shadow-gray-50"
                ];
                
                // Create a stable index from the string ID to ensure consistent colors on re-renders
                let hash = 0;
                for (let i = 0; i < dataset.id.length; i++) {
                  hash = dataset.id.charCodeAt(i) + ((hash << 5) - hash);
                }
                const stableIndex = Math.abs(hash) % GRADIENTS.length;

                const gradientClass = isBase 
                  ? "bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-700 shadow-emerald-50"
                  : GRADIENTS[stableIndex];

                const displayName = capitalizeSeriesName(
                  isBase ? `${dataset.name} Base` : dataset.name,
                );

                return (
                  <Link
                    key={dataset.id}
                    href={`/datasets/${dataset.id}`}
                    className={`block aspect-square rounded-2xl p-2 sm:p-3 hover:opacity-90 hover:scale-[1.05] transition-all flex flex-col justify-center items-center text-center shadow-md ${gradientClass}`}
                  >
                    <h3 className="font-bold text-xs sm:text-sm line-clamp-3 leading-tight">
                      {displayName}
                    </h3>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {series.description && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Description</h2>
            <p className="text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
              <MathText>{cleanMetricDescription(series.description)}</MathText>
            </p>
          </div>
        )}

        {series.homepage && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Homepage</h3>
            <a
              href={series.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-600 hover:underline break-all"
            >
              {series.homepage}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
