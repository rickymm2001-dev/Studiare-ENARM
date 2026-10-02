import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Puerto local del proxy de IA. Debe coincidir con server/src/config.ts
const PROXY_TARGET = 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Solo variables con prefijo VITE_ llegan al cliente. La clave de IA nunca usa ese prefijo
  envPrefix: 'VITE_',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: PROXY_TARGET, rewrite: (path) => path.replace(/^\/api/, '') },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy: {
      '/api': { target: PROXY_TARGET, rewrite: (path) => path.replace(/^\/api/, '') },
    },
  },
});
