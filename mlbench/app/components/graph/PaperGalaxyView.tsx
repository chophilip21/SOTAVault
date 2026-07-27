"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DeckGL from "@deck.gl/react";
import {
  COORDINATE_SYSTEM,
  OrthographicView,
  LinearInterpolator,
  type OrthographicViewState,
} from "@deck.gl/core";
import { PolygonLayer, TextLayer } from "@deck.gl/layers";
import {
  fetchPaperGalaxy,
  type PaperClusterNode,
  type PaperGalaxyData,
  type PaperGalaxyPoint,
} from "@/lib/graph/arrowClient";
import { getClusterColorRgb } from "@/lib/graph/domainColors";
import { LoadingSpinner } from "../LoadingSpinner";

interface HoverInfo {
  kind: "cluster" | "paper";
  cluster?: PaperClusterNode;
  paper?: PaperGalaxyPoint;
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PositionedCluster {
  cluster: PaperClusterNode;
  rect: Rect;
  labelText: string;
  labelSize: number;
  textColor: [number, number, number, number];
}

interface ClusterBlock {
  cluster: PositionedCluster;
  polygon: [number, number, number][];
  color: [number, number, number, number];
}

interface PaperSquare {
  paper: PaperGalaxyPoint;
  rect: Rect;
  polygon: [number, number, number][];
  color: [number, number, number, number];
}

/** World height of the topic treemap; width follows the explorer viewport aspect. */
const TREEMAP_HEIGHT = 80;
/** Fallback aspect before the container is measured (wide landing strip). */
const DEFAULT_VIEWPORT_ASPECT = 2.4;
const OVERVIEW_FILL = 0.94;
const CLUSTER_FOCUS_FILL = 0.94;
const BACKGROUND_DIM_ALPHA = 50;
const FOCUS_TRANSITION_MS = 320;
const FOCUS_TRANSITION = {
  transitionDuration: FOCUS_TRANSITION_MS,
  transitionInterpolator: new LinearInterpolator([
    "target",
    "zoom",
    "zoomX",
    "zoomY",
  ]),
};

const INITIAL_VIEW_STATE: OrthographicViewState = {
  target: [(TREEMAP_HEIGHT * DEFAULT_VIEWPORT_ASPECT) / 2, TREEMAP_HEIGHT / 2, 0],
  zoom: 0,
  minZoom: -2,
  maxZoom: 14,
};

const NULLISH_AUTHOR = new Set([
  "",
  "none",
  "null",
  "n/a",
  "na",
  "unknown",
  "anonymous",
  "undefined",
]);
const BOGUS_TITLES = new Set([
  "introduction",
  "untitled",
  "no title",
  "n/a",
  "none",
  "null",
]);
const MAX_BOGUS_ABSTRACT_TITLE_LEN = 24;

function isRealAuthor(name: string | null | undefined): boolean {
  if (!name) return false;
  const cleaned = name.trim().replace(/^\*+|\*+$/g, "").trim();
  return cleaned.length > 0 && !NULLISH_AUTHOR.has(cleaned.toLowerCase());
}

function isRealTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const cleaned = title.trim().replace(/^\*+|\*+$/g, "").trim();
  if (!cleaned || BOGUS_TITLES.has(cleaned.toLowerCase())) return false;
  if (
    cleaned.length <= MAX_BOGUS_ABSTRACT_TITLE_LEN &&
    cleaned.toLowerCase().includes("abstract")
  ) {
    return false;
  }
  return true;
}

function filterValidPapers(data: PaperGalaxyData): PaperGalaxyData {
  const points = data.points.filter(
    (p) => isRealTitle(p.title) && p.authors.some(isRealAuthor),
  );
  if (points.length === data.points.length) {
    return {
      points,
      clusters: data.clusters.filter((c) => c.clusterId >= 0),
    };
  }
  const live = new Set(points.map((p) => p.clusterId));
  const clusters = data.clusters.filter(
    (c) => c.clusterId >= 0 && live.has(c.clusterId),
  );
  return { points, clusters };
}

function rectPolygon(r: Rect): [number, number, number][] {
  return [
    [r.x, r.y, 0],
    [r.x + r.w, r.y, 0],
    [r.x + r.w, r.y + r.h, 0],
    [r.x, r.y + r.h, 0],
  ];
}

function focusViewState(
  prev: OrthographicViewState,
  target: [number, number, number],
  zoom: number,
): OrthographicViewState {
  return { ...prev, target, zoom, zoomX: zoom, zoomY: zoom };
}

/** Zoom so a world width/height fills the viewport (with fill factor). */
function zoomToFitRect(
  rect: Rect,
  containerW: number,
  containerH: number,
  fill: number,
): { target: [number, number, number]; zoom: number } {
  const zoom = Math.min(
    Math.log2((containerW * fill) / Math.max(rect.w, 1e-6)),
    Math.log2((containerH * fill) / Math.max(rect.h, 1e-6)),
  );
  return {
    target: [rect.x + rect.w / 2, rect.y + rect.h / 2, 0],
    zoom,
  };
}

function relativeLuminance(r: number, g: number, b: number): number {
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

/** Black text on light fills, white on dark fills. */
function contrastingTextColor(
  fill: [number, number, number, number],
): [number, number, number, number] {
  return relativeLuminance(fill[0], fill[1], fill[2]) > 0.45
    ? [15, 15, 20, 245]
    : [255, 255, 255, 245];
}

/**
 * Squarified treemap (Bruls et al.). Items should already be ordered so
 * neighbors in the list stay spatially close (similarity order).
 */
function squarifyLayout<T extends { value: number }>(
  items: T[],
  bounds: Rect,
): Array<T & { rect: Rect }> {
  if (items.length === 0) return [];
  const total = items.reduce((s, it) => s + Math.max(it.value, 1e-9), 0);
  if (total <= 0) return [];

  type Node = T & { value: number };
  const nodes: Node[] = items.map((it) => ({
    ...it,
    value: Math.max(it.value, 1e-9),
  }));
  const out: Array<T & { rect: Rect }> = [];

  const worst = (row: Node[], length: number, rowArea: number): number => {
    if (row.length === 0 || length <= 0) return Infinity;
    let min = Infinity;
    let max = 0;
    for (const n of row) {
      if (n.value < min) min = n.value;
      if (n.value > max) max = n.value;
    }
    const s = rowArea;
    const s2 = s * s;
    const l2 = length * length;
    return Math.max((l2 * max) / s2, s2 / (l2 * min));
  };

  const layoutRow = (row: Node[], rect: Rect, horizontal: boolean): Rect => {
    const rowArea = row.reduce((s, n) => s + n.value, 0);
    if (horizontal) {
      const rowH = rowArea / rect.w;
      let x = rect.x;
      for (const n of row) {
        const w = n.value / rowH;
        out.push({ ...n, rect: { x, y: rect.y, w, h: rowH } });
        x += w;
      }
      return { x: rect.x, y: rect.y + rowH, w: rect.w, h: rect.h - rowH };
    }
    const rowW = rowArea / rect.h;
    let y = rect.y;
    for (const n of row) {
      const h = n.value / rowW;
      out.push({ ...n, rect: { x: rect.x, y, w: rowW, h } });
      y += h;
    }
    return { x: rect.x + rowW, y: rect.y, w: rect.w - rowW, h: rect.h };
  };

  // Scale values so sum(value) == bounds.w * bounds.h
  const scale = (bounds.w * bounds.h) / total;
  for (const n of nodes) n.value *= scale;

  let remaining = [...nodes];
  let rect = { ...bounds };

  while (remaining.length > 0) {
    const horizontal = rect.w >= rect.h;
    const length = horizontal ? rect.w : rect.h;
    const row: Node[] = [];
    let rowArea = 0;
    let bestWorst = Infinity;

    while (remaining.length > 0) {
      const next = remaining[0];
      const trial = [...row, next];
      const trialArea = rowArea + next.value;
      const score = worst(trial, length, trialArea);
      if (row.length > 0 && score > bestWorst) break;
      row.push(remaining.shift()!);
      rowArea = trialArea;
      bestWorst = score;
    }

    rect = layoutRow(row, rect, horizontal);
  }

  return out;
}

/** Order clusters so UMAP-neighbors stay adjacent in the treemap strip. */
function orderClustersBySimilarity(clusters: PaperClusterNode[]): PaperClusterNode[] {
  if (clusters.length <= 1) return [...clusters];
  let cx = 0;
  let cy = 0;
  for (const c of clusters) {
    cx += c.x;
    cy += c.y;
  }
  cx /= clusters.length;
  cy /= clusters.length;
  return [...clusters].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
}

function wrapWords(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxCharsPerLine || !cur) {
      cur = next.length <= maxCharsPerLine ? next : w;
      if (next.length > maxCharsPerLine && w.length > maxCharsPerLine) {
        // Hard-break an oversized token.
        lines.push(w.slice(0, maxCharsPerLine));
        cur = w.slice(maxCharsPerLine);
      }
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Fit a multi-line label strictly inside ``rect`` (world units). Never wider /
 * taller than the block, so labels cannot spill onto neighbors at any zoom
 * (TextLayer uses sizeUnits: "common" with no pixel floor).
 */
function clusterLabelForRect(
  label: string,
  count: number,
  rect: Rect,
): { text: string; size: number } {
  const padX = Math.max(rect.w * 0.06, 0.15);
  const padY = Math.max(rect.h * 0.06, 0.15);
  const usableW = rect.w - 2 * padX;
  const usableH = rect.h - 2 * padY;
  if (usableW < 0.4 || usableH < 0.4) return { text: "", size: 0 };

  const charAspect = 0.56;
  const lineHeight = 1.2;
  const countSuffix = `(${count.toLocaleString()})`;

  let bestText = "";
  let bestSize = 0;

  const maxCharsCap = Math.max(label.length, countSuffix.length, 4);
  for (let maxChars = maxCharsCap; maxChars >= 3; maxChars--) {
    const labelLines = wrapWords(label, maxChars);
    if (labelLines.length === 0) continue;

    // Prefer count on its own last line when wrapping, else same line if short.
    const lines =
      labelLines.length === 1 &&
      `${labelLines[0]} ${countSuffix}`.length <= maxChars + countSuffix.length + 1
        ? [`${labelLines[0]} ${countSuffix}`]
        : [...labelLines, countSuffix];

    const longest = Math.max(...lines.map((l) => l.length), 1);
    const sizeByW = usableW / (longest * charAspect);
    const sizeByH = usableH / (lines.length * lineHeight);
    const size = Math.min(sizeByW, sizeByH);
    if (size > bestSize) {
      bestSize = size;
      bestText = lines.join("\n");
    }
  }

  // Tiny blocks: drop the count and try label-only wrap.
  if (bestSize < usableH * 0.12) {
    bestText = "";
    bestSize = 0;
    for (let maxChars = Math.max(label.length, 3); maxChars >= 3; maxChars--) {
      const lines = wrapWords(label, maxChars);
      if (lines.length === 0) continue;
      const longest = Math.max(...lines.map((l) => l.length), 1);
      const size = Math.min(
        usableW / (longest * charAspect),
        usableH / (lines.length * lineHeight),
      );
      if (size > bestSize) {
        bestSize = size;
        bestText = lines.join("\n");
      }
    }
  }

  if (bestSize < 0.35 || !bestText) return { text: "", size: 0 };
  return { text: bestText, size: bestSize };
}

interface PaperGalaxyViewProps {
  onResetRef?: React.MutableRefObject<(() => void) | null>;
}

export default function PaperGalaxyView({ onResetRef }: PaperGalaxyViewProps = {}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const overviewFitRef = useRef<{ target: [number, number, number]; zoom: number } | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);

  const [data, setData] = useState<PaperGalaxyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [viewState, setViewState] = useState<OrthographicViewState>(INITIAL_VIEW_STATE);
  const [expandedClusterId, setExpandedClusterId] = useState<number | null>(null);
  /** Pixel size of the explorer canvas — drives treemap aspect + DeckGL size. */
  const [viewportPx, setViewportPx] = useState({ w: 960, h: 400 });
  const prevExpandedRef = useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const apply = (width: number, height: number) => {
      const w = Math.max(1, Math.round(width));
      const h = Math.max(1, Math.round(height));
      if (w <= 0 || h <= 0) return;
      setViewportPx((prev) =>
        Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w, h },
      );
    };
    apply(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => apply(cr.width, cr.height));
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  /** Wide rectangle matching Semantic Graph Explorer (not a square). */
  const treemapBounds: Rect = useMemo(() => {
    const aspect = Math.max(viewportPx.w / Math.max(viewportPx.h, 1), 1.15);
    return { x: 0, y: 0, w: TREEMAP_HEIGHT * aspect, h: TREEMAP_HEIGHT };
  }, [viewportPx]);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const result = filterValidPapers(await fetchPaperGalaxy(controller.signal));
        setData(result);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message || "Failed to load the paper map.");
        }
      }
    })();

    return () => controller.abort();
  }, []);

  const clusters = useMemo(
    () => (data ? data.clusters.filter((c) => c.clusterId >= 0) : []),
    [data],
  );

  const points = useMemo(() => data?.points ?? [], [data]);

  const papersByCluster = useMemo(() => {
    const map = new Map<number, PaperGalaxyPoint[]>();
    for (const p of points) {
      if (p.clusterId < 0) continue;
      const list = map.get(p.clusterId);
      if (list) list.push(p);
      else map.set(p.clusterId, [p]);
    }
    for (const [, list] of map) {
      list.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }
    return map;
  }, [points]);

  const positionedClusters: PositionedCluster[] = useMemo(() => {
    const ordered = orderClustersBySimilarity(clusters);
    const laid = squarifyLayout(
      ordered.map((c) => ({ cluster: c, value: Math.max(c.size, 1) })),
      treemapBounds,
    );
    return laid.map(({ cluster, rect }) => {
      const fill = getClusterColorRgb(cluster.clusterId, 255);
      const fitted = clusterLabelForRect(cluster.label, cluster.size, rect);
      return {
        cluster,
        rect,
        labelText: fitted.text,
        labelSize: fitted.size,
        textColor: contrastingTextColor(fill),
      };
    });
  }, [clusters, treemapBounds]);

  const containerSize = useCallback(() => {
    return { w: viewportPx.w || 480, h: viewportPx.h || 480 };
  }, [viewportPx]);

  useEffect(() => {
    if (positionedClusters.length === 0) return;
    const { w, h } = containerSize();
    if (w < 2 || h < 2) return;
    const fit = zoomToFitRect(treemapBounds, w, h, OVERVIEW_FILL);
    overviewFitRef.current = fit;
    if (expandedClusterId == null) {
      // Resize refits immediately (no camera ease); expand/collapse still animates below.
      setViewState((vs) => focusViewState(vs, fit.target, fit.zoom));
    }
  }, [positionedClusters, expandedClusterId, containerSize, treemapBounds]);

  const resetToOverview = useCallback(() => {
    setExpandedClusterId(null);
    setHover(null);
    if (overviewFitRef.current) {
      const { target, zoom } = overviewFitRef.current;
      setViewState((vs) => ({
        ...focusViewState(vs, target, zoom),
        ...FOCUS_TRANSITION,
      }));
    }
  }, []);

  useEffect(() => {
    if (onResetRef) {
      onResetRef.current = resetToOverview;
    }
  }, [resetToOverview, onResetRef]);

  const expandedParent = useMemo(
    () =>
      expandedClusterId != null
        ? positionedClusters.find((c) => c.cluster.clusterId === expandedClusterId) ??
          null
        : null,
    [positionedClusters, expandedClusterId],
  );

  /** Pack every paper in the focused cluster as tiny squares filling the block. */
  const paperSquares: PaperSquare[] = useMemo(() => {
    if (expandedClusterId == null || !expandedParent) return [];
    const kids = papersByCluster.get(expandedClusterId) ?? [];
    if (kids.length === 0) return [];

    const { rect } = expandedParent;
    const laid = squarifyLayout(
      kids.map((paper) => ({ paper, value: 1 })),
      rect,
    );
    const mother = getClusterColorRgb(expandedClusterId, 255);
    return laid.map(({ paper, rect: cell }, i) => {
      const t = kids.length <= 1 ? 0 : i / (kids.length - 1);
      const shade = 0.82 + 0.18 * (1 - t);
      const color: [number, number, number, number] = [
        Math.round(mother[0] * shade),
        Math.round(mother[1] * shade),
        Math.round(mother[2] * shade),
        255,
      ];
      return {
        paper,
        rect: cell,
        polygon: rectPolygon(cell),
        color,
      };
    });
  }, [expandedClusterId, expandedParent, papersByCluster]);

  useEffect(() => {
    const expandedChanged = prevExpandedRef.current !== expandedClusterId;
    prevExpandedRef.current = expandedClusterId;
    const transition = expandedChanged ? FOCUS_TRANSITION : {};

    if (expandedClusterId == null) {
      if (overviewFitRef.current) {
        const { target, zoom } = overviewFitRef.current;
        setViewState((vs) => ({
          ...focusViewState(vs, target, zoom),
          ...transition,
        }));
      }
      return;
    }
    if (!expandedParent) return;
    const { w, h } = containerSize();
    if (w < 2 || h < 2) return;
    const fit = zoomToFitRect(expandedParent.rect, w, h, CLUSTER_FOCUS_FILL);
    setViewState((vs) => ({
      ...focusViewState(vs, fit.target, fit.zoom),
      ...transition,
    }));
  }, [expandedClusterId, expandedParent, paperSquares.length, containerSize]);

  const clusterBlocks: ClusterBlock[] = useMemo(() => {
    const dimmed = expandedClusterId != null;
    return positionedClusters
      // Focused cluster has no pickable block — title is TextLayer-only (not clickable).
      .filter((pc) => pc.cluster.clusterId !== expandedClusterId)
      .map((pc) => ({
        cluster: pc,
        polygon: rectPolygon(pc.rect),
        color: getClusterColorRgb(
          pc.cluster.clusterId,
          dimmed ? BACKGROUND_DIM_ALPHA : 230,
        ),
      }));
  }, [positionedClusters, expandedClusterId]);

  const labeledClusters = useMemo(
    () => positionedClusters.filter((c) => c.labelText && c.labelSize > 0),
    [positionedClusters],
  );

  const layers = useMemo(() => {
    const out = [];

    out.push(
      new PolygonLayer<ClusterBlock>({
        id: "paper-topic-blocks",
        data: clusterBlocks,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPolygon: (d) => d.polygon,
        getFillColor: (d) => d.color,
        stroked: true,
        getLineColor: [255, 255, 255, 255],
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
        filled: true,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 200],
        updateTriggers: {
          getFillColor: expandedClusterId,
        },
        onHover: (info) => {
          if (info.object) {
            const block = info.object as ClusterBlock;
            setHover({
              kind: "cluster",
              cluster: block.cluster.cluster,
              x: info.x,
              y: info.y,
            });
          } else {
            setHover(null);
          }
        },
        onClick: (info) => {
          if (!info.object) {
            // Empty canvas while zoomed: stay put (use Reset view to leave).
            return;
          }
          const id = (info.object as ClusterBlock).cluster.cluster.clusterId;
          // Already inside this cluster — title/block must not be a toggle target.
          if (expandedClusterId === id) return;
          setExpandedClusterId(id);
        },
      }),
    );

    if (paperSquares.length > 0) {
      out.push(
        new PolygonLayer<PaperSquare>({
          id: "paper-member-squares",
          data: paperSquares,
          coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
          getPolygon: (d) => d.polygon,
          getFillColor: (d) => d.color,
          stroked: true,
          getLineColor: [255, 255, 255, 220],
          getLineWidth: 1,
          lineWidthMinPixels: 0.5,
          lineWidthUnits: "pixels",
          filled: true,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 230],
          onHover: (info) => {
            if (info.object) {
              setHover({
                kind: "paper",
                paper: (info.object as PaperSquare).paper,
                x: info.x,
                y: info.y,
              });
            } else {
              setHover(null);
            }
          },
          onClick: (info) => {
            if (info.object) {
              router.push(`/papers/${(info.object as PaperSquare).paper.id}`);
            }
          },
        }),
      );
    }

    out.push(
      new TextLayer<PositionedCluster>({
        id: "paper-topic-labels",
        data: labeledClusters,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        // Always centered in the block — including when zoomed into a cluster.
        getPosition: (d) => [d.rect.x + d.rect.w / 2, d.rect.y + d.rect.h / 2, 0],
        getText: (d) => d.labelText,
        getSize: (d) => d.labelSize,
        sizeUnits: "common",
        sizeMaxPixels: 48,
        getColor: (d) => d.textColor,
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        lineHeight: 1.2,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontWeight: 600,
        // Never pickable — especially when zoomed in, the title is display-only.
        pickable: false,
        updateTriggers: {
          getColor: expandedClusterId,
        },
      }),
    );

    return out;
  }, [
    clusterBlocks,
    labeledClusters,
    paperSquares,
    expandedClusterId,
    router,
  ]);

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
    <div className="flex w-full flex-col gap-2.5">
      {data && expandedClusterId != null && (
        <div className="flex flex-col items-center justify-center px-1">
          <p className="text-center text-xs leading-relaxed text-gray-500">
            {`${paperSquares.length.toLocaleString()} papers in topic · click a square to open · drag to pan, scroll to zoom`}
          </p>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative h-[min(480px,70vh)] min-h-[280px] w-full overflow-hidden rounded-lg bg-white"
      >
        {!data && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
            <LoadingSpinner size="lg" />
            <p className="text-sm text-gray-500">Loading topic map…</p>
          </div>
        )}

        {data && viewportPx.w > 1 && viewportPx.h > 1 && (
          <DeckGL
            width={viewportPx.w}
            height={viewportPx.h}
            views={new OrthographicView({ flipY: false })}
            viewState={viewState}
            onViewStateChange={({ viewState: vs }) => setViewState(vs as OrthographicViewState)}
            controller={true}
            layers={layers}
            style={{ width: "100%", height: "100%" }}
          />
        )}

        {hover && (
          <div
            className="pointer-events-none absolute z-20 max-w-xs rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 shadow-lg"
            style={{
              left: Math.min(hover.x + 12, Math.max(8, viewportPx.w - 220)),
              top: Math.min(hover.y + 12, Math.max(8, viewportPx.h - 80)),
            }}
          >
            {hover.kind === "cluster" && hover.cluster && (
              <>
                <p className="mb-1 font-semibold">{hover.cluster.label}</p>
                <p className="text-gray-500">
                  {hover.cluster.size.toLocaleString()} papers · click to zoom in
                </p>
              </>
            )}
            {hover.kind === "paper" && hover.paper && (
              <>
                <p className="mb-1 line-clamp-2 font-semibold">{hover.paper.title}</p>
                {hover.paper.authors.length > 0 && (
                  <p className="mb-1 line-clamp-1 text-gray-500">
                    {hover.paper.authors.slice(0, 3).join(", ")}
                    {hover.paper.authors.length > 3 && " et al."}
                  </p>
                )}
                <p className="text-gray-400">
                  {[hover.paper.venue, hover.paper.year].filter(Boolean).join(" · ")}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
