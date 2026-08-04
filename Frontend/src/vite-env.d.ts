/// <reference types="vite/client" />

interface ImportMetaEnv {
  // One base URL per microservice — the single gateway URL is gone.
  readonly VITE_AUTH_URL?: string;
  readonly VITE_LISTINGS_URL?: string;
  readonly VITE_ORDERS_URL?: string;
  readonly VITE_PAYMENTS_URL?: string;
  readonly VITE_AI_URL?: string;
  readonly VITE_MESSAGING_URL?: string;

  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.svg';
declare module '*.png';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.gif';
