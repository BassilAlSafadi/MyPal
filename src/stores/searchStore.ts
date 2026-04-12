import { create } from 'zustand';

export interface SearchResult {
  id: string;
  title: string;
  price: number;
  image: string;
  source: 'external' | 'marketplace';
  seller: string;
  rating: number;
  url?: string;
}

interface SearchState {
  query: string;
  results: SearchResult[];
  aiSummary: string;
  isSearching: boolean;
  setQuery: (q: string) => void;
  performSearch: (q: string) => void;
}

const mockExternalResults: SearchResult[] = [
  { id: 'e1', title: 'MacBook Pro 14" M4 Pro', price: 1999, image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=300&h=300&fit=crop', source: 'external', seller: 'Amazon', rating: 4.8, url: 'https://amazon.com' },
  { id: 'e2', title: 'Samsung Galaxy S25 Ultra', price: 1299, image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=300&h=300&fit=crop', source: 'external', seller: 'Best Buy', rating: 4.7, url: 'https://bestbuy.com' },
  { id: 'e3', title: 'iPad Air M3 256GB', price: 799, image: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=300&h=300&fit=crop', source: 'external', seller: 'Apple Store', rating: 4.9, url: 'https://apple.com' },
  { id: 'e4', title: 'Bose QC Ultra Earbuds', price: 299, image: 'https://images.unsplash.com/photo-1590658268037-6bf12f032f55?w=300&h=300&fit=crop', source: 'external', seller: 'Bose Direct', rating: 4.6, url: 'https://bose.com' },
  { id: 'e5', title: 'DJI Mini 4 Pro Drone', price: 759, image: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=300&h=300&fit=crop', source: 'external', seller: 'DJI Store', rating: 4.5, url: 'https://dji.com' },
];

const mockMarketplaceResults: SearchResult[] = [
  { id: 'm1', title: 'Refurbished AirPods Max', price: 349, image: 'https://images.unsplash.com/photo-1625245488600-f03fef636a3c?w=300&h=300&fit=crop', source: 'marketplace', seller: 'TechDeals_NYC', rating: 4.3 },
  { id: 'm2', title: 'Custom Mechanical Keyboard', price: 185, image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=300&h=300&fit=crop', source: 'marketplace', seller: 'KeyCraft_Studio', rating: 4.9 },
  { id: 'm3', title: 'Vintage Polaroid Camera', price: 120, image: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=300&h=300&fit=crop', source: 'marketplace', seller: 'RetroFinds', rating: 4.1 },
];

export const useSearchStore = create<SearchState>()((set) => ({
  query: '',
  results: [],
  aiSummary: '',
  isSearching: false,
  setQuery: (q) => set({ query: q }),
  performSearch: (q) => {
    set({ isSearching: true, query: q });
    setTimeout(() => {
      set({
        isSearching: false,
        results: [...mockExternalResults, ...mockMarketplaceResults],
        aiSummary: `Found ${mockExternalResults.length} external listings and ${mockMarketplaceResults.length} MyPal Marketplace items for "${q}". The best value appears to be the Refurbished AirPods Max at $349 from TechDeals_NYC — 35% below retail. External prices range from $299 to $1,999 across verified retailers.`,
      });
    }, 1500);
  },
}));
