import { apiClient } from '@/api/client';

export interface CreateOrderItem {
  productId: string;
  quantity: number;
}

export interface CreateOrderPayload {
  items: CreateOrderItem[];
  paymentMethod?: number;
  walletAmountUsed?: number;
  codAmountDue?: number;
  destinationGooglePlaceId?: string;
  destinationLat?: number;
  destinationLng?: number;
  destinationAddress?: string;
}

export interface OrderResponse {
  id?: string;
  order_id?: string;
  status?: string;
  total_amount?: number | string;
}

export const orderService = {
  create: async (payload: CreateOrderPayload): Promise<OrderResponse> =>
    apiClient.post<OrderResponse>('/api/v1/orders', payload),
};
