import { defineConfig, devices } from '@playwright/test';

const PREVIEW_URL = 'http://127.0.0.1:4173';
const PROXY_URL = 'http://127.0.0.1:8787';

// Los navegadores viven dentro del proyecto (PLAYWRIGHT_BROWSERS_PATH=0). Ver scripts/playwright.ts
export default defineConfig({
  testDir: './tests/e2e',
  tsconfig: './tsconfig.tests.json',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: PREVIEW_URL,
    locale: 'es-MX',
    timezoneId: 'America/Merida',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  // Las pruebas corren contra el build de producción, porque el service worker solo existe ahí
  webServer: [
    {
      // El proxy corre forzado en modo simulado para que las pruebas no dependan de una clave
      command: 'node server/src/main.ts --mock',
      url: `${PROXY_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'npm run build && npm run preview',
      url: PREVIEW_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
