import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Check if HTTPS should be enabled (via environment variable)
const enableHTTPS = process.env.VITE_HTTPS === 'true';

// Get backend URL - use network IP if VITE_API_URL is set, otherwise use localhost
// This allows the proxy to work correctly when accessed from mobile devices
// NOTE: This is build-time configuration for development proxy only.
// In production, the frontend uses relative URLs (/api) handled by Nginx.
const getBackendUrl = () => {
  if (process.env.VITE_API_URL) {
    return process.env.VITE_API_URL.replace(/^http:\/\//, '').split('/')[0];
  }
  // Dev-only: localhost fallback for Vite proxy (does not affect production builds)
  return 'localhost:3001';
};

const backendUrl = getBackendUrl();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0", // Listen on all interfaces (allows mobile access)
    port: 8080,
    // Conditionally enable HTTPS for camera access on mobile devices
    // Set VITE_HTTPS=true to enable
    ...(enableHTTPS && {
      https: true,
    }),
    strictPort: false,
    // Proxy API requests to backend
    // Note: If VITE_API_URL is set in .env, the frontend will use it directly instead of proxy
    proxy: {
      '/api': {
        target: `http://${backendUrl}`,
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: `http://${backendUrl}`,
        changeOrigin: true,
        secure: false,
        ws: true, // Enable WebSocket proxying
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
