const requiredEnvKeys = ['VITE_API_GATEWAY'] as const;

export const env = {
  API_GATEWAY: import.meta.env.VITE_API_GATEWAY ?? '',
  IS_DEV: import.meta.env.DEV,
};

/**
 * Validates that all required environment variables are present.
 * Warns in development where local defaults are useful, and fails fast in production.
 */
export const validateEnv = () => {
  const missing = requiredEnvKeys.filter(key => !import.meta.env[key]);
  
  if (missing.length > 0 && import.meta.env.DEV) {
    console.warn(`[Config] Missing environment variables: ${missing.join(', ')}`);
    console.warn('[Config] Using default localhost values.');
  }

  if (missing.length > 0 && import.meta.env.PROD) {
    throw new Error(`[Config] Missing environment variables: ${missing.join(', ')}`);
  }
};
