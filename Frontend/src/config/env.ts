export const env = {
  API_GATEWAY: import.meta.env.VITE_API_GATEWAY || 'http://localhost:8080',
  NODE_ORCHESTRATOR: import.meta.env.VITE_NODE_ORCHESTRATOR || 'http://localhost:5002',
  PRODBERT: import.meta.env.VITE_PRODBERT || 'http://localhost:8001',
  IS_DEV: import.meta.env.DEV,
};

/**
 * Validates that all required environment variables are present.
 * Fails fast in development.
 */
export const validateEnv = () => {
  const required = ['VITE_API_GATEWAY', 'VITE_NODE_ORCHESTRATOR', 'VITE_PRODBERT'];
  const missing = required.filter(key => !import.meta.env[key]);
  
  if (missing.length > 0 && import.meta.env.DEV) {
    console.warn(`[Config] Missing environment variables: ${missing.join(', ')}`);
    console.warn('[Config] Using default localhost values.');
  }
};
