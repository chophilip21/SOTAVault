/**
 * Decode the pre-generated graph Arrow files (paper + dataset).
 *
 * Fetching is delegated to `graphUrl.ts`, which handles local-vs-CDN routing:
 *   - local  → FastAPI /api/graph/* (local file), fallback to CDN on 404
 *   - prod   → cdn.sotavault.ai directly
 *
 * We decode the raw bytes client-side with `apache-arrow` and hand plain JS
 * arrays to deck.gl for rendering.
 */
import { tableFromIPC } from "apache-arrow";
import { fetchGraphBytes } from "./graphUrl";

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
  clusterId: number;
}

/** A discovered topic cluster (see `mlbench.graph.paper_graph._label_clusters`). */
export interface PaperClusterNode {
  clusterId: number;
  label: string;
  domain: string;
  size: number;
  x: number;
  y: number;
  z: number;
}

export interface PaperGalaxyData {
  points: PaperGalaxyPoint[];
  clusters: PaperClusterNode[];
}

export type DatasetNodeType = "domain" | "series" | "dataset" | "paper";

export interface DatasetGraphNode {
  nodeId: string;
  id: string;
  type: DatasetNodeType;
  label: string;
  domain: string;
  year: number | null;
  paperCount: number;
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
  if (typeof value === "bigint") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// fetchArrayBuffer is replaced by fetchGraphBytes in graphUrl.ts, which
// handles local-vs-CDN routing. No direct fetch calls remain here.

const PAPERS_MAGIC = "PAPERS";
const CLUSTERS_MAGIC = "CLUSTERS";
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

/**
 * Parse the dual-section Arrow IPC file written by
 * `paper_graph._write_paper_ipc` (`PAPERS` then `CLUSTERS`, same framing as
 * the dataset graph) into flat arrays ready for deck.gl.
 */
export async function fetchPaperGalaxy(
  signal?: AbortSignal,
): Promise<PaperGalaxyData> {
  const bytes = await fetchGraphBytes("paper", signal);
  const sections = splitGraphSections(bytes);

  const table = tableFromIPC(sections[PAPERS_MAGIC]);
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
  const clusterIds = table.getChild("cluster_id")?.toArray() ?? [];

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
      clusterId: toNumber(clusterIds[i]) ?? -1,
    };
  }

  const clusterTable = tableFromIPC(sections[CLUSTERS_MAGIC]);
  const clusterIdCol = clusterTable.getChild("cluster_id")?.toArray() ?? [];
  const labelCol = clusterTable.getChild("label")?.toArray() ?? [];
  const clusterDomainCol = clusterTable.getChild("domain")?.toArray() ?? [];
  const sizeCol = clusterTable.getChild("size")?.toArray() ?? [];
  const clusterXs = clusterTable.getChild("x")?.toArray() ?? [];
  const clusterYs = clusterTable.getChild("y")?.toArray() ?? [];
  const clusterZs = clusterTable.getChild("z")?.toArray() ?? [];

  const clusters: PaperClusterNode[] = new Array(clusterTable.numRows);
  for (let i = 0; i < clusterTable.numRows; i++) {
    clusters[i] = {
      clusterId: toNumber(clusterIdCol[i]) ?? -1,
      label: labelCol[i] ?? "",
      domain: clusterDomainCol[i] ?? "other",
      size: toNumber(sizeCol[i]) ?? 0,
      x: clusterXs[i],
      y: clusterYs[i],
      z: clusterZs[i],
    };
  }

  return { points, clusters };
}

export async function fetchDatasetGraph(
  signal?: AbortSignal,
): Promise<DatasetGraphData> {
  const bytes = await fetchGraphBytes("dataset", signal);
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
  const paperCounts = nodesTable.getChild("paper_count")?.toArray() ?? [];

  const nodes: DatasetGraphNode[] = new Array(nodesTable.numRows);
  for (let i = 0; i < nodesTable.numRows; i++) {
    nodes[i] = {
      nodeId: String(nodeIds[i]),
      id: String(entityIds[i]),
      type: String(nodeTypes[i]) as DatasetNodeType,
      label: String(labels[i] ?? ""),
      domain: String(domains[i] ?? "other"),
      year: toNumber(years[i]),
      paperCount: toNumber(paperCounts[i]) ?? 0,
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
      sourceId: String(sourceIds[i]),
      targetId: String(targetIds[i]),
      edgeType: String(edgeTypes[i]),
    };
  }

  return { nodes, edges };
}
