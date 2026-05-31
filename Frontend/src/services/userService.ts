import { apiClient } from '@/api/client';

export interface MeProfile {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone?: string | null;
  walletBalance: number | null;
  isBuyer: boolean;
  isSeller: boolean;
  roles: string[];
  createdAt?: string | null;
  // Location — null means not yet collected (e.g. Google signup without onboarding)
  country?: string | null;
  state?: string | null;
  city?: string | null;
}

interface RawMe {
  id: string;
  email: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  wallet_balance?: number | string | null;
  is_buyer?: boolean;
  is_seller?: boolean;
  roles?: string[];
  created_at?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
}

export const userService = {
  getMe: async (): Promise<MeProfile> => {
    const u = await apiClient.get<RawMe>('/api/v1/users/me');
    const first = u.first_name ?? '';
    const last = u.last_name ?? '';
    return {
      id: u.id,
      email: u.email,
      username: u.username ?? u.email?.split('@')[0] ?? '',
      firstName: first,
      lastName: last,
      fullName: `${first} ${last}`.trim() || u.email?.split('@')[0] || 'MyPal User',
      phone: u.phone,
      walletBalance: u.wallet_balance == null ? null : Number(u.wallet_balance),
      isBuyer: u.is_buyer ?? true,
      isSeller: u.is_seller ?? false,
      roles: u.roles ?? [],
      createdAt: u.created_at,
      country: u.country ?? null,
      state:   u.state   ?? null,
      city:    u.city    ?? null,
    };
  },

  /** Update profile fields including country/state/city for post-OAuth onboarding. */
  updateProfile: async (body: {
    country?: string;
    state?: string;
    city?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  }): Promise<MeProfile> => {
    const u = await apiClient.put<RawMe>('/api/v1/users/me', {
      country:    body.country,
      state:      body.state,
      city:       body.city,
      first_name: body.firstName,
      last_name:  body.lastName,
      phone:      body.phone,
    });
    const first = u.first_name ?? '';
    const last  = u.last_name  ?? '';
    return {
      id: u.id,
      email: u.email,
      username: u.username ?? u.email?.split('@')[0] ?? '',
      firstName: first,
      lastName: last,
      fullName: `${first} ${last}`.trim() || u.email?.split('@')[0] || 'MyPal User',
      phone: u.phone,
      walletBalance: u.wallet_balance == null ? null : Number(u.wallet_balance),
      isBuyer: u.is_buyer ?? true,
      isSeller: u.is_seller ?? false,
      roles: u.roles ?? [],
      createdAt: u.created_at,
      country: u.country ?? null,
      state:   u.state   ?? null,
      city:    u.city    ?? null,
    };
  },
};
