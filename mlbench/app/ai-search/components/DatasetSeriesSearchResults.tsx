"use client";

import Link from "next/link";
import { MathText } from "@/lib/mathText";
import { sortDatasetHitsByDistance } from "@/lib/aiSearch/sortDatasetHits";
import type { DatasetSeriesVectorSearchHit } from "@/lib/aiSearch/types";
import { cleanMetricDescription } from "@/lib/metricDescription";

export function DatasetSeriesSearchResults(props: {
  hits: DatasetSeriesVectorSearchHit[];
}) {
  const ranked = sortDatasetHitsByDistance(props.hits);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {ranked.map((h, idx) => {
        const name = h.series.name?.trim() || "Untitled series";
        const rank = idx + 1;
        const description = cleanMetricDescription(h.series.description || "").trim();
        return (
          <Link
            key={h.series.id}
            href={`/dataset-series/${h.series.id}`}
            className="group rounded-2xl border border-white/70 bg-gradient-to-br from-white/70 to-white/50 hover:from-white/90 hover:to-white/70 transition shadow-sm px-3.5 py-3"
            title={
              typeof h.distance === "number"
                ? `${name} (distance: ${h.distance.toFixed(4)})`
                : name
            }
          >
            <div className="flex items-start gap-2">
              <div
                className="mt-0.5 w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center shadow-sm shrink-0 ring-2 ring-white/70"
                aria-label={`Rank ${rank}`}
              >
                <span className="text-sm font-extrabold tabular-nums">{rank}</span>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 line-clamp-2 group-hover:text-violet-700">
                  <MathText>{name}</MathText>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  {h.series.domain ? (
                    <span className="uppercase tracking-wide text-violet-700/80">
                      {h.series.domain}
                    </span>
                  ) : (
                    <span className="text-gray-500">Dataset series</span>
                  )}
                  <span className="text-gray-300">•</span>
                  <span className="text-gray-500">Open</span>
                </div>
                {description ? (
                  <p className="mt-1.5 text-xs text-gray-600 line-clamp-2">{description}</p>
                ) : null}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
