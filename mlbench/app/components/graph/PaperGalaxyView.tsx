"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DeckGL from "@deck.gl/react";
import { COORDINATE_SYSTEM, OrbitView, type OrbitViewState } from "@deck.gl/core";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { getBackendBaseUrl } from "@/lib/backendUrl";
import {
  fetchPaperGalaxy,
  type PaperClusterNode,
  type PaperGalaxyData,
  type PaperGalaxyPoint,
} from "@/lib/graph/arrowClient";
import { getClusterColorRgb } from "@/lib/graph/domainColors";
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
  // >1 zooms in past a full-frame fit so the cloud feels closer on load.
  const padding = 1.2;
  const zoom = Math.log2((containerSize / maxExtent) * padding);
  const target: [number, number, number] = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  return { target, zoom };
}

export default function PaperGalaxyView() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<PaperGalaxyData | null>(null);
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
        const result = await fetchPaperGalaxy(url, controller.signal);
        setData(result);

        if (result.points.length > 0) {
          const rect = containerRef.current?.getBoundingClientRect();
          const containerSize = Math.min(rect?.width || 480, rect?.height || 480);
          const fit = computeFitViewState(result.points, containerSize);
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

  const clusterLabelById = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of data?.clusters ?? []) map.set(c.clusterId, c.label);
    return map;
  }, [data]);

  const layers = useMemo(() => {
    if (!data) return [];
    return [
      new ScatterplotLayer<PaperGalaxyPoint>({
        id: "paper-galaxy",
        data: data.points,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: (d) => [d.x, d.y, d.z],
        getRadius: 1,
        radiusUnits: "pixels",
        radiusMinPixels: 1.5,
        radiusMaxPixels: 6,
        getFillColor: (d) => getClusterColorRgb(d.clusterId, 200),
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
      new TextLayer<PaperClusterNode>({
        id: "paper-galaxy-cluster-labels",
        data: data.clusters,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: (d) => [d.x, d.y, d.z],
        getText: (d) => d.label,
        getSize: (d) => Math.min(22, 12 + Math.log2(d.size + 1) * 2),
        sizeUnits: "pixels",
        getColor: [30, 30, 40, 235],
        background: true,
        getBackgroundColor: [255, 255, 255, 190],
        backgroundPadding: [4, 2],
        fontFamily: "system-ui, sans-serif",
        fontWeight: 600,
        fontSettings: { sdf: true },
        outlineWidth: 0,
        pickable: false,
      }),
    ];
  }, [data, router]);

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
    <div ref={containerRef} className="relative h-[480px] w-full rounded-lg overflow-hidden bg-white">
      {!data && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
          <LoadingSpinner size="lg" />
          <p className="text-gray-500 text-sm">Loading semantic galaxy…</p>
        </div>
      )}

      {data && (
        <DeckGL
          views={new OrbitView()}
          viewState={viewState}
          onViewStateChange={({ viewState: vs }) => setViewState(vs as OrbitViewState)}
          controller={true}
          layers={layers}
        />
      )}

      {data && (
        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-gray-600 shadow-sm border border-gray-200 pointer-events-none">
          {data.points.length.toLocaleString()} papers · {data.clusters.length} topic clusters · drag to
          orbit, scroll to zoom
        </div>
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
            {[clusterLabelById.get(hover.point.clusterId), hover.point.venue, hover.point.year]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}
