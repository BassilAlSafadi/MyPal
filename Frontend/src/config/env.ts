/**
 * Service endpoints.
 *
 * The SPA used to send everything to one Go gateway. That gateway is gone: the
 * frontend now calls the six microservices directly, so there is a base URL per
 * service instead of a single VITE_API_GATEWAY.
 *
 * Each is optional. An unset value falls back to a relative path, which keeps
 * the Vite dev proxy and any same-origin reverse proxy working unchanged.
 */
export const env = {
  AUTH_URL: import.meta.env.VITE_AUTH_URL ?? '',
  LISTINGS_URL: import.meta.env.VITE_LISTINGS_URL ?? '',
  ORDERS_URL: import.meta.env.VITE_ORDERS_URL ?? '',
  PAYMENTS_URL: import.meta.env.VITE_PAYMENTS_URL ?? '',
  AI_URL: import.meta.env.VITE_AI_URL ?? '',
  MESSAGING_URL: import.meta.env.VITE_MESSAGING_URL ?? '',

  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL ?? '',
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  IS_DEV: import.meta.env.DEV,
};

export type ServiceName = 'auth' | 'listings' | 'orders' | 'payments' | 'ai' | 'messaging';

const SERVICE_URLS: Record<ServiceName, string> = {
  auth: env.AUTH_URL,
  listings: env.LISTINGS_URL,
  orders: env.ORDERS_URL,
  payments: env.PAYMENTS_URL,
  ai: env.AI_URL,
  messaging: env.MESSAGING_URL,
};

/**
 * Routes a request path to the service that owns it.
 *
 * These are the same public /api/v1/... paths the gateway exposed — the routing
 * table simply moved from the gateway into the client. Order matters: the more
 * specific prefixes are tested first (chat threads are messaging's, not the AI
 * service's, even though they share the /api/v1/ai prefix).
 */
const ROUTES: ReadonlyArray<readonly [string, ServiceName]> = [
  // Messaging — persistent conversations and support, before the generic /ai match.
  ['/api/v1/ai/threads', 'messaging'],
  ['/api/v1/support', 'messaging'],

  // AI
  ['/api/v1/ai', 'ai'],
  ['/api/v1/agent', 'ai'],
  ['/api/v1/seller/', 'ai'],
  ['/api/v1/seller-report', 'ai'],

  // Auth
  ['/api/v1/auth', 'auth'],
  ['/api/v1/users', 'auth'],
  ['/api/auth/google', 'auth'],

  // Payments — before /api/v1/orders so wallet paths are unambiguous.
  ['/api/v1/wallet', 'payments'],

  // Orders
  ['/api/v1/orders', 'orders'],
  ['/api/v1/cart', 'orders'],
  ['/api/v1/notifications', 'orders'],
  ['/api/v1/checkout', 'orders'],
  ['/api/v1/sagas', 'orders'],

  // Listings
  ['/api/v1/products', 'listings'],
  ['/api/v1/listings', 'listings'],
  ['/api/v1/wishlist', 'listings'],
  ['/api/v1/search', 'listings'],
];

/** The service that owns a path. Defaults to auth for anything unrecognised. */
export function serviceFor(path: string): ServiceName {
  for (const [prefix, service] of ROUTES) {
    if (path.startsWith(prefix)) return service;
  }
  return 'auth';
}

/** The absolute URL for a request path, or the path itself when unconfigured. */
export function resolveUrl(path: string): string {
  return `${SERVICE_URLS[serviceFor(path)]}${path}`;
}

/**
 * Logs configuration warnings in the browser console without crashing the app.
 * Missing service URLs are valid (they fall back to relative paths / local dev proxy).
 */
export const validateEnv = () => {
  const unset = (Object.keys(SERVICE_URLS) as ServiceName[]).filter((s) => !SERVICE_URLS[s]);
  if (unset.length > 0) {
    console.warn(
      `[Config] No base URL set for: ${unset.join(', ')} — those API calls will use relative paths.`,
    );
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    console.warn('[Config] Supabase env vars missing — image uploads will be disabled.');
  }
};
