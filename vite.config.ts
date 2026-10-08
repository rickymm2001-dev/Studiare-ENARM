import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { BRAND } from './src/config/brand.ts';

// Puerto local del proxy de IA. Debe coincidir con server/src/config.ts
const PROXY_TARGET = 'http://127.0.0.1:8787';

// Ruta donde vive la app publicada. En local y con dominio propio es /.
// En GitHub Pages sin dominio propio es /Studiare-ENARM/. La pone el workflow de Pages (D-055)
const BASE_PATH = normalizeBase(process.env.BASE_PATH);

function normalizeBase(value: string | undefined): string {
  const trimmed = (value ?? '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
}

// Workbox copia los patrones al service worker como texto, así que van como RegExp ya armadas
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
        // La app completa queda en caché para abrir sin conexión después de la primera carga. Las
        // fuentes propias (woff2, unos 480 KB) entran para que el diseño no cambie sin conexión
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
        // Las imágenes de los mazos demo (unos 47 MB) y el worker de simulación, que trae los mazos
        // y pesa varios MB, no se precargan. Se guardan la primera vez que se usan (D-053)
        globIgnores: ['demo-media/**', 'assets/simulate.worker-*.js', 'assets/import.worker-*.js'],
        runtimeCaching: [
          {
            urlPattern: new RegExp(`${escapeRegExp(BASE_PATH)}assets/simulate\\.worker-.*\\.js$`),
            handler: 'CacheFirst',
            options: { cacheName: 'simulate-worker', expiration: { maxEntries: 2 } },
          },
          // El importador de mazos, con el motor de SQLite, tampoco se precarga. Se guarda la
          // primera vez que alguien importa un archivo (D-093)
          {
            urlPattern: new RegExp(
              `${escapeRegExp(BASE_PATH)}assets/(import\\.worker-.*\\.js|.*\\.wasm)$`,
            ),
            handler: 'CacheFirst',
            options: { cacheName: 'import-engine', expiration: { maxEntries: 4 } },
          },
          {
            urlPattern: new RegExp(`${escapeRegExp(BASE_PATH)}demo-media/`),
            handler: 'CacheFirst',
            options: {
              cacheName: 'demo-media',
              expiration: { maxEntries: 400 },
            },
          },
        ],
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
