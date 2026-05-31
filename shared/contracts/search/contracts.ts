/**
 * Shared Search Contracts for MyPal
 */

export interface SemanticSearchResult {
  id: string;
  title: string;
  category?: string;
  price?: number;
  image_url?: string;
  score: number;

  explanation: {
    vector_score: number;
    bm25_score: number;
    trust_score: number;
    recency_score: number;
    mode: string;
  };
}

export interface SearchRequest {
  q: string;
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  query: string;
  total: number;
  results: SemanticSearchResult[];
  mode: string;
  trace_id: string;
  latency_ms: Record<string, number>;
}
