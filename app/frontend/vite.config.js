import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em desenvolvimento (npm run dev), o proxy replica o roteamento do nginx.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/tickets': { target: 'http://localhost:3001', rewrite: (p) => p.replace(/^\/api/, '') },
      '/api/notifications': { target: 'http://localhost:3002', rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
});
