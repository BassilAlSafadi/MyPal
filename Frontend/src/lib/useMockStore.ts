import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Local-only UI preferences (no backend): recently-viewed products, search
 * history, notification toggles and an in-memory cart. Wallet, wishlist and
 * product data now come from the real backend services — see walletService,
 * wishlistStore and productService.
 */
interface LocalPrefsState {
  // Cart (client-side until checkout)
  cart: { productId: string; quantity: number }[];
  addToCart: (productId: string, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;

  // Recently viewed product ids
  recentViews: string[];
  addToRecentViews: (productId: string) => void;
  clearRecentViews: () => void;

  // Search history
  searchHistory: string[];
  addToSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;

  // Notification preferences
  notifications: {
    priceDropAlerts: boolean;
    orderUpdates: boolean;
    weeklyDeals: boolean;
  };
  updateNotificationPref: (key: keyof LocalPrefsState['notifications'], value: boolean) => void;
}

export const useMockStore = create<LocalPrefsState>()(
  persist(
    (set) => ({
      cart: [],
      addToCart: (productId, quantity = 1) =>
        set((state) => {
          const existing = state.cart.find((item) => item.productId === productId);
          if (existing) {
            return {
              cart: state.cart.map((item) =>
                item.productId === productId
                  ? { ...item, quantity: item.quantity + quantity }
                  : item,
              ),
            };
          }
          return { cart: [...state.cart, { productId, quantity }] };
        }),
      removeFromCart: (productId) =>
        set((state) => ({ cart: state.cart.filter((item) => item.productId !== productId) })),
      updateCartQuantity: (productId, quantity) =>
        set((state) => ({
          cart: state.cart.map((item) =>
            item.productId === productId ? { ...item, quantity } : item,
          ),
        })),
      clearCart: () => set({ cart: [] }),

      recentViews: [],
      addToRecentViews: (productId) =>
        set((state) => {
          const filtered = state.recentViews.filter((id) => id !== productId);
          return { recentViews: [productId, ...filtered].slice(0, 20) };
        }),
      clearRecentViews: () => set({ recentViews: [] }),

      searchHistory: [],
      addToSearchHistory: (query) =>
        set((state) => {
          const filtered = state.searchHistory.filter((q) => q !== query);
          return { searchHistory: [query, ...filtered].slice(0, 10) };
        }),
      clearSearchHistory: () => set({ searchHistory: [] }),

      notifications: {
        priceDropAlerts: true,
        orderUpdates: true,
        weeklyDeals: false,
      },
      updateNotificationPref: (key, value) =>
        set((state) => ({
          notifications: { ...state.notifications, [key]: value },
        })),
    }),
    { name: 'mypal-local-prefs' },
  ),
);
