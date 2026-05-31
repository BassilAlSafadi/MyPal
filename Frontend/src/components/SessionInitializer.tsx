import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { apiClient, tokenStore } from '@/api/client';

/**
 * Runs once on app mount. If there is a persisted user in the store (from a
 * previous session) it silently refreshes the access token via the httpOnly
 * refresh cookie and re-fetches the full profile. This prevents the "demo
 * user with no data" problem caused by:
 *   1. Token being cleared from memory on page refresh (tokenStore is in-memory)
 *   2. The persisted UserIdentity only having minimal fields (no name, no wallet)
 *
 * If the refresh + profile fetch succeeds the store is updated with fresh data.
 * If it fails (truly expired session) the persisted user is cleared so the
 * user is redirected to login by ProtectedRoute — no stale ghost data.
 */
const SessionInitializer = () => {
  const user    = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout  = useAuthStore((s) => s.logout);
  const ranRef  = useRef(false);

  useEffect(() => {
    if (ranRef.current || !user) return;
    ranRef.current = true;

    // If a token is already in memory (e.g. same-tab navigation) skip.
    if (tokenStore.get()) return;

    // Try to get a fresh token via the httpOnly refresh cookie, then
    // immediately fetch the full profile.
    apiClient.get<any>('/api/v1/users/me')
      .then((profile) => {
        // Profile fetch succeeded (apiClient auto-refreshed the token).
        setUser({
          id:         profile.id,
          email:      profile.email,
          username:   profile.username ?? profile.email?.split('@')[0] ?? '',
          is_buyer:   profile.is_buyer  ?? true,
          is_seller:  profile.is_seller ?? false,
          roles:      Array.isArray(profile.roles) ? profile.roles : [],
          created_at: profile.created_at ?? user.created_at,
          updated_at: profile.updated_at ?? user.updated_at,
        });
      })
      .catch(() => {
        // Both the original call and the automatic token refresh failed.
        // The session is truly expired — clear stale data so ProtectedRoute
        // redirects to login cleanly.
        tokenStore.clear();
        logout();
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
};

export default SessionInitializer;
