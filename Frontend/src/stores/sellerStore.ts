import { create } from 'zustand';

export interface SellerPerformanceSummary {
  id: string;
  sellerId: string | null;
  summaryPeriodStart?: string | null;
  summaryPeriodEnd?: string | null;
  aiGeneratedSummary?: string | null;
  topComplaintThemes?: string[] | null;
  sentimentScore?: number | null;
  grandmaScore?: number | null;
  createdAt?: string | null;
}

interface SellerState {
  report: SellerPerformanceSummary | null;
  loading: boolean;
  error: string | null;
  fetchSellerReport: (sellerId: string) => Promise<void>;
}

export const useSellerStore = create<SellerState>((set) => ({
  report: null,
  loading: false,
  error: null,
  fetchSellerReport: async (sellerId: string) => {
    set({ loading: true, error: null });
    try {
      const base = import.meta.env.VITE_ORCHESTRATOR_URL || '';
      const url = `${base}/seller-report/${encodeURIComponent(sellerId)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch failed ${res.status}`);
      const data = await res.json();
      set({ report: data, loading: false });
    } catch (e: any) {
      set({ error: e?.message || String(e), loading: false });
    }
  },
}));
