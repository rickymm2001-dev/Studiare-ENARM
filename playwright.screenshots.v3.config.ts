// Capturas de cierre de cada bloque del plan del cambio V3 (0.3 del plan, paso 2). Teléfono de 390 px,
// computadora de 1280 px y pantalla ancha de 1920 px, en claro y en oscuro. Las imágenes quedan en
// docs/screenshots/v3/<bloque>. Uso: npm run screenshots:v3
import { defineConfig, devices } from '@playwright/test';
import {
  CLOUD_PREVIEW_PORT,
  CLOUD_PREVIEW_URL,
  FAKE_SUPABASE_ANON_KEY,
  FAKE_SUPABASE_URL,
} from './tests/e2e/support/fakeSupabaseConfig';

const PREVIEW_URL = 'http://127.0.0.1:4173';
const PROXY_URL = 'http://127.0.0.1:8787';

const phone = {
  browserName: 'chromium' as const,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
};
const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } };
const wide = { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } };

export default defineConfig({
  testDir: './tests/screenshots/v3',
  tsconfig: './tsconfig.tests.json',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: PREVIEW_URL,
    locale: 'es-MX',
    timezoneId: 'America/Merida',
    reducedMotion: 'reduce',
    // Ver playwright.config.ts. Solo en entornos con un Chromium instalado fuera del proyecto
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  projects: [
    { name: '390-claro', use: { ...phone, colorScheme: 'light' } },
    { name: '390-oscuro', use: { ...phone, colorScheme: 'dark' } },
    { name: '1280-claro', use: { ...desktop, colorScheme: 'light' } },
    { name: '1280-oscuro', use: { ...desktop, colorScheme: 'dark' } },
    { name: '1920-claro', use: { ...wide, colorScheme: 'light' } },
    { name: '1920-oscuro', use: { ...wide, colorScheme: 'dark' } },
  ],
  webServer: [
    {
      command: 'node server/src/main.ts --mock --ephemeral',
      url: `${PROXY_URL}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run build && npm run preview',
      url: PREVIEW_URL,
      // Nunca reusar una vista previa abierta, que podría ser de una compilación anterior
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      // El mismo build con la nube hacia el Supabase simulado de las e2e de nube, como en
      // playwright.config.ts. Lo usan las capturas de Party en la nube (b7.spec.ts)
      name: 'cloud',
      command: `npx vite build --outDir dist-cloud && node scripts/secrets.ts dist-cloud && npx vite preview --outDir dist-cloud --port ${CLOUD_PREVIEW_PORT} --strictPort`,
      env: {
        VITE_SUPABASE_URL: FAKE_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: FAKE_SUPABASE_ANON_KEY,
      },
      url: CLOUD_PREVIEW_URL,
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
