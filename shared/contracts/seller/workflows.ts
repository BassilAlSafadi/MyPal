/**
 * Shared Seller Workflow Contracts
 */

export interface AnalyzeListingRequest {
  title: string;
  description: string;
  category: string;
  price: number;
}

export interface AnalyzeListingResponse {
  is_valid: boolean;
  confidence_score: number;
  suggestions: string[];
  flags: string[];
  trace_id: string;
}

export interface GenerateReportRequest {
  seller_id: string;
  date_range: {
    start: string;
    end: string;
  };
}

export interface GenerateReportResponse {
  report_url: string;
  summary: string;
  trace_id: string;
}
