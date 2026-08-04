import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { apiClient, tokenStore, refreshTokenStore, APIRequestError } from '@/api/client';

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
        // Explicit logout is the ONLY action that clears the session.
        // A restore-time error — whether 401, 5xx, or network failure — must
        // never evict the user. The refresh flow inside apiClient already
        // tried rotating the token; if that also failed the user will see
        // auth errors on the next real action and can handle it then.
        //
        // Why we don't clear tokens here: clearing the refresh token destroys
        // cross-reload persistence. The user wakes the app, sees a flash of
        // their session, then gets kicked to login — that's the bug we're fixing.
        const isNetworkOrServerError =
          !(err instanceof APIRequestError) ||
          err.status >= 500 ||
          err.status === 0;

        if (!user) {
          // No persisted user at all — try to build one from the refresh token
          // JWT claims so the user isn't stuck on a blank screen.
          const fallbackUser = userFromRefreshToken(refreshTokenStore.get());
          if (fallbackUser) setUser(fallbackUser);
        } else if (!isNetworkOrServerError) {
          // Got a definitive auth rejection (401/403) AND there was already a
          // persisted user. Clear in-memory tokens but keep the user in the
          // store — they can still browse cached data and the next action will
          // prompt a proper re-auth via the refresh flow.
          tokenStore.clear();
        }
        // else: server error / network down — leave everything intact.
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
