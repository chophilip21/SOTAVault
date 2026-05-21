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
