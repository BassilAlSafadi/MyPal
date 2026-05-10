import { create } from 'zustand';
import { searchService } from '@/services/searchService';

export type SearchMode = 'internal' | 'global';

export interface SearchResult {
  id: string;
  title: string;
  price: number;
  image: string;
  source: 'external' | 'marketplace';
  seller: string;
  rating: number;
  url?: string;
  scrapedPrice?: number;
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
        set({ results: results as SearchResult[], isSearching: false });
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
