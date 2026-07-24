"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DeckGL from "@deck.gl/react";
import { COORDINATE_SYSTEM, OrthographicView, LinearInterpolator, type OrthographicViewState } from "@deck.gl/core";
import { LineLayer, ScatterplotLayer, SolidPolygonLayer, IconLayer, TextLayer } from "@deck.gl/layers";
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
  position: [number, number];
  radius: number;
}

interface LabeledSeries extends PositionedNode {
  labelText: string;
  labelSize: number;
}

interface ExpandEdge {
  source: [number, number];
  target: [number, number];
  color: [number, number, number, number];
}

interface ChildPolygon {
  node: PositionedNode;
  polygon: [number, number, number][];
  color: [number, number, number, number];
}

interface PaperMarker {
  node: PositionedNode;
  color: [number, number, number, number];
}

const SERIES_RADIUS_MIN = 1.0;
const SERIES_RADIUS_MAX = 3.2;
/** Half-side of dataset squares (world units), scaled by paper count. */
const DATASET_HALF_MIN = 0.35;
const DATASET_HALF_MAX = 1.1;
/** Paper triangles stay visually smaller than datasets, but readable when zoomed in. */
const PAPER_HALF_MIN = 0.28;
const PAPER_HALF_MAX = 0.55;
/** Extra gap beyond touching so shapes never occlude. */
const COLLISION_GAP = 0.12;
/** Soft pack: median NN before collision resolve (keeps similar nodes near). */
const SOFT_PACK_NN = SERIES_RADIUS_MIN * 1.8;
/** Largest (center) series size on the default overview — not a full-cloud fit. */
const OVERVIEW_CENTER_DIAMETER_PX = 100;
const BACKGROUND_DIM_ALPHA = 55;
/** How far children sit beyond the parent edge (base + size-scaled). */
const CHILD_RING_BASE = 2.4;
const CHILD_RING_PER_SIZE = 6.5;
/** Papers: vary edge length by size so neighbors don’t stack on one ring. */
const PAPER_RING_BASE = 0.55;
const PAPER_RING_PER_SIZE = 2.8;
/** Series expand: fit parent + dataset ring across this many pixels. */
const SERIES_FOCUS_DIAMETER_PX = 340;
/**
 * Dataset expand: frame dataset + paper ring only (not the parent series).
 * Including distance-to-parent made zoom ≈ series-fan zoom, so clicks felt
 * like a no-op. Parent may sit near/off the edge; papers stay readable.
 */
const DATASET_FOCUS_DIAMETER_PX = 360;
/** Camera ease when changing focus. */
const FOCUS_TRANSITION_MS = 320;
/** Must interpolate zoomX/zoomY too — otherwise OrthographicController ignores the transition. */
const FOCUS_TRANSITION = {
  transitionDuration: FOCUS_TRANSITION_MS,
  transitionInterpolator: new LinearInterpolator([
    "target",
    "zoom",
    "zoomX",
    "zoomY",
  ]),
};
const PAPER_ICON_SIZE = 64;
const PAPER_ICON_MAPPING = {
  triangle: {
    x: 0,
    y: 0,
    width: PAPER_ICON_SIZE,
    height: PAPER_ICON_SIZE,
    mask: true,
  },
};

/** Build a white triangle atlas in-memory (CSP-safe; no data:/http fetch). */
function createPaperTriangleAtlas(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = PAPER_ICON_SIZE;
  canvas.height = PAPER_ICON_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, PAPER_ICON_SIZE, PAPER_ICON_SIZE);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(32, 6);
  ctx.lineTo(58, 56);
  ctx.lineTo(6, 56);
  ctx.closePath();
  ctx.fill();
  return canvas;
}

const INITIAL_VIEW_STATE: OrthographicViewState = {
  target: [0, 0, 0],
  zoom: 0,
  minZoom: -2,
  maxZoom: 12,
};

function seriesRadiusForPaperCount(paperCount: number, maxPaperCount: number): number {
  if (maxPaperCount <= 0) return SERIES_RADIUS_MIN;
  const t = Math.sqrt(Math.max(0, paperCount) / maxPaperCount);
  return SERIES_RADIUS_MIN + (SERIES_RADIUS_MAX - SERIES_RADIUS_MIN) * t;
}

function scaleHalf(
  weight: number,
  maxWeight: number,
  minHalf: number,
  maxHalf: number,
): number {
  if (maxWeight <= 0) return minHalf;
  const t = Math.sqrt(Math.max(0, weight) / maxWeight);
  return minHalf + (maxHalf - minHalf) * t;
}

function squarePolygon(cx: number, cy: number, half: number): [number, number, number][] {
  return [
    [cx - half, cy - half, 0],
    [cx + half, cy - half, 0],
    [cx + half, cy + half, 0],
    [cx - half, cy + half, 0],
  ];
}

/** Short series titles; maxChars is computed from bubble size when fitting. */
function truncateSeriesLabel(label: string, maxChars: number): string {
  const text = label.trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

/** Prefer a space near the middle; otherwise split mid-string. */
function splitLabelTwoLines(label: string): [string, string] | null {
  const text = label.trim();
  if (text.length < 8) return null;

  const mid = text.length / 2;
  let best = -1;
  let bestDist = Infinity;
  for (let i = 1; i < text.length - 1; i++) {
    if (text[i] !== " ") continue;
    const dist = Math.abs(i - mid);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  if (best > 0) {
    return [text.slice(0, best).trim(), text.slice(best + 1).trim()];
  }

  // No spaces (e.g. CamelCase) — break near the middle.
  const cut = Math.round(mid);
  return [text.slice(0, cut), text.slice(cut)];
}

/**
 * Fit a label inside a circle. Long titles wrap to two lines so font size
 * can stay larger; still truncate if needed to stay within the bubble.
 */
function seriesLabelForBubble(
  label: string,
  radius: number,
): { text: string; size: number } {
  const full = label.trim() || "?";
  const usableW = radius * 1.5; // ~0.75 × diameter
  const charAspect = 0.55;
  const lineGap = 1.15; // line height relative to font size
  const minSize = radius * 0.3;

  const sizeFor = (lines: string[], maxByHeight: number) => {
    const maxLen = Math.max(...lines.map((l) => l.length), 1);
    const byWidth = usableW / (maxLen * charAspect);
    const byHeight = maxByHeight / (lines.length * lineGap);
    return Math.min(byWidth, byHeight);
  };

  // Short labels: single line.
  if (full.length <= 10 && !full.includes(" ")) {
    const size = sizeFor([full], radius * 0.95);
    return { text: full, size: Math.max(radius * 0.22, size) };
  }

  const wrapped = splitLabelTwoLines(full);
  if (wrapped) {
    let [a, b] = wrapped;
    let size = sizeFor([a, b], radius * 0.95);
    if (size < minSize) {
      // Truncate the longer line until it fits at minSize.
      const maxChars = Math.max(3, Math.floor(usableW / (minSize * charAspect)));
      if (a.length > maxChars) a = truncateSeriesLabel(a, maxChars);
      if (b.length > maxChars) b = truncateSeriesLabel(b, maxChars);
      size = sizeFor([a, b], radius * 0.95);
    }
    return { text: `${a}\n${b}`, size: Math.max(radius * 0.22, size) };
  }

  // Fallback: single line with truncate.
  let text = full;
  let size = sizeFor([text], radius * 0.85);
  if (size < minSize) {
    const maxChars = Math.max(3, Math.floor(usableW / (minSize * charAspect)));
    text = truncateSeriesLabel(full, maxChars);
    size = sizeFor([text], radius * 0.85);
  }
  return { text, size: Math.max(radius * 0.22, size) };
}

/** OrthographicView: world units × 2^zoom ≈ screen pixels. */
function zoomForWorldDiameter(worldRadius: number, targetDiameterPx: number): number {
  const worldDiameter = 2 * Math.max(worldRadius, 1e-6);
  return Math.log2(targetDiameterPx / worldDiameter);
}

/**
 * Build a viewState update targeting `target`/`zoom`.
 *
 * OrthographicController tracks per-axis zoom (`zoomX`/`zoomY`) alongside the
 * uniform `zoom`. Once the controller has echoed a viewState back to us
 * (after the first render), those fields are present and get carried along
 * by any `...prev` spread. If we only overwrite `zoom` without also syncing
 * `zoomX`/`zoomY`, the controller's own normalization sees the *axis* zoom as
 * unchanged, decides the transition is a no-op, and echoes the stale
 * viewState straight back through `onViewStateChange` — silently discarding
 * the update. Always keep all three in lockstep.
 */
function focusViewState(
  prev: OrthographicViewState,
  target: [number, number, number],
  zoom: number,
): OrthographicViewState {
  return { ...prev, target, zoom, zoomX: zoom, zoomY: zoom };
}

/**
 * Soft rescale so typical neighbors sit near each other (UMAP relative layout kept).
 */
function rescalePositionsForSeparation(
  raw: Map<string, [number, number]>,
  targetNnSeparation: number,
): Map<string, [number, number]> {
  const entries = Array.from(raw.entries());
  if (entries.length < 2) return raw;

  const pts = entries.map(([, p]) => p);
  const sampleStep = Math.max(1, Math.floor(pts.length / 400));
  const nnDists: number[] = [];
  for (let i = 0; i < pts.length; i += sampleStep) {
    const a = pts[i];
    let best = Infinity;
    for (let j = 0; j < pts.length; j++) {
      if (j === i) continue;
      const b = pts[j];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d > 1e-9 && d < best) best = d;
    }
    if (Number.isFinite(best)) nnDists.push(best);
  }
  if (nnDists.length === 0) return raw;
  nnDists.sort((a, b) => a - b);
  const medianNn = nnDists[Math.floor(nnDists.length / 2)] || 1;
  const scale = targetNnSeparation / medianNn;

  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p[0];
    cy += p[1];
  }
  cx /= pts.length;
  cy /= pts.length;

  const out = new Map<string, [number, number]>();
  for (const [id, p] of entries) {
    out.set(id, [cx + (p[0] - cx) * scale, cy + (p[1] - cy) * scale]);
  }
  return out;
}

/**
 * Iteratively push overlapping circles apart using each node's radius so
 * no two disks occlude (centers stay ≥ r_i + r_j + gap apart).
 */
function resolveCollisions(
  positions: Map<string, [number, number]>,
  radii: Map<string, number>,
  gap = COLLISION_GAP,
  iterations = 50,
): Map<string, [number, number]> {
  const ids = Array.from(positions.keys());
  const pos = new Map(positions);
  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const idA = ids[i];
        const idB = ids[j];
        const pa = pos.get(idA)!;
        const pb = pos.get(idB)!;
        const minDist = (radii.get(idA) ?? 0) + (radii.get(idB) ?? 0) + gap;
        let dx = pb[0] - pa[0];
        let dy = pb[1] - pa[1];
        let dist = Math.hypot(dx, dy);
        if (dist < 1e-9) {
          const angle = (i * 12.9898 + j * 78.233) % (Math.PI * 2);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          dist = 1;
        }
        if (dist >= minDist) continue;
        const push = (minDist - dist) / 2;
        const ux = dx / dist;
        const uy = dy / dist;
        pos.set(idA, [pa[0] - ux * push, pa[1] - uy * push]);
        pos.set(idB, [pb[0] + ux * push, pb[1] + uy * push]);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return pos;
}

/** Translate so ``centerId`` sits at the origin. */
function centerOnNode(
  positions: Map<string, [number, number]>,
  centerId: string | null,
): Map<string, [number, number]> {
  if (!centerId) return positions;
  const origin = positions.get(centerId);
  if (!origin) return positions;
  const [ox, oy] = origin;
  const out = new Map<string, [number, number]>();
  for (const [id, [x, y]] of positions) {
    out.set(id, [x - ox, y - oy]);
  }
  return out;
}

/**
 * Place children in a full circle around the parent (always 360°).
 * Angular wedges are proportional to child size; larger children also sit
 * farther out — minimizes overlap without clustering when n is small.
 */
function layoutChildrenAroundParent(
  parent: [number, number],
  parentRadius: number,
  children: DatasetGraphNode[],
  halves: Map<string, number>,
  ringBase = CHILD_RING_BASE,
  ringPerSize = CHILD_RING_PER_SIZE,
  maxRingRadius?: number,
): Map<string, [number, number]> {
  const n = children.length;
  const positions = new Map<string, [number, number]>();
  if (n === 0) return positions;

  const sizes = children.map((c) => {
    const half = halves.get(c.nodeId) ?? DATASET_HALF_MIN;
    return Number.isFinite(half) ? half : DATASET_HALF_MIN;
  });
  const weights = sizes.map((h) => Math.max(h, 1e-3));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const ringCap =
    maxRingRadius ?? Number.POSITIVE_INFINITY;

  // Evenly cover the full circle; start at top.
  let angle = -Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const sweep = (2 * Math.PI * weights[i]) / totalWeight;
    angle += sweep / 2;
    const half = sizes[i];
    const r = Math.min(
      ringCap,
      parentRadius +
        half * Math.SQRT2 +
        COLLISION_GAP * 2 +
        ringBase +
        half * ringPerSize,
    );
    positions.set(children[i].nodeId, [
      parent[0] + r * Math.cos(angle),
      parent[1] + r * Math.sin(angle),
    ]);
    angle += sweep / 2;
  }
  return positions;
}

/** Farthest reach from parent center needed to frame parent + children. */
function ringExtentRadius(
  parent: [number, number],
  parentRadius: number,
  children: Array<{ position: [number, number]; radius: number }>,
): number {
  let extent = parentRadius;
  for (const child of children) {
    const reach =
      Math.hypot(child.position[0] - parent[0], child.position[1] - parent[1]) +
      child.radius;
    if (reach > extent) extent = reach;
  }
  return extent;
}

export default function DatasetGraphView() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const overviewFitRef = useRef<{ target: [number, number, number]; zoom: number } | null>(null);
  const [graph, setGraph] = useState<DatasetGraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [viewState, setViewState] = useState<OrthographicViewState>(INITIAL_VIEW_STATE);
  const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null);
  const [expandedDatasetId, setExpandedDatasetId] = useState<string | null>(null);
  const paperIconAtlas = useMemo(() => createPaperTriangleAtlas(), []);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const url = `${getBackendBaseUrl()}/graph/datasets`;
        const data = await fetchDatasetGraph(url, controller.signal);
        setGraph(data);
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

  const datasetNodes = useMemo(
    () => (graph ? graph.nodes.filter((n) => n.type === "dataset") : []),
    [graph],
  );

  const paperNodes = useMemo(
    () => (graph ? graph.nodes.filter((n) => n.type === "paper") : []),
    [graph],
  );

  const maxSeriesPaperCount = useMemo(
    () => seriesNodes.reduce((m, n) => Math.max(m, n.paperCount || 0), 0),
    [seriesNodes],
  );

  const maxDatasetPaperCount = useMemo(
    () => datasetNodes.reduce((m, n) => Math.max(m, n.paperCount || 0), 0),
    [datasetNodes],
  );

  const maxPaperScore = useMemo(
    () => paperNodes.reduce((m, n) => Math.max(m, n.paperCount || 0), 0),
    [paperNodes],
  );

  const seriesRadii = useMemo(() => {
    const map = new Map<string, number>();
    for (const node of seriesNodes) {
      map.set(node.nodeId, seriesRadiusForPaperCount(node.paperCount, maxSeriesPaperCount));
    }
    return map;
  }, [seriesNodes, maxSeriesPaperCount]);

  const seriesPositions = useMemo(() => {
    const raw = new Map<string, [number, number]>();
    for (const node of seriesNodes) {
      raw.set(node.nodeId, [node.x, node.y]);
    }
    const softPacked = rescalePositionsForSeparation(raw, SOFT_PACK_NN);
    const separated = resolveCollisions(softPacked, seriesRadii);

    let centerId: string | null = null;
    let bestCount = -1;
    for (const node of seriesNodes) {
      const count = node.paperCount || 0;
      if (count > bestCount) {
        bestCount = count;
        centerId = node.nodeId;
      }
    }
    return centerOnNode(separated, centerId);
  }, [seriesNodes, seriesRadii]);

  useEffect(() => {
    if (seriesPositions.size === 0) return;
    const overview = {
      target: [0, 0, 0] as [number, number, number],
      zoom: zoomForWorldDiameter(SERIES_RADIUS_MAX, OVERVIEW_CENTER_DIAMETER_PX),
    };
    overviewFitRef.current = overview;
    if (!expandedSeriesId) {
      setViewState((vs) => focusViewState(vs, overview.target, overview.zoom));
    }
  }, [seriesPositions, expandedSeriesId]);

  const resetToOverview = useCallback(() => {
    setExpandedSeriesId(null);
    setExpandedDatasetId(null);
    setHover(null);
    if (overviewFitRef.current) {
      const { target, zoom } = overviewFitRef.current;
      setViewState((vs) => focusViewState(vs, target as [number, number, number], zoom));
    }
  }, []);

  const childrenBySeries = useMemo(() => {
    const map = new Map<string, DatasetGraphNode[]>();
    if (!graph) return map;
    const nodeById = new Map(graph.nodes.map((n) => [n.nodeId, n]));
    for (const edge of graph.edges) {
      if (String(edge.edgeType) !== "series_dataset") continue;
      const parent = nodeById.get(edge.sourceId);
      const child = nodeById.get(edge.targetId);
      if (!parent || parent.type !== "series" || !child || child.type !== "dataset") continue;
      const list = map.get(parent.nodeId);
      if (list) list.push(child);
      else map.set(parent.nodeId, [child]);
    }
    return map;
  }, [graph]);

  const papersByDataset = useMemo(() => {
    const map = new Map<string, DatasetGraphNode[]>();
    if (!graph) return map;
    const nodeById = new Map(graph.nodes.map((n) => [n.nodeId, n]));
    for (const edge of graph.edges) {
      if (String(edge.edgeType) !== "dataset_paper") continue;
      const parent = nodeById.get(String(edge.sourceId));
      const child = nodeById.get(String(edge.targetId));
      if (!parent || parent.type !== "dataset" || !child || child.type !== "paper") continue;
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
        position: seriesPositions.get(node.nodeId) ?? [node.x, node.y],
        radius: seriesRadii.get(node.nodeId) ?? SERIES_RADIUS_MIN,
      })),
    [seriesNodes, seriesPositions, seriesRadii],
  );

  const labeledSeries: LabeledSeries[] = useMemo(
    () =>
      positionedSeries.map((node) => {
        const fitted = seriesLabelForBubble(node.label, node.radius);
        return { ...node, labelText: fitted.text, labelSize: fitted.size };
      }),
    [positionedSeries],
  );

  const backgroundSeries = useMemo(
    () =>
      expandedSeriesId
        ? positionedSeries.filter((n) => n.nodeId !== expandedSeriesId)
        : positionedSeries,
    [positionedSeries, expandedSeriesId],
  );

  const expandedParent = useMemo(
    () =>
      expandedSeriesId
        ? positionedSeries.find((n) => n.nodeId === expandedSeriesId) ?? null
        : null,
    [positionedSeries, expandedSeriesId],
  );

  const { datasetSquares, datasetEdges, datasetPositions } = useMemo(() => {
    const squares: ChildPolygon[] = [];
    const edges: ExpandEdge[] = [];
    const positions = new Map<string, PositionedNode>();
    if (!expandedSeriesId || !expandedParent) {
      return { datasetSquares: squares, datasetEdges: edges, datasetPositions: positions };
    }

    const parentPos = expandedParent.position;
    const motherColor = getDomainColorRgb(expandedParent.domain, 255);
    const edgeColor: [number, number, number, number] = [
      motherColor[0],
      motherColor[1],
      motherColor[2],
      220,
    ];
    const kids = childrenBySeries.get(expandedSeriesId) ?? [];
    if (kids.length === 0) {
      return { datasetSquares: squares, datasetEdges: edges, datasetPositions: positions };
    }

    const halves = new Map<string, number>();
    for (const child of kids) {
      halves.set(
        child.nodeId,
        scaleHalf(child.paperCount || 0, maxDatasetPaperCount, DATASET_HALF_MIN, DATASET_HALF_MAX),
      );
    }

    const childPositions = layoutChildrenAroundParent(
      parentPos,
      expandedParent.radius,
      kids,
      halves,
    );
    for (const child of kids) {
      const position = childPositions.get(child.nodeId) ?? parentPos;
      const half = halves.get(child.nodeId) ?? DATASET_HALF_MIN;
      const positioned: PositionedNode = { ...child, position, radius: half };
      positions.set(child.nodeId, positioned);
      const dimmed =
        expandedDatasetId != null && expandedDatasetId !== child.nodeId;
      squares.push({
        node: positioned,
        polygon: squarePolygon(position[0], position[1], half),
        color: getDomainColorRgb(expandedParent.domain, dimmed ? 100 : 255),
      });
      edges.push({ source: parentPos, target: position, color: edgeColor });
    }
    return { datasetSquares: squares, datasetEdges: edges, datasetPositions: positions };
  }, [
    expandedSeriesId,
    expandedParent,
    childrenBySeries,
    maxDatasetPaperCount,
    expandedDatasetId,
  ]);

  const { paperMarkers, paperEdges } = useMemo(() => {
    const markers: PaperMarker[] = [];
    const edges: ExpandEdge[] = [];
    if (!expandedDatasetId) return { paperMarkers: markers, paperEdges: edges };

    const parent = datasetPositions.get(expandedDatasetId);
    if (!parent) return { paperMarkers: markers, paperEdges: edges };

    const motherColor = getDomainColorRgb(parent.domain, 255);
    const edgeColor: [number, number, number, number] = [
      motherColor[0],
      motherColor[1],
      motherColor[2],
      200,
    ];
    const kids = papersByDataset.get(expandedDatasetId) ?? [];
    if (kids.length === 0) return { paperMarkers: markers, paperEdges: edges };

    const halves = new Map<string, number>();
    for (const child of kids) {
      const half = scaleHalf(
        child.paperCount || 0,
        maxPaperScore,
        PAPER_HALF_MIN,
        PAPER_HALF_MAX,
      );
      halves.set(child.nodeId, Number.isFinite(half) ? half : PAPER_HALF_MIN);
    }

    const childPositions = layoutChildrenAroundParent(
      parent.position,
      parent.radius,
      kids,
      halves,
      PAPER_RING_BASE,
      PAPER_RING_PER_SIZE,
    );
    // Alternate edge lengths slightly so similar-sized papers don’t pile up.
    kids.forEach((child, i) => {
      const pos = childPositions.get(child.nodeId);
      if (!pos) return;
      const dx = pos[0] - parent.position[0];
      const dy = pos[1] - parent.position[1];
      const r = Math.hypot(dx, dy);
      if (r < 1e-9) return;
      const stagger = 1 + ((i % 3) - 1) * 0.22;
      childPositions.set(child.nodeId, [
        parent.position[0] + (dx / r) * r * stagger,
        parent.position[1] + (dy / r) * r * stagger,
      ]);
    });
    for (const child of kids) {
      const position = childPositions.get(child.nodeId) ?? parent.position;
      const half = halves.get(child.nodeId) ?? PAPER_HALF_MIN;
      if (!Number.isFinite(position[0]) || !Number.isFinite(position[1])) continue;
      const positioned: PositionedNode = { ...child, position, radius: half };
      markers.push({ node: positioned, color: motherColor });
      edges.push({ source: parent.position, target: position, color: edgeColor });
    }
    return { paperMarkers: markers, paperEdges: edges };
  }, [expandedDatasetId, datasetPositions, papersByDataset, maxPaperScore]);

  useEffect(() => {
    if (!expandedSeriesId) {
      setExpandedDatasetId(null);
      if (overviewFitRef.current) {
        const { target, zoom } = overviewFitRef.current;
        setViewState((vs) => ({
          ...focusViewState(vs, target as [number, number, number], zoom),
          ...FOCUS_TRANSITION,
        }));
      }
      return;
    }

    if (expandedDatasetId) {
      const ds = datasetPositions.get(expandedDatasetId);
      if (!ds) return;

      const paperChildren = paperMarkers.map((p) => ({
        position: p.node.position,
        radius: p.node.radius,
      }));
      // Frame the paper neighborhood only — do NOT pull back to the parent
      // series distance (that cancels the zoom-in vs the series-fan view).
      const paperExtent = ringExtentRadius(ds.position, ds.radius, paperChildren);
      const focusRadius = Math.max(paperExtent * 1.12, ds.radius * 3.2);
      const zoom = zoomForWorldDiameter(focusRadius, DATASET_FOCUS_DIAMETER_PX);

      setViewState((vs) => ({
        ...focusViewState(vs, [ds.position[0], ds.position[1], 0], zoom),
        ...FOCUS_TRANSITION,
      }));
      return;
    }

    const parentPos = seriesPositions.get(expandedSeriesId);
    const parentRadius = seriesRadii.get(expandedSeriesId) ?? SERIES_RADIUS_MIN;
    if (!parentPos) return;
    const datasetChildren = datasetSquares.map((d) => ({
      position: d.node.position,
      radius: d.node.radius,
    }));
    const extent = ringExtentRadius(parentPos, parentRadius, datasetChildren);
    const zoom = zoomForWorldDiameter(extent, SERIES_FOCUS_DIAMETER_PX);
    setViewState((vs) => ({
      ...focusViewState(vs, [parentPos[0], parentPos[1], 0], zoom),
      ...FOCUS_TRANSITION,
    }));
  }, [
    expandedSeriesId,
    expandedDatasetId,
    seriesPositions,
    seriesRadii,
    datasetPositions,
    datasetSquares,
    paperMarkers,
  ]);

  const layers = useMemo(() => {
    if (!graph) return [];

    const layersOut = [];
    const dimmed = Boolean(expandedSeriesId);

    layersOut.push(
      new ScatterplotLayer<PositionedNode>({
        id: "dataset-series-background",
        data: backgroundSeries,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: (d) => [...d.position, 0],
        getRadius: (d) => d.radius,
        radiusUnits: "common",
        getFillColor: (d) =>
          getDomainColorRgb(d.domain, dimmed ? BACKGROUND_DIM_ALPHA : 230),
        stroked: false,
        filled: true,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 200],
        updateTriggers: {
          getFillColor: expandedSeriesId,
          getRadius: maxSeriesPaperCount,
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
          const id = (info.object as PositionedNode).nodeId;
          setExpandedDatasetId(null);
          setExpandedSeriesId(id);
        },
      }),
    );

    const allEdges = [...datasetEdges, ...paperEdges];
    if (allEdges.length > 0) {
      layersOut.push(
        new LineLayer<ExpandEdge>({
          id: "dataset-expand-edges",
          data: allEdges,
          coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
          getSourcePosition: (d) => [...d.source, 0],
          getTargetPosition: (d) => [...d.target, 0],
          getColor: (d) => d.color,
          getWidth: 2.5,
          widthUnits: "pixels",
          pickable: false,
          updateTriggers: {
            getColor: `${expandedSeriesId}:${expandedDatasetId}`,
          },
        }),
      );
    }

    if (datasetSquares.length > 0) {
      layersOut.push(
        new SolidPolygonLayer<ChildPolygon>({
          id: "dataset-child-squares",
          data: datasetSquares,
          coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
          getPolygon: (d) => d.polygon,
          getFillColor: (d) => d.color,
          stroked: false,
          filled: true,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 230],
          updateTriggers: {
            getFillColor: `${expandedSeriesId}:${expandedDatasetId}`,
            getPolygon: maxDatasetPaperCount,
          },
          onHover: (info) => {
            if (info.object) {
              setHover({
                node: (info.object as ChildPolygon).node,
                x: info.x,
                y: info.y,
              });
            } else {
              setHover(null);
            }
          },
          onClick: (info) => {
            if (!info.object) return;
            const node = (info.object as ChildPolygon).node;
            setExpandedDatasetId((prev) => (prev === node.nodeId ? null : node.nodeId));
          },
        }),
      );
    }

    // Series parent under papers so the paper ring is never covered.
    if (expandedParent) {
      layersOut.push(
        new ScatterplotLayer<PositionedNode>({
          id: "dataset-expanded-parent",
          data: [expandedParent],
          coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
          getPosition: (d) => [...d.position, 0],
          getRadius: (d) => d.radius,
          radiusUnits: "common",
          getFillColor: (d) => getDomainColorRgb(d.domain, 255),
          stroked: false,
          filled: true,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 220],
          updateTriggers: {
            getFillColor: expandedSeriesId,
          },
          onHover: (info) => {
            if (info.object) {
              setHover({ node: info.object, x: info.x, y: info.y });
            } else {
              setHover(null);
            }
          },
          onClick: () => {
            setExpandedDatasetId(null);
            setExpandedSeriesId(null);
          },
        }),
      );
    }

    if (paperMarkers.length > 0 && paperIconAtlas) {
      layersOut.push(
        new IconLayer<PaperMarker>({
          id: "dataset-paper-triangles",
          data: paperMarkers,
          coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
          iconAtlas: paperIconAtlas,
          iconMapping: PAPER_ICON_MAPPING,
          getPosition: (d) => [...d.node.position, 0],
          getIcon: () => "triangle",
          getSize: (d) => d.node.radius * 2,
          sizeUnits: "common",
          getColor: (d) => d.color,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 230],
          updateTriggers: {
            getColor: expandedDatasetId,
            getSize: maxPaperScore,
          },
          onHover: (info) => {
            if (info.object) {
              setHover({
                node: (info.object as PaperMarker).node,
                x: info.x,
                y: info.y,
              });
            } else {
              setHover(null);
            }
          },
          onClick: (info) => {
            if (!info.object) return;
            router.push(`/papers/${(info.object as PaperMarker).node.id}`);
          },
        }),
      );
    }

    // Focused dataset on top of its papers so click can collapse the paper ring.
    if (expandedDatasetId) {
      const focused = datasetSquares.find((d) => d.node.nodeId === expandedDatasetId);
      if (focused) {
        layersOut.push(
          new SolidPolygonLayer<ChildPolygon>({
            id: "dataset-expanded-dataset",
            data: [focused],
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            getPolygon: (d) => d.polygon,
            getFillColor: (d) => d.color,
            stroked: false,
            filled: true,
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255, 230],
            onHover: (info) => {
              if (info.object) {
                setHover({
                  node: (info.object as ChildPolygon).node,
                  x: info.x,
                  y: info.y,
                });
              } else {
                setHover(null);
              }
            },
            onClick: () => setExpandedDatasetId(null),
          }),
        );
      }
    }

    // Series titles centered in each bubble; size fitted to stay inside.
    layersOut.push(
      new TextLayer<LabeledSeries>({
        id: "dataset-series-labels",
        data: labeledSeries,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: (d) => [...d.position, 0],
        getText: (d) => d.labelText,
        getSize: (d) => d.labelSize,
        sizeUnits: "common",
        sizeMinPixels: 6,
        sizeMaxPixels: 36,
        getColor: (d) =>
          dimmed && d.nodeId !== expandedSeriesId ? [0, 0, 0, 50] : [0, 0, 0, 235],
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontWeight: 600,
        lineHeight: 1.15,
        // Light halo so black text stays readable on domain colors.
        outlineWidth: 2,
        outlineColor: [255, 255, 255, 180],
        pickable: false,
        updateTriggers: {
          getColor: expandedSeriesId,
          getSize: maxSeriesPaperCount,
          getText: maxSeriesPaperCount,
        },
      }),
    );

    return layersOut;
  }, [
    graph,
    backgroundSeries,
    labeledSeries,
    expandedParent,
    datasetSquares,
    datasetEdges,
    paperMarkers,
    paperEdges,
    paperIconAtlas,
    expandedSeriesId,
    expandedDatasetId,
    maxSeriesPaperCount,
    maxDatasetPaperCount,
    maxPaperScore,
    router,
  ]);

  const legend = useMemo(() => getDomainLegendEntries(), []);
  const seriesCount = seriesNodes.length;
  const paperNodeCount = paperNodes.length;
  const expandedDatasetCount = datasetSquares.length;
  const expandedPaperCount = paperMarkers.length;
  const linkedPaperCount = expandedDatasetId
    ? (papersByDataset.get(expandedDatasetId)?.length ?? 0)
    : 0;

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
      {!graph && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
          <LoadingSpinner size="lg" />
          <p className="text-gray-500 text-sm">Loading dataset graph…</p>
        </div>
      )}

      {graph && (
        <DeckGL
          views={new OrthographicView({ flipY: false })}
          viewState={viewState}
          onViewStateChange={({ viewState: vs }) => setViewState(vs as OrthographicViewState)}
          controller={true}
          layers={layers}
        />
      )}

      {graph && (
        <>
          <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-gray-600 shadow-sm border border-gray-200 pointer-events-none">
            {seriesCount.toLocaleString()} series
            {paperNodeCount > 0 ? ` · ${paperNodeCount.toLocaleString()} papers in graph` : ""}
            {expandedSeriesId
              ? ` · ${expandedDatasetCount.toLocaleString()} datasets`
              : " · click a series to expand"}
            {expandedDatasetId
              ? linkedPaperCount > 0
                ? ` · ${expandedPaperCount.toLocaleString()} papers`
                : " · no linked papers for this dataset"
              : expandedSeriesId
                ? " · click a dataset for papers"
                : ""}
            {" · drag to pan, scroll to zoom"}
          </div>

          <button
            type="button"
            onClick={resetToOverview}
            className="absolute top-3 right-3 z-10 rounded-lg border border-gray-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm backdrop-blur-sm hover:bg-white hover:text-gray-900"
          >
            Reset view
          </button>

          <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 flex flex-wrap gap-x-3 gap-y-1 shadow-sm border border-gray-200 pointer-events-none max-w-[90%]">
            {legend.map((entry) => (
              <span key={entry.domain} className="flex items-center gap-1.5 text-[11px] text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                {entry.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500 ml-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-gray-400" />
              dataset
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span
                className="inline-block w-0 h-0 border-l-[5px] border-r-[5px] border-b-[9px] border-l-transparent border-r-transparent border-b-gray-400"
              />
              paper
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
            {hover.node.type === "series"
              ? "dataset series"
              : hover.node.type === "dataset"
                ? "dataset"
                : "paper"}
            {hover.node.type === "series" || hover.node.type === "dataset"
              ? ` · ${(hover.node.paperCount || 0).toLocaleString()} papers`
              : ""}
            {hover.node.year ? ` · ${hover.node.year}` : ""}
            {hover.node.type === "series" && expandedSeriesId !== hover.node.nodeId
              ? " · click to expand"
              : ""}
            {hover.node.type === "series" && expandedSeriesId === hover.node.nodeId
              ? " · click to collapse"
              : ""}
            {hover.node.type === "dataset" && expandedDatasetId !== hover.node.nodeId
              ? " · click for papers"
              : ""}
            {hover.node.type === "dataset" && expandedDatasetId === hover.node.nodeId
              ? " · click to collapse papers"
              : ""}
            {hover.node.type === "paper" ? " · click to open" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
