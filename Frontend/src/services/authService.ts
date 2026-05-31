import { apiClient, tokenStore } from '@/api/client';
import { env } from '@/config/env';
import { UserIdentity, LoginResponse } from '../../../shared/contracts/auth/identity';

/**
 * Authentication Service for MyPal Frontend.
 * 
 * Interacts with the Go Gateway which proxies identity requests to the C# Main API.
 */
export const authService = {
  /**
   * Initiates Google OAuth login flow by redirecting to the Gateway.
   */
  loginWithGoogle: () => {
    // Go directly to the C# API for Google OAuth — bypassing the Supabase proxy.
    // OAuth requires cookies to stay on the same domain throughout the flow
    // (state cookie set on login must be readable on callback). Going through
    // the proxy breaks this because the cookie domain would change.
    const csharpBase = 'https://solly2005-mypal-csharp.hf.space';
    window.location.href = `${csharpBase}/api/auth/google/login`;
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
    return normalizeUser(response.user);
  },

  /**
   * Refreshes the access token using the refresh token.
   */
  refreshToken: async (): Promise<string> => {
    const response = await apiClient.post<{ access_token: string }>('/api/v1/auth/refresh', {});
    tokenStore.set(response.access_token);
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
