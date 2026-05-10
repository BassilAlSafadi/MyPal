// Mock Firebase Auth Service for Layer 1 refactor
export const firebaseAuthService = {
  signInWithGoogle: async () => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return {
      uid: "google-123",
      email: "demo@mypal.ai",
      displayName: "Demo User",
      isNewUser: Math.random() > 0.5,
    };
  },
  signInWithEmail: async (email: string, _pass: string) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return {
      uid: "email-123",
      email,
      displayName: email.split("@")[0],
      isNewUser: false,
    };
  },
  signUpWithEmail: async (email: string, _pass: string) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return {
      uid: "email-456",
      email,
      displayName: email.split("@")[0],
      isNewUser: true,
    };
  },
  signOut: async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
  },
};
