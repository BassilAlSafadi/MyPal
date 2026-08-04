/**
 * Centralized Environment Schema (Dependency-free)
 *
 * Reflects the six-service topology: three Postgres databases, two Mongo
 * databases, one Redis. There is no single POSTGRES_URL any more — each C#
 * service reads its own service-scoped connection string.
 */
const validateEnv = (config) => {
  const required = [
    'AUTH_POSTGRES_URL',
    'LISTINGS_POSTGRES_URL',
    'ORDERS_POSTGRES_URL',
    'AI_MONGO_URL',
    'MESSAGING_MONGO_URL',
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
  // Service endpoints
  AUTH_SERVICE_URL: getEnv('AUTH_SERVICE_URL', 'http://localhost:5000'),
  MESSAGING_SERVICE_URL: getEnv('MESSAGING_SERVICE_URL', 'http://localhost:5001'),
  LISTINGS_SERVICE_URL: getEnv('LISTINGS_SERVICE_URL', 'http://localhost:5002'),
  AI_SERVICE_URL: getEnv('AI_SERVICE_URL', 'http://localhost:5003'),
  ORDERS_SERVICE_URL: getEnv('ORDERS_SERVICE_URL', 'http://localhost:5004'),
  PAYMENTS_SERVICE_URL: getEnv('PAYMENTS_SERVICE_URL', 'http://localhost:5005'),
  PRODBERT_URL: getEnv('PRODBERT_URL', 'http://localhost:8001'),

  // Postgres — one database per service, orders and payments deliberately share.
  AUTH_POSTGRES_URL: process.env.AUTH_POSTGRES_URL,
  LISTINGS_POSTGRES_URL: process.env.LISTINGS_POSTGRES_URL,
  ORDERS_POSTGRES_URL: process.env.ORDERS_POSTGRES_URL,
  PAYMENTS_POSTGRES_URL: process.env.PAYMENTS_POSTGRES_URL || process.env.ORDERS_POSTGRES_URL,

  // MongoDB — one database per Go service.
  AI_MONGO_URL: process.env.AI_MONGO_URL,
  AI_MONGO_DB: getEnv('AI_MONGO_DB', 'mypal_ai'),
  MESSAGING_MONGO_URL: process.env.MESSAGING_MONGO_URL,
  MESSAGING_MONGO_DB: getEnv('MESSAGING_MONGO_DB', 'mypal_messaging'),

  // Shared 5 hour read cache.
  REDIS_URL: process.env.REDIS_URL,

  JWT_SECRET: process.env.JWT_SECRET,
  INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN,
};

module.exports = {
  validateEnv,
  config,
};
