/**
 * Centralized Service Discovery Mapping
 *
 * Six services, addressed directly. The gateway, the Go support service and the
 * Node orchestrator are gone: auth/listings/orders/payments are C#, ai and
 * messaging are Go.
 */
export const SERVICE_DISCOVERY = {
  AUTH: {
    host: 'localhost',
    port: 5000,
    url: process.env.AUTH_SERVICE_URL || 'http://localhost:5000',
  },
  MESSAGING: {
    host: 'localhost',
    port: 5001,
    url: process.env.MESSAGING_SERVICE_URL || 'http://localhost:5001',
  },
  LISTINGS: {
    host: 'localhost',
    port: 5002,
    url: process.env.LISTINGS_SERVICE_URL || 'http://localhost:5002',
  },
  AI: {
    host: 'localhost',
    port: 5003,
    url: process.env.AI_SERVICE_URL || 'http://localhost:5003',
  },
  ORDERS: {
    host: 'localhost',
    port: 5004,
    url: process.env.ORDERS_SERVICE_URL || 'http://localhost:5004',
  },
  PAYMENTS: {
    host: 'localhost',
    port: 5005,
    url: process.env.PAYMENTS_SERVICE_URL || 'http://localhost:5005',
  },
  PRODBERT: {
    host: 'localhost',
    port: 8001,
    url: process.env.PRODBERT_URL || 'http://localhost:8001',
  },
};
