/**
 * Centralized Environment Schema for Node.js Services (Dependency-free)
 */
const validateEnv = (config) => {
  const required = [
    'POSTGRES_URL',
    'MONGO_URI',
    'REDIS_URL',
    'JWT_SECRET',
    'INTERNAL_SERVICE_TOKEN'
  ];
  
  const missing = required.filter(key => !config[key]);
  
  if (missing.length > 0) {
    throw new Error(`[Config] Missing required environment variables: ${missing.join(', ')}`);
  }
  
  return config;
};

const getEnv = (key, fallback) => process.env[key] || fallback;

const config = {
  GO_GATEWAY_URL: getEnv('GO_GATEWAY_URL', 'http://localhost:8080'),
  GO_SUPPORT_URL: getEnv('GO_SUPPORT_URL', 'http://localhost:5001'),
  NODE_ORCHESTRATOR_URL: getEnv('NODE_ORCHESTRATOR_URL', 'http://localhost:5002'),
  PRODBERT_URL: getEnv('PRODBERT_URL', 'http://localhost:8001'),
  CSHARP_MAIN_API_URL: getEnv('CSHARP_MAIN_API_URL', 'http://localhost:5000'),
  
  POSTGRES_URL: process.env.POSTGRES_URL,
  MONGO_URI: process.env.MONGO_URI,
  REDIS_URL: process.env.REDIS_URL,
  
  JWT_SECRET: process.env.JWT_SECRET,
  INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN,
};

module.exports = {
  validateEnv,
  config,
};
