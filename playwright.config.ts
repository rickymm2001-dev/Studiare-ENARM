import { defineConfig, devices } from '@playwright/test';
import {
  CLOUD_PREVIEW_PORT,
  CLOUD_PREVIEW_URL,
  FAKE_POSTHOG_HOST,
  FAKE_POSTHOG_KEY,
  FAKE_SENTRY_DSN,
  FAKE_SUPABASE_ANON_KEY,
  FAKE_SUPABASE_URL,
} from './tests/e2e/support/fakeSupabaseConfig';
import { FAKE_STRIPE_PUBLISHABLE_KEY } from './tests/e2e/support/fakeStripeJs';
import {
  loopbackUrl,
  mayReuseServer,
  serverStartTimeout,
  testPorts,
} from './server/src/testPorts.ts';

// Puertos de los servidores de prueba. Con PW_PORT_OFFSET se corren juntos para que varias copias del
// repositorio corran Playwright a la vez (tests/e2e/README.md)
const PORTS = testPorts(process.env);
const PREVIEW_URL = loopbackUrl(PORTS.preview);
const PROXY_URL = loopbackUrl(PORTS.proxy);

/** Las pruebas de nube viven aparte y solo corren contra el build con la nube configurada */
const CLOUD_TESTS = /tests[\\/]e2e[\\/]cloud[\\/].*\.spec\.ts$/;

const MOBILE = {
  browserName: 'chromium',
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
} as const;
const DESKTOP = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } };

/**
 * Opciones de los proyectos de nube. El build apunta a un proyecto de Supabase que no existe y un
 * servidor simulado dentro de Playwright atiende sus peticiones (tests/e2e/support/fakeSupabase.ts).
 * El service worker se bloquea para que toda petición pase por ese servidor y no por su caché
 */
const CLOUD = { baseURL: CLOUD_PREVIEW_URL, serviceWorkers: 'block' } as const;

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
    // La interfaz respeta prefers-reduced-motion y deja sus animaciones en un instante. Sin esto axe
    // a veces mide el contraste de una tarjeta a medio aparecer y marca una violación que no existe
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Solo en entornos con un Chromium ya instalado fuera del proyecto, por ejemplo una sesión en
    // la nube. En la computadora de Ricardo no se define y se usa el navegador del proyecto
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  projects: [
    {
      name: 'mobile',
      testIgnore: CLOUD_TESTS,
      use: MOBILE,
    },
    {
      name: 'desktop',
      testIgnore: CLOUD_TESTS,
      use: DESKTOP,
    },
    {
      name: 'cloud-desktop',
      testMatch: CLOUD_TESTS,
      use: { ...DESKTOP, ...CLOUD },
    },
    {
      name: 'cloud-mobile',
      testMatch: CLOUD_TESTS,
      use: { ...MOBILE, ...CLOUD },
    },
  ],
  // Las pruebas corren contra el build de producción, porque el service worker solo existe ahí
  webServer: [
    {
      // El proxy corre forzado en modo simulado para que las pruebas no dependan de una clave. Toma el
      // puerto de PW_PORT_OFFSET, que hereda de este proceso
      command: 'node server/src/main.ts --mock --ephemeral',
      url: `${PROXY_URL}/health`,
      // Nunca reusar un proxy abierto, que podría estar en modo real con clave (D-040)
      reuseExistingServer: false,
      timeout: serverStartTimeout(30_000, PORTS),
    },
    {
      // El puerto de la vista previa lo pone vite.config.ts con el mismo PW_PORT_OFFSET
      command: 'npm run build && npm run preview',
      url: PREVIEW_URL,
      // Fuera del CI se reusa una vista previa abierta solo con los puertos de siempre. Con otro juego
      // nunca, porque podría ser el build de otra copia del repositorio
      reuseExistingServer: mayReuseServer(PORTS, process.env),
      timeout: serverStartTimeout(180_000, PORTS),
    },
    {
      // El mismo build con la nube configurada hacia el proyecto falso, en su propia carpeta y puerto.
      // El escáner de secretos revisa también este build, porque la llave falsa queda dentro de él.
      // Solo este build lleva la llave de PostHog y el DSN de Sentry simulados (B15, 5.3 y 6.4), así las
      // specs de nube comprueban que sin permiso no sale nada. fakeTelemetry.ts atiende los dos
      // orígenes dentro del navegador de la prueba, y los builds sin nube no pueden medir ni reportar.
      // También lleva una llave publicable de Stripe simulada (B17, 6.7), que abre Stripe en la política de
      // este build y deja que wallets.spec.ts pruebe las billeteras con Stripe.js simulado
      // (fakeStripeJs.ts). La bandera expressWallets sigue apagada salvo en esa spec
      name: 'cloud',
      command: `npx vite build --outDir dist-cloud && node scripts/secrets.ts dist-cloud && npx vite preview --outDir dist-cloud --port ${CLOUD_PREVIEW_PORT} --strictPort`,
      env: {
        VITE_SUPABASE_URL: FAKE_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: FAKE_SUPABASE_ANON_KEY,
        VITE_POSTHOG_KEY: FAKE_POSTHOG_KEY,
        VITE_POSTHOG_HOST: FAKE_POSTHOG_HOST,
        VITE_SENTRY_DSN: FAKE_SENTRY_DSN,
        VITE_STRIPE_PUBLISHABLE_KEY: FAKE_STRIPE_PUBLISHABLE_KEY,
      },
      url: CLOUD_PREVIEW_URL,
      reuseExistingServer: mayReuseServer(PORTS, process.env),
      timeout: serverStartTimeout(240_000, PORTS),
    },
  ],
});
