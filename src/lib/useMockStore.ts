import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product } from '@/mock/products';
import type { Transaction } from '@/mock/transactions';
import type { Listing } from '@/mock/listings';
import { mockTransactions } from '@/mock/transactions';
import { mockListings } from '@/mock/listings';

interface MockStoreState {
  // Wishlist
  wishlist: string[];
  addToWishlist: (productId: string) => void;
  removeFromWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  
  // Cart
  cart: { productId: string; quantity: number }[];
  addToCart: (productId: string, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  
  // Recent Views
  recentViews: string[];
  addToRecentViews: (productId: string) => void;
  clearRecentViews: () => void;
  
  // Search History
  searchHistory: string[];
  addToSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;
  
  // Wallet
  balance: number;
  escrow: number;
  transactions: Transaction[];
  addFunds: (amount: number) => void;
  withdraw: (amount: number) => boolean;
  addTransaction: (transaction: Omit<Transaction, 'id'>) => void;
  
  // Listings
  listings: Listing[];
  addListing: (listing: Omit<Listing, 'id' | 'createdAt' | 'views'>) => void;
  updateListing: (id: string, updates: Partial<Listing>) => void;
  deleteListing: (id: string) => void;
  
  // Notification Preferences
  notifications: {
    priceDropAlerts: boolean;
    orderUpdates: boolean;
    weeklyDeals: boolean;
  };
  updateNotificationPref: (key: keyof MockStoreState['notifications'], value: boolean) => void;
}

export const useMockStore = create<MockStoreState>()(
  persist(
    (set, get) => ({
      // Wishlist
      wishlist: [],
      addToWishlist: (productId) => 
        set((state) => ({ 
          wishlist: state.wishlist.includes(productId) 
            ? state.wishlist 
            : [...state.wishlist, productId] 
        })),
      removeFromWishlist: (productId) =>
        set((state) => ({ 
          wishlist: state.wishlist.filter((id) => id !== productId) 
        })),
      isInWishlist: (productId) => get().wishlist.includes(productId),
      
      // Cart
      cart: [],
      addToCart: (productId, quantity = 1) =>
        set((state) => {
          const existing = state.cart.find((item) => item.productId === productId);
          if (existing) {
            return {
              cart: state.cart.map((item) =>
                item.productId === productId
                  ? { ...item, quantity: item.quantity + quantity }
                  : item
              ),
            };
          }
          return { cart: [...state.cart, { productId, quantity }] };
        }),
      removeFromCart: (productId) =>
        set((state) => ({
          cart: state.cart.filter((item) => item.productId !== productId),
        })),
      updateCartQuantity: (productId, quantity) =>
        set((state) => ({
          cart: state.cart.map((item) =>
            item.productId === productId ? { ...item, quantity } : item
          ),
        })),
      clearCart: () => set({ cart: [] }),
      
      // Recent Views
      recentViews: [],
      addToRecentViews: (productId) =>
        set((state) => {
          const filtered = state.recentViews.filter((id) => id !== productId);
          return { recentViews: [productId, ...filtered].slice(0, 20) };
        }),
      clearRecentViews: () => set({ recentViews: [] }),
      
      // Search History
      searchHistory: [],
      addToSearchHistory: (query) =>
        set((state) => {
          const filtered = state.searchHistory.filter((q) => q !== query);
          return { searchHistory: [query, ...filtered].slice(0, 10) };
        }),
      clearSearchHistory: () => set({ searchHistory: [] }),
      
      // Wallet
      balance: 1247.50,
      escrow: 130.00,
      transactions: mockTransactions,
      addFunds: (amount) =>
        set((state) => {
          const newTransaction: Transaction = {
            id: `tx-${Date.now()}`,
            type: 'deposit',
            title: 'Wallet Top-up',
            amount,
            counterparty: 'Card ****0000',
            date: new Date().toISOString().split('T')[0],
            orderId: `DEP-${Date.now()}`,
            status: 'completed',
          };
          return {
            balance: state.balance + amount,
            transactions: [newTransaction, ...state.transactions],
          };
        }),
      withdraw: (amount) => {
        const state = get();
        if (state.balance >= amount) {
          const newTransaction: Transaction = {
            id: `tx-${Date.now()}`,
            type: 'withdrawal',
            title: 'Bank Withdrawal',
            amount: -amount,
            counterparty: 'Bank Account',
            date: new Date().toISOString().split('T')[0],
            orderId: `WTH-${Date.now()}`,
            status: 'completed',
          };
          set({
            balance: state.balance - amount,
            transactions: [newTransaction, ...state.transactions],
          });
          return true;
        }
        return false;
      },
      addTransaction: (transaction) =>
        set((state) => ({
          transactions: [
            { ...transaction, id: `tx-${Date.now()}` },
            ...state.transactions,
          ],
        })),
      
      // Listings
      listings: mockListings,
      addListing: (listing) =>
        set((state) => ({
          listings: [
            {
              ...listing,
              id: `listing-${Date.now()}`,
              createdAt: new Date().toISOString().split('T')[0],
              views: 0,
            },
            ...state.listings,
          ],
        })),
      updateListing: (id, updates) =>
        set((state) => ({
          listings: state.listings.map((l) =>
            l.id === id ? { ...l, ...updates } : l
          ),
        })),
      deleteListing: (id) =>
        set((state) => ({
          listings: state.listings.filter((l) => l.id !== id),
        })),
      
      // Notification Preferences
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
    { name: 'mypal-store' }
  )
);
