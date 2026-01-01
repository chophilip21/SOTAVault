export type VectorSearchHit = {
  paper: {
    id: string;
    title: string;
    abstract?: string;
    year?: number | null;
    pdf_url?: string | null;
    project_url?: string | null;
    arxiv_id?: string | null;
    doi?: string | null;
  };
  distance?: number | null;
};

export type VectorSearchResponse = {
  items: VectorSearchHit[];
  limit: number;
};

export type RerankResponse = {
  ids: string[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ragHits?: VectorSearchHit[];
};

export type RagMemoryEntry = {
  query: string;
  hits: Array<{
    id: string;
    title: string;
    year?: number | null;
    abstract?: string;
    distance?: number | null;
  }>;
  embedding?: number[];
  createdAt: number;
};

export type MemoryState = {
  summary: string | null;
  recentTurns: { role: "user" | "assistant"; content: string }[];
  ragHistory: RagMemoryEntry[];
  lastSummarizedCount: number;
};

