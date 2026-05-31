export const env = {
  // Empty string means "use relative paths" (Vite dev proxy / same-origin production).
  // On Vercel we set this to the public Render gateway URL.
  API_GATEWAY: import.meta.env.VITE_API_GATEWAY ?? '',
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL ?? '',
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  IS_DEV: import.meta.env.DEV,
};

/**
 * Logs configuration warnings in the browser console without crashing the app.
 * A missing API gateway is valid (falls back to relative paths / local dev proxy).
 */
export const validateEnv = () => {
  if (!env.API_GATEWAY) {
    console.warn('[Config] VITE_API_GATEWAY is not set — API calls will use relative paths.');
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    console.warn('[Config] Supabase env vars missing — image uploads will be disabled.');
  }
};
