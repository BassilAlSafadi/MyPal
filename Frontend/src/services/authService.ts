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
    // Direct redirect to the C# Auth through the Gateway
    window.location.href = `${env.API_GATEWAY}/api/v1/auth/google/login`;
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
    return response.user;
  },

  /**
   * New user registration.
   */
  signUpWithEmail: async (email: string, password: string): Promise<UserIdentity> => {
    const response = await apiClient.post<LoginResponse>('/api/v1/auth/signup', {
      email,
      password,
    });

    tokenStore.set(response.access_token);
    return response.user;
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
