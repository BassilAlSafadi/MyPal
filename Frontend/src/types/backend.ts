// Backend-aligned TypeScript interfaces to match Go / C# models

export interface ProductBackend {
  id: string;
  seller_id?: string | null;
  name: string;
  description?: string | null;
  price: number;
  category?: string | null;
  image_url?: string | null;
  stock_quantity?: number | null;
  serial_number?: string | null;
  authenticity_status?: string | null;
  created_at?: string | null; // ISO timestamp
  updated_at?: string | null; // ISO timestamp
}

export interface SellerPerformanceSummaryBackend {
  id: string;
  seller_id?: string | null;
  summary_period_start?: string | null;
  summary_period_end?: string | null;
  ai_generated_summary?: string | null;
  top_complaint_themes?: string[] | null;
  sentiment_score?: number | null;
  grandma_score?: number | null;
  created_at?: string | null;
}
