// Capturas de cierre de fase (15.1 paso 2). Teléfono y escritorio, en modo claro y oscuro.
// Uso: npm run screenshots. Las imágenes quedan en docs/screenshots/fase-<fase>
import { defineConfig, devices } from '@playwright/test';

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

export default defineConfig({
  testDir: './tests/screenshots',
  tsconfig: './tsconfig.tests.json',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: PREVIEW_URL, locale: 'es-MX', timezoneId: 'America/Merida' },
  projects: [
    { name: 'telefono-claro', use: { ...phone, colorScheme: 'light' } },
    { name: 'telefono-oscuro', use: { ...phone, colorScheme: 'dark' } },
    { name: 'escritorio-claro', use: { ...desktop, colorScheme: 'light' } },
    { name: 'escritorio-oscuro', use: { ...desktop, colorScheme: 'dark' } },
  ],
  webServer: [
    {
      command: 'node server/src/main.ts --mock',
      url: `${PROXY_URL}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run build && npm run preview',
      url: PREVIEW_URL,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
