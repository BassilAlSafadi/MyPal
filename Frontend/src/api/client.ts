/**
 * Centralized API Gateway client for the MyPal frontend.
 *
 * All backend requests MUST go through this client — never call
 * internal services (C#, Node, Python) directly from the frontend.
 *
 * Features:
 * - All requests routed through the Go Gateway (env.API_GATEWAY)
 * - Automatic Authorization header injection from in-memory token store
 * - X-Trace-ID propagation for distributed observability
 * - Structured typed error handling via APIError
 * - Refresh token flow hook (Phase 2)
 */

import { env } from '@/config/env';

// ──────────────────────────────────────────
// Types
// ──────────────────────────────────────────

export interface APIError {
  code: string;
  message: string;
  trace_id?: string;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: APIError;
}

export class GatewayError extends Error {
  public readonly code: string;
  public readonly traceId?: string;
  public readonly status: number;

  constructor(status: number, error: APIError) {
    super(error.message);
    this.name = 'GatewayError';
    this.code = error.code;
    this.traceId = error.trace_id;
    this.status = status;
  }
}

// ──────────────────────────────────────────
// In-memory token store (never localStorage)
// ──────────────────────────────────────────

let _accessToken: string | null = null;

export const tokenStore = {
  set: (token: string) => { _accessToken = token; },
  get: () => _accessToken,
  clear: () => { _accessToken = null; },
};

// ──────────────────────────────────────────
// Trace ID generator (client-side)
// ──────────────────────────────────────────

function generateTraceId(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ──────────────────────────────────────────
// Core fetch wrapper
// ──────────────────────────────────────────

async function gatewayFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const traceId = generateTraceId();
  const url = `${env.API_GATEWAY}${path}`;

  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('X-Trace-ID', traceId);

  const token = tokenStore.get();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // sends httpOnly refresh cookie
  });

  // Handle 401: hook for refresh token flow (Phase 2 implementation).
  if (response.status === 401) {
    // TODO Phase 2: call /api/v1/auth/refresh, rotate token, retry.
    tokenStore.clear();
    throw new GatewayError(401, {
      code: 'UNAUTHORIZED',
      message: 'Session expired. Please log in again.',
      trace_id: traceId,
    });
  }

  const body: APIResponse<T> = await response.json().catch(() => ({
    success: false,
    error: { code: 'PARSE_ERROR', message: 'Invalid response from gateway', trace_id: traceId },
  }));

  if (!response.ok || !body.success) {
    throw new GatewayError(response.status, body.error ?? {
      code: 'UNKNOWN',
      message: 'An unknown error occurred',
      trace_id: traceId,
    });
  }

  return body.data as T;
}

// ──────────────────────────────────────────
// Public API surface
// ──────────────────────────────────────────

export const apiClient = {
  get: <T>(path: string, options?: RequestInit) =>
    gatewayFetch<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body: unknown, options?: RequestInit) =>
    gatewayFetch<T>(path, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    }),

  put: <T>(path: string, body: unknown, options?: RequestInit) =>
    gatewayFetch<T>(path, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  delete: <T>(path: string, options?: RequestInit) =>
    gatewayFetch<T>(path, { ...options, method: 'DELETE' }),
};

// ──────────────────────────────────────────
// Gateway health check (used in dev tooling)
// ──────────────────────────────────────────

export async function checkGatewayHealth(): Promise<boolean> {
  try {
    await fetch(`${env.API_GATEWAY}/health`);
    return true;
  } catch {
    return false;
  }
}
