import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface WishlistItem {
  id: string;
  title: string;
  price: number;
  image: string;
  source: 'external' | 'marketplace';
  url?: string;
  priceHistory: number[];
  priceDrop: boolean;
}

interface WishlistState {
  items: WishlistItem[];
  addItem: (item: Omit<WishlistItem, 'id'>) => void;
  removeItem: (id: string) => void;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set) => ({
      items: [
        {
          id: '1',
          title: 'Sony WH-1000XM5 Headphones',
          price: 278.00,
          image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&h=300&fit=crop',
          source: 'external',
          url: 'https://amazon.com',
          priceHistory: [349, 320, 299, 278],
          priceDrop: true,
        },
        {
          id: '2',
          title: 'Vintage Mechanical Keyboard',
          price: 159.99,
          image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=300&h=300&fit=crop',
          source: 'marketplace',
          priceHistory: [159.99, 159.99, 159.99],
          priceDrop: false,
        },
      ],
      addItem: (item) =>
        set((s) => ({
          items: [...s.items, { ...item, id: Date.now().toString() }],
        })),
      removeItem: (id) =>
        set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
    }),
    { name: 'mypal-wishlist' }
  )
);
