import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5173,
    hmr: {
      overlay: false,
    },
    // Dev/Codespaces: the browser calls the frontend origin with relative paths
    // (the VITE_*_URL vars are empty), and Vite proxies them server-side to the
    // owning microservice. This keeps requests same-origin — no CORS, no port
    // visibility issues, and no localhost-resolves-to-the-laptop problem.
    //
    // The route table mirrors serviceFor() in src/config/env.ts. Vite matches
    // the longest prefix first, so the specific entries win over the generic ones.
    proxy: {
      // messaging :5001
      '/api/v1/ai/threads': { target: 'http://localhost:5001', changeOrigin: true },
      '/api/v1/support': { target: 'http://localhost:5001', changeOrigin: true },

      // ai :5003
      '/api/v1/ai': { target: 'http://localhost:5003', changeOrigin: true },
      '/api/v1/agent': { target: 'http://localhost:5003', changeOrigin: true },
      '/api/v1/seller': { target: 'http://localhost:5003', changeOrigin: true },
      '/api/v1/seller-report': { target: 'http://localhost:5003', changeOrigin: true },

      // auth :5000
      '/api/v1/auth': { target: 'http://localhost:5000', changeOrigin: true },
      '/api/v1/users': { target: 'http://localhost:5000', changeOrigin: true },
      '/api/auth/google': { target: 'http://localhost:5000', changeOrigin: true },

      // payments :5005
      '/api/v1/wallet': { target: 'http://localhost:5005', changeOrigin: true },

      // orders :5004
      '/api/v1/orders': { target: 'http://localhost:5004', changeOrigin: true },
      '/api/v1/cart': { target: 'http://localhost:5004', changeOrigin: true },
      '/api/v1/notifications': { target: 'http://localhost:5004', changeOrigin: true },
      '/api/v1/checkout': { target: 'http://localhost:5004', changeOrigin: true },
      '/api/v1/sagas': { target: 'http://localhost:5004', changeOrigin: true },

      // listings :5002
      '/api/v1/products': { target: 'http://localhost:5002', changeOrigin: true },
      '/api/v1/listings': { target: 'http://localhost:5002', changeOrigin: true },
      '/api/v1/wishlist': { target: 'http://localhost:5002', changeOrigin: true },
      '/api/v1/search': { target: 'http://localhost:5002', changeOrigin: true },

      // Keepalive pings land on auth; the other services are pinged by absolute URL.
      '/health': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client", "@radix-ui/react-tooltip"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
