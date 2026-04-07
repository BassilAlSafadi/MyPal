import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  isLoggedIn: boolean;
  phone: string;
  userName: string;
  login: (phone: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      phone: '',
      userName: 'Demo User',
      login: (phone: string) => set({ isLoggedIn: true, phone }),
      logout: () => set({ isLoggedIn: false, phone: '', userName: 'Demo User' }),
    }),
    { name: 'mypal-auth' }
  )
);
