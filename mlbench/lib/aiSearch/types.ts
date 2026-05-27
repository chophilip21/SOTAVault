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

export type DatasetSeriesVectorSearchHit = {
  series: {
    id: string;
    name: string;
    description?: string | null;
    homepage?: string | null;
    domain?: string | null;
    aliases?: string[];
    leaderboard_document_count_total?: number;
  };
  distance?: number | null;
};

export type DatasetSeriesVectorSearchResponse = {
  items: DatasetSeriesVectorSearchHit[];
  limit: number;
};

export type AiSearchMode = "paper" | "dataset";
