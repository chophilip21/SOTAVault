"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DeckGL from "@deck.gl/react";
import { COORDINATE_SYSTEM, OrthographicView, type OrthographicViewState } from "@deck.gl/core";
import { LineLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { getBackendBaseUrl } from "@/lib/backendUrl";
import {
  fetchDatasetGraph,
  type DatasetGraphData,
  type DatasetGraphEdgeSegment,
  type DatasetGraphNode,
} from "@/lib/graph/arrowClient";
import { getDomainColorRgb, getDomainLegendEntries } from "@/lib/graph/domainColors";
import { LoadingSpinner } from "../LoadingSpinner";

interface HoverInfo {
  node: DatasetGraphNode;
  x: number;
  y: number;
}

const NODE_RADIUS_PX: Record<DatasetGraphNode["type"], number> = {
  domain: 9,
  series: 5,
  dataset: 2.5,
};

const NODE_ROUTE: Record<DatasetGraphNode["type"], (id: string) => string | null> = {
  domain: () => null,
  series: (id) => `/dataset-series/${id}`,
  dataset: (id) => `/datasets/${id}`,
};

// With 3000+ nodes, series labels overlap heavily at the zoomed-out overview.
// Only reveal them once the user has zoomed in this many levels past the fit view.
const SERIES_LABEL_ZOOM_DELTA = 2.5;

function getNumericZoom(zoom: OrthographicViewState["zoom"]): number {
  return Array.isArray(zoom) ? zoom[0] : zoom ?? 0;
}

function computeFitViewState(
  nodes: DatasetGraphNode[],
  containerWidth: number,
  containerHeight: number,
): OrthographicViewState {
  if (nodes.length === 0) {
    return { target: [0, 0, 0], zoom: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const padding = 0.9; // leave a small margin around the tree
  const zoomX = Math.log2((containerWidth / width) * padding);
  const zoomY = Math.log2((containerHeight / height) * padding);
  const zoom = Math.min(zoomX, zoomY);
  const target: [number, number, number] = [(minX + maxX) / 2, (minY + maxY) / 2, 0];
  return { target, zoom };
}


export default function DatasetGraphView() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [graph, setGraph] = useState<DatasetGraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [viewState, setViewState] = useState<OrthographicViewState>({ target: [0, 0, 0], zoom: 0 });
  const [fitZoom, setFitZoom] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const url = `${getBackendBaseUrl()}/graph/datasets`;
        const data = await fetchDatasetGraph(url, controller.signal);
        setGraph(data);

        const rect = containerRef.current?.getBoundingClientRect();
        const fit = computeFitViewState(data.nodes, rect?.width || 800, rect?.height || 480);
        setFitZoom(getNumericZoom(fit.zoom));
        setViewState(fit);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message || "Failed to load the dataset graph.");
        }
      }
    })();

    return () => controller.abort();
  }, []);

  const currentZoom = getNumericZoom(viewState.zoom);
  const showSeriesLabels = currentZoom > fitZoom + SERIES_LABEL_ZOOM_DELTA;

  const layers = useMemo(() => {
    if (!graph) return [];

    const labelNodes = graph.nodes.filter(
      (n) => n.type === "domain" || (n.type === "series" && showSeriesLabels),
    );

    return [
      new LineLayer<DatasetGraphEdgeSegment>({
        id: "dataset-graph-edges",
        data: graph.edges,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getColor: [148, 163, 184, 120],
        getWidth: 1,
        widthUnits: "pixels",
        pickable: false,
      }),
      new ScatterplotLayer<DatasetGraphNode>({
        id: "dataset-graph-nodes",
        data: graph.nodes,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: (d) => [d.x, d.y],
        getRadius: (d) => NODE_RADIUS_PX[d.type],
        radiusUnits: "pixels",
        getFillColor: (d) => getDomainColorRgb(d.domain, d.type === "dataset" ? 170 : 255),
        getLineColor: [255, 255, 255, 200],
        lineWidthUnits: "pixels",
        getLineWidth: (d) => (d.type === "dataset" ? 0 : 1),
        stroked: true,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 220],
        onHover: (info) => {
          if (info.object) {
            setHover({ node: info.object, x: info.x, y: info.y });
          } else {
            setHover(null);
          }
        },
        onClick: (info) => {
          if (!info.object) return;
          const node = info.object as DatasetGraphNode;
          const href = NODE_ROUTE[node.type](node.id);
          if (href) router.push(href);
        },
      }),
      new TextLayer<DatasetGraphNode>({
        id: "dataset-graph-labels",
        data: labelNodes,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: (d) => [d.x, d.y],
        getText: (d) => d.label,
        getSize: (d) => (d.type === "domain" ? 13 : 10),
        getColor: [31, 41, 55, 230],
        getPixelOffset: (d) => [d.type === "domain" ? -10 : 8, 0],
        getTextAnchor: (d) => (d.type === "domain" ? "end" : "start"),
        getAlignmentBaseline: "center",
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 600,
        background: true,
        getBackgroundColor: [255, 255, 255, 200],
        backgroundPadding: [3, 1],
        pickable: false,
      }),
    ];
  }, [graph, router, showSeriesLabels]);

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
    <div ref={containerRef} className="relative h-[480px] w-full rounded-lg overflow-hidden bg-gray-50">
      {!graph && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
          <LoadingSpinner size="lg" />
          <p className="text-gray-500 text-sm">Loading dataset tree…</p>
        </div>
      )}

      {graph && (
        <DeckGL
          views={new OrthographicView()}
          viewState={viewState}
          onViewStateChange={({ viewState: vs }) => setViewState(vs as OrthographicViewState)}
          controller={true}
          layers={layers}
        />
      )}

      {graph && (
        <>
          <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-gray-600 shadow-sm pointer-events-none">
            {graph.nodes.length.toLocaleString()} nodes · drag to pan, scroll to zoom in for series labels
          </div>

          <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 flex flex-wrap gap-x-3 gap-y-1 shadow-sm pointer-events-none max-w-[90%]">
            {legend.map((entry) => (
              <span key={entry.domain} className="flex items-center gap-1.5 text-[11px] text-gray-600">
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
          <p className="font-semibold line-clamp-2 mb-1">{hover.node.label}</p>
          <p className="text-gray-400 capitalize">
            {hover.node.type}
            {hover.node.year ? ` · ${hover.node.year}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
