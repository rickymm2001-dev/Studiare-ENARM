// Auditoría de interfaz por recorrido (Fase H). Abre cada pantalla con cada rol, en teléfono y en
// escritorio, y le da clic a lo que encuentra para ver si algo falla. No corre en el CI. Uso, npm run
// audit:ui. El informe sale en AUDIT_OUT, por defecto docs/auditoria-2026-10-10/recorrido
import { defineConfig, devices } from '@playwright/test';

const PREVIEW_URL = 'http://127.0.0.1:4173';
const PROXY_URL = 'http://127.0.0.1:8787';

export default defineConfig({
  testDir: './tests/audit',
  tsconfig: './tsconfig.tests.json',
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  timeout: 900_000,
  use: {
    baseURL: PREVIEW_URL,
    locale: 'es-MX',
    timezoneId: 'America/Merida',
    reducedMotion: 'reduce',
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  projects: [
    {
      name: 'telefono',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'escritorio',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: [
    {
      command: 'node server/src/main.ts --mock --ephemeral',
      url: `${PROXY_URL}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // AUDIT_DEV=1 corre contra el servidor de desarrollo, que sí avisa de los problemas de React
      command:
        process.env.AUDIT_DEV === '1'
          ? 'npx vite --host 127.0.0.1 --port 4173 --strictPort'
          : process.env.AUDIT_CLOUD === 'down'
            ? // La nube configurada pero que no responde. La URL tiene la forma de un proyecto de Supabase,
              // porque la app descarta cualquier otra, y ese proyecto no existe, así que nunca contesta
              'VITE_SUPABASE_URL=https://nube-caida-auditoria.supabase.co VITE_SUPABASE_ANON_KEY=sb_publishable_auditoria npm run build && npm run preview'
            : 'npm run build && npm run preview',
      url: PREVIEW_URL,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
