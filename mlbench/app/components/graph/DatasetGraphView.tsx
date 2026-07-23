"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DeckGL from "@deck.gl/react";
import {
  AmbientLight,
  COORDINATE_SYSTEM,
  DirectionalLight,
  LightingEffect,
  OrbitView,
  type OrbitViewState,
} from "@deck.gl/core";
import { LineLayer } from "@deck.gl/layers";
import { SimpleMeshLayer } from "@deck.gl/mesh-layers";
import { SphereGeometry } from "@luma.gl/engine";
import { getBackendBaseUrl } from "@/lib/backendUrl";
import {
  fetchDatasetGraph,
  type DatasetGraphData,
  type DatasetGraphNode,
} from "@/lib/graph/arrowClient";
import { getDomainColorRgb, getDomainLegendEntries } from "@/lib/graph/domainColors";
import { LoadingSpinner } from "../LoadingSpinner";

interface HoverInfo {
  node: DatasetGraphNode;
  x: number;
  y: number;
}

interface PositionedNode extends DatasetGraphNode {
  position: [number, number, number];
}

interface ExpandEdge {
  source: [number, number, number];
  target: [number, number, number];
}

/** World-space sphere radii (UMAP coords are typically O(10)). */
const SERIES_RADIUS = 0.45;
const CHILD_RADIUS = 0.2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const SPHERE_MESH = new SphereGeometry({
  radius: 1,
  nlat: 18,
  nlong: 18,
});

const LIGHTING_EFFECT = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 0.55 }),
  key: new DirectionalLight({
    color: [255, 255, 255],
    intensity: 0.95,
    direction: [-1, -2.5, -1.5],
  }),
  fill: new DirectionalLight({
    color: [200, 220, 255],
    intensity: 0.35,
    direction: [1.5, 0.5, 1],
  }),
});

const INITIAL_VIEW_STATE: OrbitViewState = {
  target: [0, 0, 0],
  zoom: 0,
  rotationX: 25,
  rotationOrbit: -35,
  minZoom: -4,
  maxZoom: 8,
};

/** Place children on a small sphere around the parent series node. */
function layoutChildrenAroundParent(
  parent: [number, number, number],
  children: DatasetGraphNode[],
): Map<string, [number, number, number]> {
  const n = children.length;
  const radius = 1.2 + Math.sqrt(n) * 0.32;
  const positions = new Map<string, [number, number, number]>();

  children.forEach((child, i) => {
    if (n === 1) {
      positions.set(child.nodeId, [parent[0] + radius, parent[1], parent[2]]);
      return;
    }
    const y = 1 - (i / (n - 1)) * 2;
    const rAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = GOLDEN_ANGLE * i;
    positions.set(child.nodeId, [
      parent[0] + radius * rAtY * Math.cos(theta),
      parent[1] + radius * y,
      parent[2] + radius * rAtY * Math.sin(theta),
    ]);
  });

  return positions;
}

function computeFitViewState(
  positions: Iterable<[number, number, number]>,
  containerSize: number,
): Pick<OrbitViewState, "target" | "zoom"> {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let count = 0;
  for (const [x, y, z] of positions) {
    count += 1;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  if (count === 0) return { target: [0, 0, 0], zoom: 0 };
  const maxExtent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  const zoom = Math.log2((containerSize / maxExtent) * 0.7);
  return {
    target: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    zoom,
  };
}

export default function DatasetGraphView() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [graph, setGraph] = useState<DatasetGraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [viewState, setViewState] = useState<OrbitViewState>(INITIAL_VIEW_STATE);
  const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const url = `${getBackendBaseUrl()}/graph/datasets`;
        const data = await fetchDatasetGraph(url, controller.signal);
        setGraph(data);

        const seriesPositions = data.nodes
          .filter((n) => n.type === "series")
          .map((n): [number, number, number] => [n.x, n.y, n.z]);
        const rect = containerRef.current?.getBoundingClientRect();
        const containerSize = Math.min(rect?.width || 480, rect?.height || 480);
        const fit = computeFitViewState(seriesPositions, containerSize);
        setViewState((vs) => ({ ...vs, ...fit }));
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message || "Failed to load the dataset graph.");
        }
      }
    })();

    return () => controller.abort();
  }, []);

  const seriesNodes = useMemo(
    () => (graph ? graph.nodes.filter((n) => n.type === "series") : []),
    [graph],
  );

  const seriesPositions = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    for (const node of seriesNodes) {
      map.set(node.nodeId, [node.x, node.y, node.z]);
    }
    return map;
  }, [seriesNodes]);

  const childrenBySeries = useMemo(() => {
    const map = new Map<string, DatasetGraphNode[]>();
    if (!graph) return map;
    const nodeById = new Map(graph.nodes.map((n) => [n.nodeId, n]));
    for (const edge of graph.edges) {
      if (edge.edgeType !== "series_dataset") continue;
      const parent = nodeById.get(edge.sourceId);
      const child = nodeById.get(edge.targetId);
      if (!parent || parent.type !== "series" || !child || child.type !== "dataset") continue;
      const list = map.get(parent.nodeId);
      if (list) list.push(child);
      else map.set(parent.nodeId, [child]);
    }
    return map;
  }, [graph]);

  const positionedSeries: PositionedNode[] = useMemo(
    () =>
      seriesNodes.map((node) => ({
        ...node,
        position: seriesPositions.get(node.nodeId) ?? [node.x, node.y, node.z],
      })),
    [seriesNodes, seriesPositions],
  );

  const { childNodes, expandEdges } = useMemo(() => {
    const children: PositionedNode[] = [];
    const edges: ExpandEdge[] = [];
    if (!expandedSeriesId) return { childNodes: children, expandEdges: edges };

    const parentPos = seriesPositions.get(expandedSeriesId);
    const kids = childrenBySeries.get(expandedSeriesId) ?? [];
    if (!parentPos || kids.length === 0) return { childNodes: children, expandEdges: edges };

    const childPositions = layoutChildrenAroundParent(parentPos, kids);
    for (const child of kids) {
      const position = childPositions.get(child.nodeId) ?? parentPos;
      children.push({ ...child, position });
      edges.push({ source: parentPos, target: position });
    }
    return { childNodes: children, expandEdges: edges };
  }, [expandedSeriesId, seriesPositions, childrenBySeries]);

  const layers = useMemo(() => {
    if (!graph) return [];

    const layersOut = [];

    if (expandEdges.length > 0) {
      layersOut.push(
        new LineLayer<ExpandEdge>({
          id: "dataset-expand-edges",
          data: expandEdges,
          coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
          getSourcePosition: (d) => d.source,
          getTargetPosition: (d) => d.target,
          getColor: [148, 163, 184, 170],
          getWidth: 1.5,
          widthUnits: "pixels",
          pickable: false,
        }),
      );
    }

    layersOut.push(
      new SimpleMeshLayer<PositionedNode>({
        id: "dataset-series-spheres",
        data: positionedSeries,
        mesh: SPHERE_MESH,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: (d) => d.position,
        getColor: (d) =>
          getDomainColorRgb(d.domain, d.nodeId === expandedSeriesId ? 255 : 220),
        getScale: [SERIES_RADIUS, SERIES_RADIUS, SERIES_RADIUS],
        material: {
          ambient: 0.4,
          diffuse: 0.7,
          shininess: 32,
          specularColor: [255, 255, 255],
        },
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 200],
        updateTriggers: {
          getColor: expandedSeriesId,
        },
        onHover: (info) => {
          if (info.object) {
            setHover({ node: info.object, x: info.x, y: info.y });
          } else {
            setHover(null);
          }
        },
        onClick: (info) => {
          if (!info.object) return;
          const node = info.object as PositionedNode;
          setExpandedSeriesId((prev) => (prev === node.nodeId ? null : node.nodeId));
        },
      }),
    );

    if (childNodes.length > 0) {
      layersOut.push(
        new SimpleMeshLayer<PositionedNode>({
          id: "dataset-child-spheres",
          data: childNodes,
          mesh: SPHERE_MESH,
          coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
          getPosition: (d) => d.position,
          getColor: (d) => getDomainColorRgb(d.domain, 235),
          getScale: [CHILD_RADIUS, CHILD_RADIUS, CHILD_RADIUS],
          material: {
            ambient: 0.35,
            diffuse: 0.75,
            shininess: 24,
            specularColor: [255, 255, 255],
          },
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 200],
          onHover: (info) => {
            if (info.object) {
              setHover({ node: info.object, x: info.x, y: info.y });
            } else {
              setHover(null);
            }
          },
          onClick: (info) => {
            if (!info.object) return;
            const node = info.object as PositionedNode;
            router.push(`/datasets/${node.id}`);
          },
        }),
      );
    }

    return layersOut;
  }, [graph, positionedSeries, childNodes, expandEdges, expandedSeriesId, router]);

  const legend = useMemo(() => getDomainLegendEntries(), []);
  const seriesCount = seriesNodes.length;
  const expandedChildCount = childNodes.length;

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
      {!graph && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
          <LoadingSpinner size="lg" />
          <p className="text-gray-300 text-sm">Loading dataset graph…</p>
        </div>
      )}

      {graph && (
        <DeckGL
          views={new OrbitView()}
          viewState={viewState}
          onViewStateChange={({ viewState: vs }) => setViewState(vs as OrbitViewState)}
          controller={true}
          effects={[LIGHTING_EFFECT]}
          layers={layers}
        />
      )}

      {graph && (
        <>
          <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-gray-200 pointer-events-none">
            {seriesCount.toLocaleString()} series
            {expandedSeriesId
              ? ` · ${expandedChildCount.toLocaleString()} datasets expanded`
              : " · click a series to expand"}
            {" · drag to orbit"}
          </div>

          <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 flex flex-wrap gap-x-3 gap-y-1 pointer-events-none max-w-[90%]">
            {legend.map((entry) => (
              <span key={entry.domain} className="flex items-center gap-1.5 text-[11px] text-gray-200">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                {entry.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-[11px] text-gray-400 ml-1">
              large = series · small = dataset
            </span>
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
            {hover.node.type === "series" ? "dataset series" : "dataset"}
            {hover.node.year ? ` · ${hover.node.year}` : ""}
            {hover.node.type === "series" && expandedSeriesId !== hover.node.nodeId
              ? " · click to expand"
              : ""}
            {hover.node.type === "series" && expandedSeriesId === hover.node.nodeId
              ? " · click to collapse"
              : ""}
            {hover.node.type === "dataset" ? " · click to open" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
