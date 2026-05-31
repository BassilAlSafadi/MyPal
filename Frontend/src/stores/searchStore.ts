import { create } from 'zustand';
import { searchService, type ExternalProduct } from '@/services/searchService';
import { PRODUCT_IMAGE_FALLBACK } from '@/lib/productImage';
import type { SemanticSearchResult } from '../../../shared/contracts/search/contracts';

export type SearchMode = 'internal' | 'global';

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

/**
 * The agentic backend returns raw `ExternalProduct` records (thumbnail/name/
 * source_url). Map them onto the card-friendly SearchResult shape so the web
 * finding's photo (and link) actually render instead of an empty box.
 */
function mapExternalResult(p: ExternalProduct, i: number): SearchResult {
  const price = Number(p.total_cost ?? p.price ?? 0);
  return {
    id: p.source_url || `agentic-${i}-${p.name ?? p.title ?? 'item'}`,
    title: p.name || p.title || 'External product',
    price: Number.isFinite(price) ? price : 0,
    image: p.thumbnail?.trim() || '',
    source: 'external',
    seller: p.source || 'External seller',
    rating: 0,
    url: p.source_url ?? null,
    source_url: p.source_url ?? null,
    description: p.key_specs?.length ? p.key_specs.join('\n') : null,
  };
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
          image: r.image_url || PRODUCT_IMAGE_FALLBACK,
          source: 'marketplace',
          seller: 'MyPal Verified',
          rating: 4.5 + Math.random() * 0.5, // placeholder until reviews are joined
        }));
        set({ results: mapped as SearchResult[], isSearching: false });
      } else {
        const products = await searchService.performGlobalAgenticSearch(q, (log) => {
          set((state) => ({ consoleLogs: [...state.consoleLogs, log] }));
        });
        set({ results: products.map(mapExternalResult), isSearching: false });
      }
    } catch (error) {
      set({ isSearching: false, consoleLogs: ['Search failed. Please try again.'] });
    }
  },
}));
