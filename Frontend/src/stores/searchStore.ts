import { create } from 'zustand';
import { searchService } from '@/services/searchService';
import { PRODUCT_IMAGE_FALLBACK } from '@/lib/productImage';
import type { SemanticSearchResult } from '../../../shared/contracts/search/contracts';

export interface SearchResult extends Partial<SemanticSearchResult> {
  id: string;
  title: string;
  price: number;
  image: string;
  image_url?: string | null;
  source: 'external' | 'marketplace';
  seller: string;
  rating: number;
  url?: string | null;
  source_url?: string | null;
  description?: string | null;
}

interface SearchState {
  query: string;
  results: SearchResult[];
  isSearching: boolean;
  /** Set when a search actually failed/degraded — distinct from "no matches". */
  error: string | null;
  setQuery: (q: string) => void;
  runSearch: (q: string) => Promise<void>;
  clearResults: () => void;
}

export const useSearchStore = create<SearchState>()((set) => ({
  query: '',
  results: [],
  isSearching: false,
  error: null,
  setQuery: (q) => set({ query: q }),
  clearResults: () => set({ results: [], isSearching: false, error: null }),
  runSearch: async (q) => {
    set({ isSearching: true, query: q, results: [], error: null });

    const { results, mode: searchMode } = await searchService.performInternalSearchWithMeta(q);
    const mapped = results.map(r => ({
      ...r,
      image: r.image_url || PRODUCT_IMAGE_FALLBACK,
      source: 'marketplace',
      seller: 'MyPal Verified',
      rating: 4.5 + Math.random() * 0.5,
    }));
    set({
      results: mapped as SearchResult[],
      isSearching: false,
      error: searchMode.startsWith('degraded_') || searchMode === 'error'
        ? 'Search is temporarily degraded — results may be incomplete. Try again shortly.'
        : null,
    });
  },
}));
