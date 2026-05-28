import { apiClient } from '@/api/client';
import { SearchResponse, SemanticSearchResult } from '../../../shared/contracts/search/contracts';

export type SearchModel = 'fast' | 'pro';

export interface ExternalProduct {
  name?: string;
  title?: string;
  price?: number;
  currency?: string;
  source_url?: string | null;
  key_specs?: string[];
  total_cost?: number;
}

export interface AISearchResult {
  text: string;
  products: ExternalProduct[];
}

export const searchService = {
  /**
   * Internal semantic search against the MyPal product catalog (pgvector + ProdBERT).
   */
  performInternalSearch: async (query: string): Promise<SemanticSearchResult[]> => {
    try {
      const response = await apiClient.get<SearchResponse>(
        `/api/v1/search?q=${encodeURIComponent(query)}`,
      );
      return response.results || [];
    } catch (error) {
      console.error('[Search] Internal search failed:', error);
      return [];
    }
  },

  /**
   * AI search — Fast uses gpt-oss-20b (quick answer), Pro runs the full
   * 14-node agentic pipeline with gpt-4.1 as the final renderer.
   * Internal products from the DB are passed as RAG context to both models.
   */
  performAISearch: async (
    query: string,
    model: SearchModel,
    internalProducts: SemanticSearchResult[] = [],
    onProgress: (log: string) => void = () => {},
  ): Promise<AISearchResult> => {
    const internalPayload = internalProducts.slice(0, 5).map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
    }));

    if (model === 'fast') {
      onProgress('Running fast search...');
      const response = await apiClient.post<any>('/api/v1/ai/fast-search', {
        query,
        internal_products: internalPayload,
      });
      return { text: response.result || '', products: [] };
    }

    // Pro — full agentic deep search
    onProgress('Initializing deep search pipeline...');
    const response = await apiClient.post<any>('/api/v1/ai/deep-search', {
      query,
      internal_products: internalPayload,
    });
    onProgress('Finalizing AI recommendations...');
    return {
      text: response.result || response.state?.final_output || '',
      products: response.state?.product_json?.products || [],
    };
  },

  /** @deprecated Use performAISearch instead. */
  performGlobalAgenticSearch: async (
    query: string,
    onProgress: (log: string) => void,
  ): Promise<any[]> => {
    const result = await searchService.performAISearch(query, 'pro', [], onProgress);
    return result.products;
  },
};
