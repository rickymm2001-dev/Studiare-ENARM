import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { BRAND } from './src/config/brand.ts';

// Puerto local del proxy de IA. Debe coincidir con server/src/config.ts
const PROXY_TARGET = 'http://127.0.0.1:8787';

// Ruta donde vive la app publicada. En local y con dominio propio es /.
// En GitHub Pages sin dominio propio es /Studiare-ENARM/. La pone el workflow de Pages (D-050)
const BASE_PATH = normalizeBase(process.env.BASE_PATH);

function normalizeBase(value: string | undefined): string {
  const trimmed = (value ?? '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
}

const apiProxy = {
  '/api': { target: PROXY_TARGET, rewrite: (path: string) => path.replace(/^\/api/, '') },
};

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    react(),
    tailwindcss(),
    // Instalación opcional como PWA y modo sin conexión básico (4.11, 14.4)
    VitePWA({
      registerType: 'prompt',
      // El registro lo hace src/app/layout/PwaUpdatePrompt.tsx con useRegisterSW
      injectRegister: false,
      includeAssets: ['favicon-32x32.png', 'favicon-64x64.png', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: BASE_PATH,
        name: BRAND.name,
        short_name: BRAND.shortName,
        description: BRAND.description,
        lang: 'es-MX',
        dir: 'ltr',
        start_url: BASE_PATH,
        scope: BASE_PATH,
        display: 'standalone',
        theme_color: BRAND.themeColor,
        background_color: BRAND.backgroundColor,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // La app completa queda en caché para abrir sin conexión después de la primera carga
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: `${BASE_PATH}index.html`,
        // Las llamadas al proxy de IA nunca se sirven desde caché
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
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
    proxy: apiProxy,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy: apiProxy,
  },
});
