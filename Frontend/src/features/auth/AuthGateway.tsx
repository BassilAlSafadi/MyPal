import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { firebaseAuthService } from "@/services/auth/firebaseAuthService";
import { useAuthStore } from "@/stores/authStore";

const hasNumber = (value: string) => /\d/.test(value);
const hasSpecial = (value: string) => /[^A-Za-z0-9]/.test(value);

export const AuthGateway = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState("");
  const setAuthenticatedUser = useAuthStore((s) => s.setAuthenticatedUser);

  const passwordChecks = useMemo(
    () => ({
      minLength: password.length >= 8,
      hasNumber: hasNumber(password),
      hasSpecial: hasSpecial(password),
    }),
    [password],
  );

  const loginGoogle = async () => {
    setLoading("google");
    setError("");
    try {
      const user = await firebaseAuthService.signInWithGoogle();
      setAuthenticatedUser(user, user.isNewUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google login failed.");
    } finally {
      setLoading(null);
    }
  };

  const loginEmail = async () => {
    setLoading("email");
    setError("");
    try {
      const user = await firebaseAuthService.signInWithEmail(email, password);
      setAuthenticatedUser(user, user.isNewUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Email login failed.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
      <div className="w-full space-y-6 rounded-2xl border bg-white p-6 shadow-sm">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">MyPal AI Search</h1>
          <p className="text-sm text-muted-foreground">Desktop-native orchestration workspace</p>
        </header>

        <Button className="w-full" variant="outline" disabled={loading !== null} onClick={loginGoogle}>
          {loading === "google" ? "Connecting..." : "Continue with Google"}
        </Button>

        <div className="space-y-3">
          <Input placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="space-y-1 text-xs">
            <p className={passwordChecks.minLength ? "text-emerald-600" : "text-slate-500"}>At least 8 characters</p>
            <p className={passwordChecks.hasNumber ? "text-emerald-600" : "text-slate-500"}>Contains one number</p>
            <p className={passwordChecks.hasSpecial ? "text-emerald-600" : "text-slate-500"}>Contains one special character</p>
          </div>
          <Button className="w-full" disabled={loading !== null} onClick={loginEmail}>
            {loading === "email" ? "Signing in..." : "Continue with Email"}
          </Button>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>
      </div>
    </div>
  );
};
