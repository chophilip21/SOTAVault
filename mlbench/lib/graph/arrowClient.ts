/**
 * Fetch + decode the pre-generated graph Arrow files served by the backend
 * (`GET /graph/papers`, `GET /graph/datasets` — see backend/app/routers/graph.py).
 *
 * These files are produced offline by `mlbench.graph.paper_graph` (3-D UMAP
 * "semantic galaxy" of papers) and `mlbench.graph.dataset_graph` (3-D UMAP of
 * series embeddings + series→dataset hierarchy). We decode them client-side
 * with `apache-arrow` and hand plain JS arrays to deck.gl for rendering.
 */
import { tableFromIPC } from "apache-arrow";

export interface PaperGalaxyPoint {
  id: string;
  title: string;
  arxivId: string | null;
  domain: string;
  paperType: string | null;
  year: number | null;
  score: number;
  venue: string | null;
  authors: string[];
  x: number;
  y: number;
  z: number;
}

export type DatasetNodeType = "domain" | "series" | "dataset";

export interface DatasetGraphNode {
  nodeId: string;
  id: string;
  type: DatasetNodeType;
  label: string;
  domain: string;
  year: number | null;
  x: number;
  y: number;
  z: number;
}

export interface DatasetGraphEdge {
  sourceId: string;
  targetId: string;
  edgeType: string;
}

export interface DatasetGraphData {
  nodes: DatasetGraphNode[];
  edges: DatasetGraphEdge[];
}

/** Arrow int64 columns decode to BigInt64Array; coerce to a plain number (or null). */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return Number(value);
  return Number(value);
}

async function fetchArrayBuffer(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url} (HTTP ${res.status})`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Parse the standard Arrow IPC file written by `paper_graph._write_arrow_ipc`
 * into a flat array of points ready for a deck.gl ScatterplotLayer.
 */
export async function fetchPaperGalaxy(
  url: string,
  signal?: AbortSignal,
): Promise<PaperGalaxyPoint[]> {
  const bytes = await fetchArrayBuffer(url, signal);
  const table = tableFromIPC(bytes);

  const entityIds = table.getChild("entity_id")?.toArray() ?? [];
  const titles = table.getChild("title")?.toArray() ?? [];
  const arxivIds = table.getChild("arxiv_id")?.toArray() ?? [];
  const domains = table.getChild("domain")?.toArray() ?? [];
  const paperTypes = table.getChild("paper_type")?.toArray() ?? [];
  const years = table.getChild("year")?.toArray() ?? [];
  const scores = table.getChild("score")?.toArray() ?? [];
  const venues = table.getChild("venue")?.toArray() ?? [];
  const authorsCol = table.getChild("authors");
  const xs = table.getChild("x")?.toArray() ?? [];
  const ys = table.getChild("y")?.toArray() ?? [];
  const zs = table.getChild("z")?.toArray() ?? [];

  const points: PaperGalaxyPoint[] = new Array(table.numRows);
  for (let i = 0; i < table.numRows; i++) {
    points[i] = {
      id: entityIds[i],
      title: titles[i],
      arxivId: arxivIds[i] ?? null,
      domain: domains[i] ?? "other",
      paperType: paperTypes[i] ?? null,
      year: toNumber(years[i]),
      score: toNumber(scores[i]) ?? 0,
      venue: venues[i] ?? null,
      authors: authorsCol ? Array.from(authorsCol.get(i) ?? []) : [],
      x: xs[i],
      y: ys[i],
      z: zs[i],
    };
  }
  return points;
}

const NODES_MAGIC = "NODES";
const EDGES_MAGIC = "EDGES";

/**
 * Parse the custom dual-table Arrow framing written by
 * `dataset_graph._write_graph_ipc`: two length-prefixed sections
 * (`NODES` then `EDGES`), each an Arrow IPC *stream*.
 *
 * Layout per section: u32 magicLen | magic bytes | u64 dataLen | data bytes.
 */
function splitGraphSections(bytes: Uint8Array): Record<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sections: Record<string, Uint8Array> = {};
  let offset = 0;
  for (let i = 0; i < 2; i++) {
    const magicLen = view.getUint32(offset, true);
    offset += 4;
    const magic = new TextDecoder().decode(bytes.subarray(offset, offset + magicLen));
    offset += magicLen;
    const dataLen = Number(view.getBigUint64(offset, true));
    offset += 8;
    sections[magic] = bytes.subarray(offset, offset + dataLen);
    offset += dataLen;
  }
  return sections;
}

export async function fetchDatasetGraph(
  url: string,
  signal?: AbortSignal,
): Promise<DatasetGraphData> {
  const bytes = await fetchArrayBuffer(url, signal);
  const sections = splitGraphSections(bytes);

  const nodesTable = tableFromIPC(sections[NODES_MAGIC]);
  const edgesTable = tableFromIPC(sections[EDGES_MAGIC]);

  const nodeIds = nodesTable.getChild("node_id")?.toArray() ?? [];
  const entityIds = nodesTable.getChild("entity_id")?.toArray() ?? [];
  const nodeTypes = nodesTable.getChild("node_type")?.toArray() ?? [];
  const labels = nodesTable.getChild("label")?.toArray() ?? [];
  const domains = nodesTable.getChild("domain")?.toArray() ?? [];
  const years = nodesTable.getChild("year")?.toArray() ?? [];
  const nodeXs = nodesTable.getChild("x")?.toArray() ?? [];
  const nodeYs = nodesTable.getChild("y")?.toArray() ?? [];
  const nodeZs = nodesTable.getChild("z")?.toArray() ?? [];

  const nodes: DatasetGraphNode[] = new Array(nodesTable.numRows);
  for (let i = 0; i < nodesTable.numRows; i++) {
    nodes[i] = {
      nodeId: nodeIds[i],
      id: entityIds[i],
      type: nodeTypes[i] as DatasetNodeType,
      label: labels[i],
      domain: domains[i] ?? "other",
      year: toNumber(years[i]),
      x: nodeXs[i] ?? 0,
      y: nodeYs[i] ?? 0,
      z: nodeZs[i] ?? 0,
    };
  }

  const sourceIds = edgesTable.getChild("source_id")?.toArray() ?? [];
  const targetIds = edgesTable.getChild("target_id")?.toArray() ?? [];
  const edgeTypes = edgesTable.getChild("edge_type")?.toArray() ?? [];

  const edges: DatasetGraphEdge[] = new Array(edgesTable.numRows);
  for (let i = 0; i < edgesTable.numRows; i++) {
    edges[i] = {
      sourceId: sourceIds[i],
      targetId: targetIds[i],
      edgeType: edgeTypes[i],
    };
  }

  return { nodes, edges };
}
