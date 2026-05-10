import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PersonaProfile {
  interests: string[];
  categoryAffinity: Record<string, number>;
  aiContextPreferences: string[];
}

interface User {
  uid: string;
  email: string;
  displayName?: string;
}

interface AuthState {
  user: User | null;
  needsOnboarding: boolean;
  persona: PersonaProfile | null;
  setAuthenticatedUser: (user: User, isNewUser: boolean) => void;
  completeOnboarding: (profile: PersonaProfile) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      needsOnboarding: false,
      persona: null,
      setAuthenticatedUser: (user, isNewUser) => 
        set({ user, needsOnboarding: isNewUser }),
      completeOnboarding: (persona) => 
        set({ persona, needsOnboarding: false }),
      logout: () => set({ user: null, persona: null, needsOnboarding: false }),
    }),
    { name: 'mypal-auth-v2' }
  )
);
