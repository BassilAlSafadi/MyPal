import { create } from 'zustand';
import { wishlistService } from '@/services/wishlistService';

export interface WishlistItem {
  id: string;            // product id
  title: string;
  price: number;
  image: string;
  source: 'external' | 'marketplace';
  url?: string;
  priceHistory?: number[];
  priceDrop?: boolean;
}

interface WishlistState {
  items: WishlistItem[];
  loaded: boolean;
  load: () => Promise<void>;
  addItem: (item: Omit<WishlistItem, 'id'> & { id?: string }) => void;
  removeItem: (id: string) => void;
  isWishlisted: (id: string) => boolean;
}

/**
 * Wishlist is persisted server-side (GET/POST/DELETE /api/v1/wishlist).
 * Mutations update local state optimistically and sync to the backend
 * best-effort; non-marketplace items (no real product id) simply won't persist.
 */
export const useWishlistStore = create<WishlistState>()((set, get) => ({
  items: [],
  loaded: false,

  load: async () => {
    try {
      const products = await wishlistService.list();
      set({
        items: products.map((p) => ({
          id: p.id,
          title: p.title,
          price: p.price,
          image: p.image,
          source: 'marketplace' as const,
        })),
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  addItem: (item) => {
    const id = item.id ?? '';
    if (!id || get().items.some((i) => i.id === id)) return;
    set((s) => ({ items: [...s.items, { ...item, id }] }));
    wishlistService.add(id).catch(() => {/* external/non-product ids won't persist */});
  },

  removeItem: (id) => {
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    wishlistService.remove(id).catch(() => {/* best-effort */});
  },

  isWishlisted: (id) => get().items.some((i) => i.id === id),
}));
