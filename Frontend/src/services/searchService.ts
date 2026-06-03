import { apiClient } from '@/api/client';
import { SearchResponse, SemanticSearchResult } from '../../../shared/contracts/search/contracts';

export type SearchModel = 'fast' | 'pro';

// ── Chat thread types ────────────────────────────────────────────────────────

export interface ChatMessage {
  _id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: SearchModel;
  status?: 'pending' | 'done' | 'error';   // pending = Pro workflow still running
  products?: ExternalProduct[];
  internal_products?: Array<{ id: string; title: string; category?: string }>;
  created_at: string;
}

export interface ChatThread {
  _id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages?: ChatMessage[];
}

// ── Feature history types ────────────────────────────────────────────────────

export interface FeatureHistoryItem {
  _id: string;
  feature: string;
  input: Record<string, unknown>;
  output: string;
  created_at: string;
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
      return {
        text: realText(response.result),
        products: Array.isArray(response.products) ? response.products : [],
      };
    }

    // Pro — full agentic deep search
    onProgress('Initializing deep search pipeline...');
    const response = await apiClient.post<any>('/api/v1/ai/deep-search', {
      query,
      internal_products: internalPayload,
    });
    onProgress('Finalizing AI recommendations...');
    return {
      text: realText(response.result ?? response.state?.final_output),
      products: response.state?.product_json?.products || [],
    };
  },

  /**
   * Global Agentic Search — Gemini 2.5 Flash, no Pro quota consumed.
   * Returns a text answer plus any product links found on the web.
   */
  performGlobalAgenticSearch: async (
    query: string,
    onProgress: (log: string) => void,
  ): Promise<{ text: string; products: ExternalProduct[] }> => {
    onProgress('Searching the web...');
    const r = await apiClient.post<{ result: string; products: ExternalProduct[] }>(
      '/api/v1/ai/global-search',
      { query },
    );
    onProgress('Gemini is synthesising results...');
    return {
      text: realText(r.result),
      products: Array.isArray(r.products) ? r.products : [],
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

  // ── Quota ─────────────────────────────────────────────────────────────────
  getDeepSearchQuota: async (): Promise<{ used: number; limit: number; remaining: number; resets_at: string }> => {
    return apiClient.get('/api/v1/ai/deep-search/quota');
  },

  getGlobalSearchQuota: async (): Promise<{ used: number; limit: number; remaining: number; resets_at: string }> => {
    return apiClient.get('/api/v1/ai/global-search/quota');
  },

  // ── Text Translation (notebook Cell 25) ───────────────────────────────────
  translateText: async (text: string, targetLanguage: string): Promise<string> => {
    const r = await apiClient.post<{ result: string }>('/api/v1/ai/translate', {
      text,
      target_language: targetLanguage,
    });
    return r.result || '';
  },

  // ── Text Summary (notebook Cell 27 — CohereSummarizer) ────────────────────
  summarizeText: async (text: string, length: 'short' | 'medium' | 'long' = 'medium'): Promise<string> => {
    const r = await apiClient.post<{ result: string }>('/api/v1/ai/summarize', { text, length });
    return r.result || '';
  },

  // ── Ask AI about product (notebook Cell 30 — ProductExpertAgent) ──────────
  askAboutProduct: async (question: string, productData: Record<string, unknown>, persona?: string): Promise<string> => {
    const r = await apiClient.post<{ result: string }>('/api/v1/ai/product/ask', {
      question,
      product_data: productData,
      persona: persona || 'General shopper',
    });
    return r.result || '';
  },

  // ── Recommendation system (notebook Cell 33 — MyPalProdRecommender) ───────
  getRecommendations: async (persona: string, catalog: Array<{ id: string; title: string; category?: string }>): Promise<string> => {
    const r = await apiClient.post<{ result: string }>('/api/v1/ai/recommend', {
      persona,
      catalog,
    });
    return r.result || '';
  },

  // ── Seller Analytics (notebook Cell 35 — MyPalSellerAnalytics) ────────────
  analyzeSellerPerformance: async (
    products: Array<{ product_name: string; reviews: string[] }>,
  ): Promise<string> => {
    const r = await apiClient.post<{ result: string }>('/api/v1/ai/seller/analyze', { products });
    return r.result || '';
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
    model: SearchModel,
    internalProducts: Array<{ id: string; title: string; category?: string }> = [],
  ): Promise<{ message: ChatMessage; thread_id: string; pending?: boolean }> => {
    return apiClient.post(`/api/v1/ai/threads/${threadId}/messages`, {
      query,
      model,
      internal_products: internalProducts,
    });
  },

  /**
   * Poll a thread for a specific assistant message until its Pro workflow
   * finishes (status flips from "pending" to "done"/"error"). Resolves with the
   * completed message, or the last-seen state if it times out.
   */
  pollThreadMessage: async (
    threadId: string,
    messageId: string,
    { intervalMs = 3000, timeoutMs = 200000 }: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<ChatMessage | null> => {
    const deadline = Date.now() + timeoutMs;
    let last: ChatMessage | null = null;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        const r = await apiClient.get<{ thread: ChatThread }>(`/api/v1/ai/threads/${threadId}`);
        const msg = (r.thread?.messages || []).find((m) => m._id === messageId);
        if (msg) {
          last = msg;
          if (msg.status === 'done' || msg.status === 'error') return msg;
        }
      } catch { /* keep polling through transient errors */ }
    }
    return last;
  },

  // ── Feature history ───────────────────────────────────────────────────────
  getFeatureHistory: async (feature: string): Promise<FeatureHistoryItem[]> => {
    try {
      const r = await apiClient.get<{ history: FeatureHistoryItem[] }>(`/api/v1/ai/history/${feature}`);
      return r.history || [];
    } catch {
      return [];
    }
  },
};
