/**
 * Centralized API Gateway client for the MyPal frontend.
 *
 * All backend requests MUST go through this client â€” never call
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Types
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// In-memory token store (never localStorage)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let _accessToken: string | null = null;

export const tokenStore = {
  set: (token: string) => { _accessToken = token; },
  get: () => _accessToken,
  clear: () => { _accessToken = null; },
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Trace ID generator (client-side)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function generateTraceId(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Core fetch wrapper
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function gatewayFetch<T>(
  path: string,
  options: RequestInit = {},
  retryOnUnauthorized = true,
): Promise<T> {
  const traceId = generateTraceId();
  const url = `${env.API_GATEWAY}${path}`;

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
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return gatewayFetch<T>(path, options, false);
    }
  }

  const body = await parseResponseBody(response);

  if (response.status === 401) {
    tokenStore.clear();
  }

  if (isAPIResponse<T>(body)) {
    if (!response.ok || !body.success) {
      throw new GatewayError(response.status, body.error ?? {
        code: response.status === 401 ? 'UNAUTHORIZED' : 'UNKNOWN',
        message: response.status === 401 ? 'Session expired. Please log in again.' : 'An unknown error occurred',
        trace_id: traceId,
      });
    }

    return body.data as T;
  }

  if (!response.ok) {
    throw new GatewayError(response.status, errorFromRawBody(body, traceId, response.status));
  }

  return body as T;
}

async function refreshAccessToken(): Promise<boolean> {
  const traceId = generateTraceId();

  try {
    const response = await fetch(`${env.API_GATEWAY}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Trace-ID': traceId,
      },
      body: JSON.stringify({}),
      credentials: 'include',
    });

    if (!response.ok) {
      tokenStore.clear();
      return false;
    }

    const body = await parseResponseBody(response);
    const payload = isAPIResponse<{ access_token?: string }>(body)
      ? body.data
      : body as { access_token?: string } | undefined;

    if (!payload?.access_token) {
      tokenStore.clear();
      return false;
    }

    tokenStore.set(payload.access_token);
    return true;
  } catch {
    tokenStore.clear();
    return false;
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Public API surface
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Gateway health check (used in dev tooling)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function checkGatewayHealth(): Promise<boolean> {
  try {
    await fetch(`${env.API_GATEWAY}/health`);
    return true;
  } catch {
    return false;
  }
}
