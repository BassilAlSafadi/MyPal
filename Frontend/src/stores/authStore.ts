import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserIdentity } from '../../../shared/contracts/auth/identity';
import { authService } from '@/services/authService';

export interface PersonaProfile {
  interests: string[];
  categoryAffinity: Record<string, number>;
  aiContextPreferences: string[];
}

interface AuthState {
  user: UserIdentity | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isRestoringSession: boolean;
  error: string | null;
  personaProfile: PersonaProfile | null;
  needsOnboarding: boolean;

  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => void;
  logout: () => Promise<void>;
  setUser: (user: UserIdentity | null) => void;
  setRestoringSession: (v: boolean) => void;
  completeOnboarding: (profile: PersonaProfile) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isRestoringSession: false,
      error: null,
      personaProfile: null,
      needsOnboarding: false,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setRestoringSession: (v) => set({ isRestoringSession: v }),
      completeOnboarding: (profile) => set({ personaProfile: profile, needsOnboarding: false }),

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
          set({ user: null, isAuthenticated: false, isLoading: false, isRestoringSession: false });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'mypal-auth',
      // isRestoringSession is intentionally excluded — it's transient, not persisted
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        personaProfile: state.personaProfile,
        needsOnboarding: state.needsOnboarding,
      }),
    }
  )
);
