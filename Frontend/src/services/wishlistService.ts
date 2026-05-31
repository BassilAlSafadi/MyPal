import { apiClient } from '@/api/client';
import { mapProduct, type UIProduct } from '@/services/productService';

export const wishlistService = {
  list: async (): Promise<UIProduct[]> => {
    const r = await apiClient.get<{ items: any[] }>('/api/v1/wishlist');
    return (r.items ?? []).map(mapProduct);
  },

  add: (productId: string) =>
    apiClient.post<{ ok: boolean }>('/api/v1/wishlist', { product_id: productId }),

  remove: (productId: string) =>
    apiClient.delete<{ ok: boolean }>(`/api/v1/wishlist/${productId}`),
};
