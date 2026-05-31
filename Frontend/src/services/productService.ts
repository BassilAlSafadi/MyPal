import { apiClient } from '@/api/client';
import { PRODUCT_IMAGE_FALLBACK } from '@/lib/productImage';

/** UI-facing product shape used by ProductCard, HomeScreen, SearchResults. */
export interface UIProduct {
  id: string;
  title: string;
  price: number;
  image: string;
  rating: number;
  reviewCount: number;
  category?: string;
  description?: string;
  stockQty?: number;
  source: 'marketplace';
  seller: { name: string; isMyPal: boolean };
}

interface RawProduct {
  id: string;
  name: string;
  description?: string;
  category?: string;
  type?: string;
  current_price?: number | string;
  stock_qty?: number;
  rating?: number;
  review_count?: number;
  image?: string | null;
  image_url?: string | null;
  media?: Array<{
    url?: string | null;
    Url?: string | null;
    display_order?: number | null;
    displayOrder?: number | null;
  }>;
  seller?: { name?: string; is_mypal?: boolean };
}

export function mapProduct(p: RawProduct): UIProduct {
  const mediaImage = [...(p.media ?? [])]
    .sort((a, b) => (a.display_order ?? a.displayOrder ?? 0) - (b.display_order ?? b.displayOrder ?? 0))
    .map((m) => m.url ?? m.Url)
    .find(Boolean);

  return {
    id: p.id,
    title: p.name,
    price: Number(p.current_price ?? 0),
    image: p.image || p.image_url || mediaImage || PRODUCT_IMAGE_FALLBACK,
    rating: Number(p.rating ?? 0),
    reviewCount: Number(p.review_count ?? 0),
    category: p.category,
    description: p.description,
    stockQty: p.stock_qty,
    source: 'marketplace',
    seller: { name: p.seller?.name ?? 'MyPal', isMyPal: p.seller?.is_mypal ?? true },
  };
}

export const productService = {
  list: async (params?: { page?: number; pageSize?: number; category?: string }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.pageSize) q.set('pageSize', String(params.pageSize));
    if (params?.category) q.set('category', params.category);
    const suffix = q.toString() ? `?${q}` : '';
    const res = await apiClient.get<{ total: number; products: RawProduct[] }>(
      `/api/v1/products${suffix}`,
    );
    return { total: res.total ?? 0, products: (res.products ?? []).map(mapProduct) };
  },

  get: async (id: string): Promise<UIProduct> =>
    mapProduct(await apiClient.get<RawProduct>(`/api/v1/products/${id}`)),

  create: async (input: {
    name: string;
    description?: string;
    price: number;
    category?: string;
    media: Array<{ url: string; mediaType?: string; displayOrder?: number }>;
  }): Promise<UIProduct> => {
    const raw = await apiClient.post<RawProduct>('/api/v1/products', {
      name: input.name,
      description: input.description,
      category: input.category,
      currentPrice: input.price,
      stockQty: 1,
      media: input.media.map((m, i) => ({
        url: m.url,
        media_type: m.mediaType ?? 'photo',
        display_order: m.displayOrder ?? i,
      })),
    });
    return mapProduct(raw);
  },
};
