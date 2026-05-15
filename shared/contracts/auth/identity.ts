/**
 * Shared Auth Contracts for MyPal
 */

export interface UserIdentity {
  id: string;
  email: string;
  username: string;

  is_buyer: boolean;
  is_seller: boolean;

  roles: string[];

  created_at: string;
  updated_at: string;
}

export interface LoginRequest {
  email: string;
  password?: string; // Optional if using Google
  google_id_token?: string;
}

export interface LoginResponse {
  user: UserIdentity;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface RefreshRequest {
  refresh_token: string;
}
