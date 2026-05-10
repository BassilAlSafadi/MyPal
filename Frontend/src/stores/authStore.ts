import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PersonaProfile {
  interests: string[];
  categoryAffinity: Record<string, number>;
  aiContextPreferences: string[];
}

interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  provider: "google" | "email";
}

interface AuthState {
  user: AuthUser | null;
  needsOnboarding: boolean;
  persona: PersonaProfile | null;
  setAuthenticatedUser: (user: AuthUser, isNewUser: boolean) => void;
  completeOnboarding: (persona: PersonaProfile) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      needsOnboarding: false,
      persona: null,
      setAuthenticatedUser: (user, isNewUser) =>
        set({
          user,
          needsOnboarding: isNewUser,
          persona: isNewUser ? null : { interests: ["Productivity"], categoryAffinity: { Productivity: 70 }, aiContextPreferences: ["Value-first results"] },
        }),
      completeOnboarding: (persona) => set({ persona, needsOnboarding: false }),
      logout: () => set({ user: null, needsOnboarding: false, persona: null }),
    }),
    { name: "mypal-auth-v2" },
  ),
);
