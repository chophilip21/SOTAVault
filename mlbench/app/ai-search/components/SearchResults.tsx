"use client";

import Link from "next/link";
import { MathText } from "@/lib/mathText";
import { cleanPaperTitle } from "@/lib/paperTitle";
import { sortHitsByDistance } from "@/lib/aiSearch/sortHits";
import type { VectorSearchHit } from "@/lib/aiSearch/types";

export function SearchResults(props: { hits: VectorSearchHit[] }) {
  const ranked = sortHitsByDistance(props.hits);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {ranked.map((h, idx) => {
        const title = cleanPaperTitle(h.paper.title) || "Untitled paper";
        const rank = idx + 1;
        return (
          <Link
            key={h.paper.id}
            href={`/papers/${h.paper.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-2xl border border-white/70 bg-gradient-to-br from-white/70 to-white/50 hover:from-white/90 hover:to-white/70 transition shadow-sm px-3.5 py-3"
            title={
              typeof h.distance === "number"
                ? `${title} (distance: ${h.distance.toFixed(4)})`
                : title
            }
          >
            <div className="flex items-start gap-2">
              <div
                className="mt-0.5 w-8 h-8 rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-500 text-white flex items-center justify-center shadow-sm shrink-0 ring-2 ring-white/70"
                aria-label={`Rank ${rank}`}
              >
                <span className="text-sm font-extrabold tabular-nums">{rank}</span>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 line-clamp-2 group-hover:text-green-700">
                  <MathText>{title}</MathText>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-gray-600">
                  {h.paper.year ? (
                    <span className="tabular-nums">{h.paper.year}</span>
                  ) : (
                    <span className="text-gray-500">Paper</span>
                  )}
                  <span className="text-gray-300">•</span>
                  <span className="text-gray-500">Open</span>
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
