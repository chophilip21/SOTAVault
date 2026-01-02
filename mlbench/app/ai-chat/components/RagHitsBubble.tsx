"use client";

import type { VectorSearchHit } from "../types";
import { rankByDistance, sortHitsByDistance } from "../ragHelpers";

export function RagHitsBubble(props: { title: string; hits: VectorSearchHit[] }) {
  const ranked = sortHitsByDistance(props.hits);
  const rankById = rankByDistance(ranked);

  return (
    <div className="space-y-3">
      <div className="font-semibold text-gray-950">{props.title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ranked.map((h) => {
          const p = h.paper;
          const href = `/papers/${p.id}`;
          const rank = rankById.get(p.id) ?? 0;
          return (
            <a
              key={p.id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative rounded-2xl border border-white/70 bg-gradient-to-br from-white/70 to-white/50 hover:from-white/90 hover:to-white/70 transition shadow-sm px-3.5 py-3"
              title={`${p.title}${typeof h.distance === "number" ? ` (distance: ${h.distance.toFixed(4)})` : ""}`}
            >
              <div className="flex items-start gap-2">
                <div
                  className="mt-0.5 w-8 h-8 rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-500 text-white flex items-center justify-center shadow-sm shrink-0 ring-2 ring-white/70"
                  aria-label={`Distance rank ${rank}`}
                  title={`Distance rank ${rank}${typeof h.distance === "number" ? ` (distance: ${h.distance.toFixed(4)})` : ""}`}
                >
                  <span className="text-sm font-extrabold tabular-nums">{rank || "–"}</span>
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-gray-900 line-clamp-2 group-hover:text-gray-950">{p.title}</div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-600">
                    {p.year ? <span className="tabular-nums">{p.year}</span> : <span className="text-gray-500">Paper</span>}
                    <span className="text-gray-300">•</span>
                    <span className="text-gray-500 group-hover:text-gray-600">Open in new tab</span>
                  </div>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}


