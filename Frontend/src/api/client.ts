/**
 * Centralized API client for the MyPal frontend.
 *
 * All backend requests MUST go through this client, so that auth, tracing and
 * error handling stay in one place.
 *
 * The Go gateway that used to front every service is gone: requests are now
 * addressed to the six services directly. `resolveUrl` maps a request path to
 * the service that owns it (see config/env.ts) — callers still pass the same
 * /api/v1/... paths they always did and do not know which service answers.
 *
 * Features:
 * - Per-service base URL resolution from the request path
 * - Automatic Authorization header injection from in-memory token store
 * - X-Trace-ID propagation for distributed observability
 * - Structured typed error handling via APIError
 * - Refresh token flow, always against the auth service
 */

import { resolveUrl, type ServiceName } from '@/config/env';

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

export class APIRequestError extends Error {
  public readonly code: string;
  public readonly traceId?: string;
  public readonly status: number;

  constructor(status: number, error: APIError) {
    super(error.message);
    this.name = 'APIRequestError';
    this.code = error.code;
    this.traceId = error.trace_id;
    this.status = status;
  }
}

// ──────────────────────────────────────────
// In-memory access token store
// ──────────────────────────────────────────

let _accessToken: string | null = null;

export const tokenStore = {
  set: (token: string) => { _accessToken = token; },
  get: () => _accessToken,
  clear: () => { _accessToken = null; },
};

// ──────────────────────────────────────────
// Persistent refresh token store (localStorage)
//
// httpOnly cookies are the ideal storage but the Supabase edge-function
// proxy cannot forward Set-Cookie headers (Deno Fetch API filters them),
// and iOS Safari blocks cross-site cookies regardless of SameSite=None.
// Storing the refresh token here lets every browser/OS survive page reloads.
// The access token remains in-memory only (never persisted).
// ──────────────────────────────────────────

const REFRESH_TOKEN_KEY = 'mypal_rt';

export const refreshTokenStore = {
  set: (token: string) => {
    try { localStorage.setItem(REFRESH_TOKEN_KEY, token); } catch {}
  },
  get: (): string | null => {
    try { return localStorage.getItem(REFRESH_TOKEN_KEY); } catch { return null; }
  },
  clear: () => {
    try { localStorage.removeItem(REFRESH_TOKEN_KEY); } catch {}
  },
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

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retryOnUnauthorized = true,
): Promise<T> {
  const traceId = generateTraceId();
  const url = resolveUrl(path);

  const headers = new Headers(options.headers);
  if (options.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
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

  if (response.status === 401 && retryOnUnauthorized && shouldRefreshOnUnauthorized(path)) {
    const refreshOutcome = await refreshAccessToken();
    if (refreshOutcome === 'ok') {
      return apiFetch<T>(path, options, false);
    }
    if (refreshOutcome === 'soft_fail') {
      // Backend is temporarily down (5xx / network error). Don't propagate the
      // original 401 — that would look like "token rejected" to callers like
      // SessionInitializer and cause a logout. Throw 503 instead so the caller
      // knows the session is still valid but the backend is unreachable.
      throw new APIRequestError(503, {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable, please try again shortly.',
      });
    }
    // hard_fail: token was definitively rejected — fall through and throw the 401
  }

  const body = await parseResponseBody(response);

  if (response.status === 401) {
    tokenStore.clear();
  }

  if (isAPIResponse<T>(body)) {
    if (!response.ok || !body.success) {
      throw new APIRequestError(response.status, body.error ?? {
        code: response.status === 401 ? 'UNAUTHORIZED' : 'UNKNOWN',
        message: response.status === 401 ? 'Session expired. Please log in again.' : 'An unknown error occurred',
        trace_id: traceId,
      });
    }

    return body.data as T;
  }

  if (!response.ok) {
    throw new APIRequestError(response.status, errorFromRawBody(body, traceId, response.status));
  }

  return body as T;
}

type RefreshOutcome = 'ok' | 'hard_fail' | 'soft_fail';

async function refreshAccessToken(): Promise<RefreshOutcome> {
  const traceId = generateTraceId();

  try {
    const storedRefreshToken = refreshTokenStore.get();
    const response = await fetch(resolveUrl('/api/v1/auth/refresh'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Trace-ID': traceId,
      },
      // Send the stored refresh token in the body so mobile browsers that
      // block cross-site cookies (iOS Safari) can still refresh. The server
      // falls back to the httpOnly cookie if the body field is absent.
      body: JSON.stringify(storedRefreshToken ? { refresh_token: storedRefreshToken } : {}),
      credentials: 'include',
    });

    if (!response.ok) {
      tokenStore.clear();
      if (response.status === 401 || response.status === 403) {
        // Server explicitly rejected the token — it is invalid or expired.
        refreshTokenStore.clear();
        return 'hard_fail';
      }
      // 5xx or other: backend is cold-starting or temporarily down.
      // Keep the refresh token — the next attempt will succeed once it's up.
      return 'soft_fail';
    }

    const body = await parseResponseBody(response);
    const payload = isAPIResponse<{ access_token?: string; refresh_token?: string }>(body)
      ? body.data
      : body as { access_token?: string; refresh_token?: string } | undefined;

    if (!payload?.access_token) {
      tokenStore.clear();
      refreshTokenStore.clear();
      return 'hard_fail';
    }

    tokenStore.set(payload.access_token);
    // Persist rotated refresh token so the next reload can also survive.
    if (payload.refresh_token) refreshTokenStore.set(payload.refresh_token);
    return 'ok';
  } catch {
    // Network error (no response at all) — keep the refresh token for the next attempt.
    tokenStore.clear();
    return 'soft_fail';
  }
}

function shouldRefreshOnUnauthorized(path: string): boolean {
  return !path.startsWith('/api/v1/auth/');
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isAPIResponse<T>(body: unknown): body is APIResponse<T> {
  return typeof body === 'object' && body !== null && 'success' in body;
}

function errorFromRawBody(body: unknown, traceId: string, status: number): APIError {
  if (typeof body === 'string' && body.trim()) {
    return { code: statusCodeToErrorCode(status), message: body, trace_id: traceId };
  }

  if (typeof body === 'object' && body !== null) {
    const value = body as Record<string, unknown>;
    const message = value.message ?? value.error ?? value.detail;
    if (typeof message === 'string' && message.trim()) {
      return { code: statusCodeToErrorCode(status), message, trace_id: traceId };
    }
  }

  return {
    code: statusCodeToErrorCode(status),
    message: status === 401 ? 'Session expired. Please log in again.' : 'Request failed',
    trace_id: traceId,
  };
}

function statusCodeToErrorCode(status: number): string {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status >= 500) return 'UPSTREAM_ERROR';
  return 'BAD_REQUEST';
}

// ──────────────────────────────────────────
// Public API surface
// ──────────────────────────────────────────

export const apiClient = {
  get: <T>(path: string, options?: RequestInit) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body: unknown, options?: RequestInit) =>
    apiFetch<T>(path, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    }),

  put: <T>(path: string, body: unknown, options?: RequestInit) =>
    apiFetch<T>(path, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  delete: <T>(path: string, options?: RequestInit) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
};

// ──────────────────────────────────────────
// Service health checks (used in dev tooling)
// ──────────────────────────────────────────

/** Pings one service's /health endpoint. */
export async function checkServiceHealth(service: ServiceName): Promise<boolean> {
  try {
    await fetch(`${SERVICE_HEALTH_PATHS[service]}`);
    return true;
  } catch {
    return false;
  }
}

/** Pings every service and reports which are reachable. */
export async function checkAllServicesHealth(): Promise<Record<ServiceName, boolean>> {
  const services = Object.keys(SERVICE_HEALTH_PATHS) as ServiceName[];
  const results = await Promise.all(services.map(checkServiceHealth));
  return Object.fromEntries(services.map((s, i) => [s, results[i]])) as Record<ServiceName, boolean>;
}

// One representative path per service, resolved through the same routing table
// the request client uses, so health checks follow any base-URL change.
const SERVICE_HEALTH_PATHS: Record<ServiceName, string> = {
  auth: resolveUrl('/api/v1/auth').replace('/api/v1/auth', '/health'),
  listings: resolveUrl('/api/v1/products').replace('/api/v1/products', '/health'),
  orders: resolveUrl('/api/v1/orders').replace('/api/v1/orders', '/health'),
  payments: resolveUrl('/api/v1/wallet').replace('/api/v1/wallet', '/health'),
  ai: resolveUrl('/api/v1/ai').replace('/api/v1/ai', '/health'),
  messaging: resolveUrl('/api/v1/support').replace('/api/v1/support', '/health'),
};
