import { create } from 'zustand';
import { searchService } from '@/services/searchService';
import type { SemanticSearchResult } from '../../../shared/contracts/search/contracts';

export type SearchMode = 'internal' | 'global';

export interface SearchResult extends Partial<SemanticSearchResult> {
  id: string;
  title: string;
  price: number;
  image: string;
  source: 'external' | 'marketplace';
  seller: string;
  rating: number;
}

interface SearchState {
  mode: SearchMode;
  query: string;
  results: SearchResult[];
  isSearching: boolean;
  consoleLogs: string[];
  setMode: (mode: SearchMode) => void;
  setQuery: (q: string) => void;
  runSearch: (q: string) => Promise<void>;
  clearResults: () => void;
}

export const useSearchStore = create<SearchState>()((set, get) => ({
  mode: 'internal',
  query: '',
  results: [],
  isSearching: false,
  consoleLogs: [],
  setMode: (mode) => set({ mode }),
  setQuery: (q) => set({ query: q }),
  clearResults: () => set({ results: [], consoleLogs: [], isSearching: false }),
  runSearch: async (q) => {
    const { mode } = get();
    set({ isSearching: true, query: q, results: [], consoleLogs: [] });
    
    try {
      if (mode === 'internal') {
        const results = await searchService.performInternalSearch(q);
        const mapped = results.map(r => ({
          ...r,
          image: r.image_url || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300&h=300&fit=crop',
          source: 'marketplace',
          seller: 'MyPal Verified',
          rating: 4.5 + Math.random() * 0.5, // placeholder until reviews are joined
        }));
        set({ results: mapped as SearchResult[], isSearching: false });
      } else {
        const results = await searchService.performGlobalAgenticSearch(q, (log) => {
          set((state) => ({ consoleLogs: [...state.consoleLogs, log] }));
        });
        set({ results: results as SearchResult[], isSearching: false });
      }
    } catch (error) {
      set({ isSearching: false, consoleLogs: ['Search failed. Please try again.'] });
    }
  },
}));
