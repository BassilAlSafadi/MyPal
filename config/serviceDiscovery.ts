/**
 * Centralized Service Discovery Mapping
 */
export const SERVICE_DISCOVERY = {
  GO_GATEWAY: {
    host: 'localhost',
    port: 8080,
    url: process.env.GO_GATEWAY_URL || 'http://localhost:8080',
  },
  GO_SUPPORT: {
    host: 'localhost',
    port: 5001,
    url: process.env.GO_SUPPORT_URL || 'http://localhost:5001',
  },
  NODE_ORCHESTRATOR: {
    host: 'localhost',
    port: 5003,
    url: process.env.NODE_ORCHESTRATOR_URL || 'http://localhost:5003',
  },
  PRODBERT: {
    host: 'localhost',
    port: 8001,
    url: process.env.PRODBERT_URL || 'http://localhost:8001',
  },
  CSHARP_MAIN_API: {
    host: 'localhost',
    port: 5000,
    url: process.env.CSHARP_MAIN_API_URL || 'http://localhost:5000',
  },
};
