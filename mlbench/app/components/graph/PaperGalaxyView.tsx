"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DeckGL from "@deck.gl/react";
import { COORDINATE_SYSTEM, OrbitView, type OrbitViewState } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import { getBackendBaseUrl } from "@/lib/backendUrl";
import { fetchPaperGalaxy, type PaperGalaxyPoint } from "@/lib/graph/arrowClient";
import { getDomainColorRgb, getDomainLegendEntries } from "@/lib/graph/domainColors";
import { LoadingSpinner } from "../LoadingSpinner";

interface HoverInfo {
  point: PaperGalaxyPoint;
  x: number;
  y: number;
}

const INITIAL_VIEW_STATE: OrbitViewState = {
  target: [0, 0, 0],
  zoom: 0,
  rotationX: 20,
  rotationOrbit: 30,
  minZoom: -3,
  maxZoom: 10,
};

/** Center + zoom the orbit camera so the whole point cloud is framed on load. */
function computeFitViewState(
  points: PaperGalaxyPoint[],
  containerSize: number,
): Pick<OrbitViewState, "target" | "zoom"> {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const maxExtent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  const padding = 0.75; // leave room since orbit rotation can reveal the full depth extent
  const zoom = Math.log2((containerSize / maxExtent) * padding);
  const target: [number, number, number] = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  return { target, zoom };
}

export default function PaperGalaxyView() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<PaperGalaxyPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [viewState, setViewState] = useState<OrbitViewState>(INITIAL_VIEW_STATE);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const url = `${getBackendBaseUrl()}/graph/papers`;
        const data = await fetchPaperGalaxy(url, controller.signal);
        setPoints(data);

        if (data.length > 0) {
          const rect = containerRef.current?.getBoundingClientRect();
          const containerSize = Math.min(rect?.width || 480, rect?.height || 480);
          const fit = computeFitViewState(data, containerSize);
          setViewState((vs) => ({ ...vs, ...fit }));
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message || "Failed to load the paper galaxy.");
        }
      }
    })();

    return () => controller.abort();
  }, []);

  const layers = useMemo(() => {
    if (!points) return [];
    return [
      new ScatterplotLayer<PaperGalaxyPoint>({
        id: "paper-galaxy",
        data: points,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: (d) => [d.x, d.y, d.z],
        getRadius: 1,
        radiusUnits: "pixels",
        radiusMinPixels: 1.5,
        radiusMaxPixels: 6,
        getFillColor: (d) => getDomainColorRgb(d.domain, 200),
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 220],
        onHover: (info) => {
          if (info.object) {
            setHover({ point: info.object, x: info.x, y: info.y });
          } else {
            setHover(null);
          }
        },
        onClick: (info) => {
          if (info.object) {
            router.push(`/papers/${info.object.id}`);
          }
        },
      }),
    ];
  }, [points, router]);

  const legend = useMemo(() => getDomainLegendEntries(), []);

  if (error) {
    return (
      <div className="h-[480px] flex items-center justify-center text-sm text-gray-500 text-center px-6">
        {error}
        <br />
        Run the graph generation job on the server stack, then reload.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-[480px] w-full rounded-lg overflow-hidden bg-[#05060a]">
      {!points && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
          <LoadingSpinner size="lg" />
          <p className="text-gray-300 text-sm">Loading semantic galaxy…</p>
        </div>
      )}

      {points && (
        <DeckGL
          views={new OrbitView()}
          viewState={viewState}
          onViewStateChange={({ viewState: vs }) => setViewState(vs as OrbitViewState)}
          controller={true}
          layers={layers}
        />
      )}

      {points && (
        <>
          <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-gray-200 pointer-events-none">
            {points.length.toLocaleString()} papers · drag to orbit, scroll to zoom
          </div>

          <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 flex flex-wrap gap-x-3 gap-y-1 pointer-events-none max-w-[90%]">
            {legend.map((entry) => (
              <span key={entry.domain} className="flex items-center gap-1.5 text-[11px] text-gray-200">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                {entry.label}
              </span>
            ))}
          </div>
        </>
      )}

      {hover && (
        <div
          className="absolute z-20 pointer-events-none bg-white text-gray-900 rounded-lg shadow-lg border border-gray-200 px-3 py-2 max-w-xs text-xs"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <p className="font-semibold line-clamp-2 mb-1">{hover.point.title}</p>
          {hover.point.authors.length > 0 && (
            <p className="text-gray-500 line-clamp-1 mb-1">
              {hover.point.authors.slice(0, 3).join(", ")}
              {hover.point.authors.length > 3 && " et al."}
            </p>
          )}
          <p className="text-gray-400">
            {[hover.point.venue, hover.point.year].filter(Boolean).join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}
