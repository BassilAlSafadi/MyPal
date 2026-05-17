import { apiClient } from '@/api/client';

export interface CheckoutPayload {
  cart_id: string;
  geo_snapshot: {
    lat: number;
    lng: number;
    google_place_id: string;
  };
}

export interface AnalyzeListingPayload {
  listing_id?: string;
  title: string;
  description: string;
  category: string;
  price: number;
}

/**
 * Service to handle agentic orchestration and long-running workflows.
 */
export const workflowService = {
  /**
   * Orchestrates a multi-vendor checkout saga.
   * Returns a parent_order_id and status.
   */
  async startCheckoutSaga(payload: CheckoutPayload): Promise<{ parent_order_id: string; status: string }> {
    const res = await apiClient.post('/api/v1/checkout/orchestrate', payload);
    return res.data;
  },

  /**
   * Polls the status of an ongoing saga (e.g., checkout).
   */
  async pollSagaStatus(sagaId: string): Promise<{ status: string; completed: boolean }> {
    const res = await apiClient.get(`/api/v1/sagas/${sagaId}/status`);
    return res.data;
  },

  /**
   * AI-Assisted listing analysis for sellers.
   */
  async analyzeListing(payload: AnalyzeListingPayload): Promise<any> {
    const res = await apiClient.post('/api/v1/seller/listing/analyze', payload);
    return res.data;
  },

  /**
   * Generates a comprehensive seller performance report via AI.
   */
  async generateSellerReport(sellerId: string): Promise<{ report_url: string; summary: string }> {
    const res = await apiClient.post('/api/v1/seller/report/generate', { seller_id: sellerId });
    return res.data;
  }
};
