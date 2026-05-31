import { apiClient } from '@/api/client';

export interface CartItemProduct {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  current_price?: number | string | null;
}

export interface CartItem {
  id: string;
  product_id: string;
  product?: CartItemProduct | null;
  quantity: number;
}

export interface CartResponse {
  cart_id?: string;
  items: CartItem[];
  total: number;
}

export const cartService = {
  get: async (): Promise<CartResponse> =>
    apiClient.get<CartResponse>('/api/v1/cart'),

  addItem: async (productId: string, quantity = 1): Promise<{ ok: boolean }> =>
    apiClient.post<{ ok: boolean }>('/api/v1/cart/items', {
      productId,
      quantity,
    }),

  removeItem: async (productId: string): Promise<{ ok: boolean }> =>
    apiClient.delete<{ ok: boolean }>(`/api/v1/cart/items/${productId}`),
};
