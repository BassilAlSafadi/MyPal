import { create } from "zustand";
import { searchService } from "@/services/search/searchService";

export type SearchMode = "internal" | "global";

export interface SearchResult {
  id: string;
  title: string;
  image: string;
  summary: string;
  source: "internal" | "external";
  price: number;
  sourceName: string;
  trustLabel: string;
  freshness: string;
  destinationUrl?: string;
  badge: "Resident" | "Web Agent";
}

interface SearchState {
  mode: SearchMode;
  query: string;
  isSearching: boolean;
  results: SearchResult[];
  consoleLogs: string[];
  selectedResult: SearchResult | null;
  cancelToken: number;
  setMode: (mode: SearchMode) => void;
  setQuery: (query: string) => void;
  runSearch: () => Promise<void>;
  clearSearch: () => void;
  cancelSearch: () => void;
  selectResult: (result: SearchResult | null) => void;
}

export const useSearchStore = create<SearchState>()((set, get) => ({
  mode: "internal",
  query: "",
  isSearching: false,
  results: [],
  consoleLogs: [],
  selectedResult: null,
  cancelToken: 0,
  setMode: (mode) => set({ mode }),
  setQuery: (query) => set({ query }),
  clearSearch: () => set({ results: [], consoleLogs: [], selectedResult: null }),
  cancelSearch: () => set((state) => ({ isSearching: false, cancelToken: state.cancelToken + 1 })),
  selectResult: (result) => set({ selectedResult: result }),
  runSearch: async () => {
    const { query, mode, cancelToken } = get();
    if (!query.trim()) return;
    set({ isSearching: true, results: [], consoleLogs: [] });

    if (mode === "internal") {
      const response = await searchService.searchInternal(query);
      if (get().cancelToken !== cancelToken) return;
      set({ isSearching: false, results: response.results });
      return;
    }

    for await (const event of searchService.searchGlobal(query)) {
      if (get().cancelToken !== cancelToken) return;
      if (event.type === "log") {
        set((state) => ({ consoleLogs: [...state.consoleLogs, event.message] }));
      } else {
        set({ results: event.results });
      }
    }
    if (get().cancelToken === cancelToken) set({ isSearching: false });
  },
}));
