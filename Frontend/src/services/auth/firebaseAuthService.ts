export interface AuthResponse {
  id: string;
  email: string;
  displayName: string;
  provider: "google" | "email";
  isNewUser: boolean;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const validatePassword = (password: string) =>
  password.length >= 8 && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);

export const firebaseAuthService = {
  async signInWithGoogle(): Promise<AuthResponse> {
    await wait(700);
    return {
      id: "google-user-1",
      email: "alex@mypal.ai",
      displayName: "Alex Mercer",
      provider: "google",
      isNewUser: true,
    };
  },
  async signInWithEmail(email: string, password: string): Promise<AuthResponse> {
    await wait(600);
    if (!email.includes("@")) throw new Error("Please enter a valid email address.");
    if (!validatePassword(password)) throw new Error("Password must include at least 8 chars, 1 number, and 1 special character.");
    return {
      id: "email-user-1",
      email,
      displayName: email.split("@")[0],
      provider: "email",
      isNewUser: false,
    };
  },
};
