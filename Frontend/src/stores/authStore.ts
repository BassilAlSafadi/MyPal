import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserIdentity } from '../../../shared/contracts/auth/identity';
import { authService } from '@/services/authService';

interface AuthState {
  user: UserIdentity | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => void;
  logout: () => Promise<void>;
  setUser: (user: UserIdentity | null) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      setUser: (user) => set({ user, isAuthenticated: !!user }),

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const user = await authService.signInWithEmail(email, password);
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (err: any) {
          set({ error: err.message || 'Login failed', isLoading: false });
          throw err;
        }
      },

      loginWithGoogle: () => {
        authService.loginWithGoogle();
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          await authService.signOut();
        } finally {
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'mypal-auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
