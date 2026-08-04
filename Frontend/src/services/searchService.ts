import { apiClient } from '@/api/client';
import { SearchResponse, SemanticSearchResult } from '../../../shared/contracts/search/contracts';

// ── Chat thread types ────────────────────────────────────────────────────────
// The AI chat uses a single model (Gemini Flash) — no Fast/Pro selection.

export interface ChatMessage {
  _id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: 'done' | 'error';
  products?: ExternalProduct[];
  internal_products?: Array<{ id: string; title: string; category?: string; image?: string | null }>;
  created_at: string;
}

export interface ChatThread {
  _id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages?: ChatMessage[];
}

export interface ExternalProduct {
  name?: string;
  title?: string;
  price?: number;
  currency?: string;
  source?: string;            // retailer name, e.g. "Amazon"
  source_url?: string | null; // direct retailer link
  thumbnail?: string | null;  // product image
  key_specs?: string[];
  total_cost?: number;
}

export interface AISearchResult {
  text: string;
  products: ExternalProduct[];
}

// The Node orchestrator returns this stub when no LLM API key is configured.
// Treat it as "no answer" so the chat UI falls back to a real product summary.
const MOCK_MARKERS = [
  'mock orchestration output',
  'mock orchestration',
  'need live model/search configuration',
  'mock search result',
  'no tavily key configured',
  'chatcmpl',
];
function realText(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  return MOCK_MARKERS.some((m) => text.toLowerCase().includes(m)) ? '' : text;
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
   * Same call, but surfaces backend degradation instead of swallowing it —
   * `mode` comes back as e.g. "degraded_no_embedding" / "degraded_db_error"
   * when the backend served empty results because something failed, not
   * because there were no matches. Used by the Search screen, which needs to
   * tell "search is broken" apart from "no matches"; performInternalSearch
   * above stays resilient for callers (like the AI chat's RAG context) that
   * should never break on a search hiccup.
   */
  performInternalSearchWithMeta: async (query: string): Promise<{ results: SemanticSearchResult[]; mode: string }> => {
    try {
      const response = await apiClient.get<SearchResponse>(
        `/api/v1/search?q=${encodeURIComponent(query)}`,
      );
      return { results: response.results || [], mode: response.mode || 'hybrid' };
    } catch (error) {
      console.error('[Search] Internal search failed:', error);
      return { results: [], mode: 'error' };
    }
  },

  /**
   * AI search — single model (Gemini Flash). Internal catalog products are
   * passed as RAG context alongside live web results.
   */
  performAISearch: async (
    query: string,
    internalProducts: SemanticSearchResult[] = [],
    onProgress: (log: string) => void = () => {},
  ): Promise<AISearchResult> => {
    const internalPayload = internalProducts.slice(0, 5).map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
    }));

    onProgress('Running AI search...');
    const response = await apiClient.post<any>('/api/v1/ai/fast-search', {
      query,
      internal_products: internalPayload,
    });
    return {
      text: realText(response.result),
      products: Array.isArray(response.products) ? response.products : [],
    };
  },

  // ── Personalized recommendations ────────────────────────────────────────────
  /**
   * Fetches recommendations built from the logged-in user's real activity
   * (search history, wishlist, orders).  Falls back to "popular products"
   * for new users with no recorded activity.
   */
  getPersonalizedRecommendations: async (): Promise<{
    products: Array<{ id: string; title: string; category?: string; price?: number; image?: string | null }>;
    persona: 'personalized' | 'default';
  }> => {
    return apiClient.get('/api/v1/ai/recommend/me');
  },

  // ── Ask AI about product — product-scoped RAG chat (Gemini Flash) ─────────
  askAboutProduct: async (
    question: string,
    productData: Record<string, unknown>,
    persona?: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  ): Promise<string> => {
    const r = await apiClient.post<{ result: string }>('/api/v1/ai/product/ask', {
      question,
      product_data: productData,
      persona: persona || 'General shopper',
      history,
    });
    return realText(r.result);
  },

  // ── Summarize a product's description (Gemini Flash) ──────────────────────
  summarizeProductDescription: async (description: string): Promise<string> => {
    const r = await apiClient.post<{ result: string }>('/api/v1/ai/product/summarize', { description });
    return realText(r.result);
  },

  // ── Translate a product's description into a target language (Gemini Flash) ─
  translateProductDescription: async (description: string, targetLanguage: string): Promise<string> => {
    const r = await apiClient.post<{ result: string }>('/api/v1/ai/product/translate', {
      description,
      target_language: targetLanguage,
    });
    return realText(r.result);
  },

  // ── Chat thread management ───────────────────────────────────────────────
  createThread: async (): Promise<ChatThread> => {
    const r = await apiClient.post<{ thread: ChatThread }>('/api/v1/ai/threads', {});
    return r.thread;
  },

  listThreads: async (): Promise<ChatThread[]> => {
    const r = await apiClient.get<{ threads: ChatThread[] }>('/api/v1/ai/threads');
    return r.threads || [];
  },

  getThread: async (id: string): Promise<ChatThread> => {
    const r = await apiClient.get<{ thread: ChatThread }>(`/api/v1/ai/threads/${id}`);
    return r.thread;
  },

  deleteThread: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/ai/threads/${id}`);
  },

  sendThreadMessage: async (
    threadId: string,
    query: string,
    internalProducts: Array<{ id: string; title: string; category?: string }> = [],
  ): Promise<{ message: ChatMessage; thread_id: string }> => {
    return apiClient.post(`/api/v1/ai/threads/${threadId}/messages`, {
      query,
      internal_products: internalProducts,
    });
  },
};
