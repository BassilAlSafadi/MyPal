import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { apiClient, tokenStore, refreshTokenStore, GatewayError } from '@/api/client';

/**
 * Runs once on app mount. If there is a persisted user or refresh token from a
 * previous session, it silently refreshes the access token and re-fetches the
 * full profile so stale in-memory state is updated.
 *
 * Key behaviour:
 * - Sets isRestoringSession=true while the check runs so ProtectedRoute shows
 *   a loading state instead of immediately redirecting to /login.
 * - Only calls logout() when the server explicitly returns 401 (token truly
 *   expired / revoked). Network errors and 5xx (backend cold-starting, HF
 *   space waking up) keep the user logged in with their persisted data.
 */
const SessionInitializer = () => {
  const user                = useAuthStore((s) => s.user);
  const hasHydrated         = useAuthStore((s) => s.hasHydrated);
  const setUser             = useAuthStore((s) => s.setUser);
  const logout              = useAuthStore((s) => s.logout);
  const setRestoringSession = useAuthStore((s) => s.setRestoringSession);
  const ranRef              = useRef(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (ranRef.current) return;
    ranRef.current = true;

    // No persisted user or refresh token: nothing to restore.
    const hasRefreshToken = !!refreshTokenStore.get();
    if (!user && !hasRefreshToken) return;

    // Token already in memory (same-tab navigation) — profile is fresh.
    if (tokenStore.get()) return;

    // Mark session as restoring so ProtectedRoute shows a spinner instead of
    // redirecting to /login during the async check.
    setRestoringSession(true);

    apiClient.get<any>('/api/v1/users/me')
      .then((profile) => {
        setUser({
          id:         profile.id,
          email:      profile.email,
          username:   profile.username ?? profile.email?.split('@')[0] ?? '',
          is_buyer:   profile.is_buyer  ?? true,
          is_seller:  profile.is_seller ?? false,
          roles:      Array.isArray(profile.roles) ? profile.roles : [],
          created_at: profile.created_at ?? user?.created_at ?? new Date().toISOString(),
          updated_at: profile.updated_at ?? user?.updated_at ?? new Date().toISOString(),
        });
      })
      .catch((err) => {
        // Only wipe the session if the server explicitly rejected authentication.
        // Network errors (backend cold-start, HF space waking up, no internet)
        // must NOT log the user out — they should stay on their last screen.
        const isAuthError =
          (err instanceof GatewayError && (err.status === 401 || err.status === 403)) ||
          (typeof err?.status === 'number' && (err.status === 401 || err.status === 403));

        if (isAuthError) {
          tokenStore.clear();
          refreshTokenStore.clear();
          if (user) logout();
        } else if (!user) {
          const fallbackUser = userFromRefreshToken(refreshTokenStore.get());
          if (fallbackUser) setUser(fallbackUser);
        }
        // else: keep persisted user — the backend is just unavailable right now
      })
      .finally(() => {
        setRestoringSession(false);
      });
  }, [hasHydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
};

function userFromRefreshToken(refreshToken: string | null) {
  if (!refreshToken) return null;

  try {
    const payload = decodeJwtPayload(refreshToken);
    const email = typeof payload.email === 'string' ? payload.email : '';

    return {
      id: String(payload.sub || ''),
      email,
      username: email.split('@')[0] || '',
      is_buyer: true,
      is_seller: false,
      roles: ['buyer'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): Record<string, any> {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('Invalid token');

  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return JSON.parse(atob(padded));
}

export default SessionInitializer;
