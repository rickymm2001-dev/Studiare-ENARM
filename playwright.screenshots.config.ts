// Capturas de cierre de fase (15.1 paso 2). Teléfono y escritorio, en modo claro y oscuro.
// Uso: npm run screenshots. Las imágenes quedan en docs/screenshots/fase-<fase>
import { defineConfig, devices } from '@playwright/test';
import { loopbackUrl, serverStartTimeout, testPorts } from './server/src/testPorts.ts';

// Puertos de los servidores de prueba. Con PW_PORT_OFFSET se corren juntos para que varias copias del
// repositorio corran Playwright a la vez (tests/e2e/README.md)
const PORTS = testPorts(process.env);
const PREVIEW_URL = loopbackUrl(PORTS.preview);
const PROXY_URL = loopbackUrl(PORTS.proxy);

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
  // Las capturas del plan V3 tienen su propia configuración con tres anchos (npm run screenshots:v3)
  testIgnore: ['**/v3/**'],
  tsconfig: './tsconfig.tests.json',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: PREVIEW_URL,
    locale: 'es-MX',
    timezoneId: 'America/Merida',
    // Ver playwright.config.ts. Solo en entornos con un Chromium instalado fuera del proyecto
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  projects: [
    { name: 'telefono-claro', use: { ...phone, colorScheme: 'light' } },
    { name: 'telefono-oscuro', use: { ...phone, colorScheme: 'dark' } },
    { name: 'escritorio-claro', use: { ...desktop, colorScheme: 'light' } },
    { name: 'escritorio-oscuro', use: { ...desktop, colorScheme: 'dark' } },
  ],
  webServer: [
    {
      command: 'node server/src/main.ts --mock --ephemeral',
      url: `${PROXY_URL}/health`,
      reuseExistingServer: false,
      timeout: serverStartTimeout(30_000, PORTS),
    },
    {
      command: 'npm run build && npm run preview',
      url: PREVIEW_URL,
      reuseExistingServer: false,
      timeout: serverStartTimeout(180_000, PORTS),
    },
  ],
});
