import { apiClient, tokenStore, refreshTokenStore } from '@/api/client';
import { resolveUrl } from '@/config/env';
import { UserIdentity, LoginResponse } from '../../../shared/contracts/auth/identity';

/**
 * Authentication Service for MyPal Frontend.
 */
export const authService = {
  /**
   * Initiates Google OAuth login flow by sending the browser straight to the
   * auth service (never through the Vite proxy or a build-time-baked URL for
   * a different environment) — the state cookie set on login must be
   * readable on callback, so both legs of the redirect need to land on
   * whichever host is actually serving auth for this build.
   */
  loginWithGoogle: () => {
    window.location.href = resolveUrl('/api/auth/google/login');
  },

  /**
   * Traditional email/password login.
   */
  signInWithEmail: async (email: string, password: string): Promise<UserIdentity> => {
    const response = await apiClient.post<LoginResponse>('/api/v1/auth/login', {
      email,
      password,
    });

    tokenStore.set(response.access_token);
    if (response.refresh_token) refreshTokenStore.set(response.refresh_token);
    return normalizeUser(response.user);
  },

  /**
   * New user registration.
   */
  signUpWithEmail: async (
    email: string,
    password: string,
    name: string,
    location?: { country?: string; state?: string; city?: string },
  ): Promise<UserIdentity> => {
    const response = await apiClient.post<LoginResponse>('/api/v1/auth/signup', {
      email,
      password,
      name,
      country: location?.country,
      state: location?.state,
      city: location?.city,
    });

    tokenStore.set(response.access_token);
    if (response.refresh_token) refreshTokenStore.set(response.refresh_token);
    return normalizeUser(response.user);
  },

  /**
   * Refreshes the access token using the refresh token.
   */
  refreshToken: async (): Promise<string> => {
    const storedRefreshToken = refreshTokenStore.get();
    const response = await apiClient.post<{ access_token: string; refresh_token?: string }>(
      '/api/v1/auth/refresh',
      storedRefreshToken ? { refresh_token: storedRefreshToken } : {},
    );
    tokenStore.set(response.access_token);
    if (response.refresh_token) refreshTokenStore.set(response.refresh_token);
    return response.access_token;
  },

  /**
   * Logs out the user and clears tokens.
   */
  signOut: async (): Promise<void> => {
    try {
      await apiClient.post('/api/v1/auth/logout', {});
    } finally {
      tokenStore.clear();
      refreshTokenStore.clear();
    }
  },
};

function normalizeUser(user: UserIdentity | any): UserIdentity {
  const email = user.email ?? '';
  return {
    id: user.id,
    email,
    username: user.username ?? email.split('@')[0] ?? '',
    is_buyer: user.is_buyer ?? user.isBuyer ?? false,
    is_seller: user.is_seller ?? user.isSeller ?? false,
    roles: Array.isArray(user.roles) ? user.roles : [],
    created_at: user.created_at ?? user.createdAt ?? new Date().toISOString(),
    updated_at: user.updated_at ?? user.updatedAt ?? new Date().toISOString(),
  };
}
