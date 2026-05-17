/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_GATEWAY?: string;
  readonly VITE_NODE_ORCHESTRATOR?: string;
  readonly VITE_PRODBERT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.svg';
declare module '*.png';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.gif';
