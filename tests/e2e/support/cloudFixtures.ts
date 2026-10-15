// Fixtures de las pruebas de nube (tests/e2e/cloud). Extienden las fixtures compartidas con el
// Supabase simulado ya instalado en el contexto y con ayudas para entrar con el enlace del correo y
// para abrir un segundo navegador con la misma nube, que es como se prueba el dispositivo único.
import type { Browser, BrowserContext, ConsoleMessage, Page } from '@playwright/test';
import { t } from '@/i18n/es-MX';
import { installFakeSupabase, type FakeSupabaseServer } from './fakeSupabase';
import {
  FAKE_GATEWAY_ORIGIN,
  FAKE_MERCADOPAGO_ORIGIN,
  FAKE_PORTAL_ORIGIN,
  FAKE_SUPABASE_URL,
} from './fakeSupabaseConfig';
import { expect, test as base } from './fixtures';

const FAKE_ORIGINS = [
  FAKE_SUPABASE_URL,
  FAKE_GATEWAY_ORIGIN,
  FAKE_PORTAL_ORIGIN,
  FAKE_MERCADOPAGO_ORIGIN,
];

/**
 * Chromium escribe en la consola una línea "Failed to load resource" por cada respuesta 4xx, y el
 * servidor falso contesta así a propósito en los caminos de falla, como un código incorrecto, el
 * límite de dispositivos o una suscripción activa, porque supabase-js y la app deciden con ese
 * estado. Esa línea la pone el navegador y no la app, así que no cuenta como error. Cualquier otro
 * error de consola o excepción sigue tumbando la prueba, igual que en el resto de las e2e
 */
export function isExpectedResourceError(message: ConsoleMessage): boolean {
  return (
    message.text().startsWith('Failed to load resource') &&
    FAKE_ORIGINS.some((origin) => message.location().url.startsWith(origin))
  );
}

/** Junta los errores de consola de una página. Para las páginas de otros contextos de la misma prueba */
export function watchConsole(page: Page, errors: string[]): void {
  page.on('console', (message) => {
    if (message.type() === 'error' && !isExpectedResourceError(message)) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
}

export const test = base.extend<{ consoleErrors: string[]; cloud: FakeSupabaseServer }>({
  // Sustituye a la fixture compartida con el mismo nombre. Sigue siendo automática, eso lo hereda
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    watchConsole(page, errors);
    await use(errors);
    expect(errors, 'errores en la consola del navegador').toEqual([]);
  },
  // El Supabase simulado de esta prueba. Cada prueba tiene el suyo, con su estado en memoria
  cloud: async ({ context }, use) => {
    await use(await installFakeSupabase(context));
  },
});

export { expect };

/** Inicio con sesión abierta. Es lo primero que se ve al entrar con la cuenta */
export async function expectHome(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 2, name: t.home.reviewsTitle })).toBeVisible({
    timeout: 20_000,
  });
}

/** Si ir de una dirección a otra solo cambiaría el hash, sin cargar otro documento */
function sameDocument(from: string, to: string): boolean {
  try {
    const current = new URL(from);
    const next = new URL(to);
    return (
      current.origin === next.origin &&
      current.pathname === next.pathname &&
      current.search === next.search
    );
  } catch {
    return false;
  }
}

/**
 * Abre el enlace del correo como lo haría el navegador al venir del correo, cargando la página de nuevo.
 * Si la página ya está en la app con la misma ruta, ir directo al enlace solo cambiaría el hash sin
 * recargar nada (navegación en el mismo documento) y Supabase no vería la sesión nueva. Solo entonces
 * pasa antes por about:blank. En los demás casos va directo, porque desde about:blank Chromium a veces
 * pide el ícono de la página anterior con origen null y lo bloquea por ser de loopback, un error de
 * consola que no es de la app
 */
export async function openEmailLink(page: Page, link: string): Promise<void> {
  if (sameDocument(page.url(), link)) await page.goto('about:blank');
  await page.goto(link);
}

/**
 * Entra con el enlace del correo, como quien abre el correo en este mismo navegador. Crea la cuenta
 * en la nube si no existe. El puente de la nube une la cuenta con un perfil local y abre la sesión
 */
export async function enterWithLink(
  page: Page,
  cloud: FakeSupabaseServer,
  email: string,
  alias?: string,
): Promise<void> {
  await openEmailLink(page, cloud.issueMagicLink(email, alias));
  await expectHome(page);
}

/**
 * Aplica las banderas que se prendieron en platform_settings.feature_flags del Supabase simulado, como
 * lo hará Ricardo (B10, 5.4). La app copia las banderas del servidor al abrir, avisa que hay una
 * configuración nueva y con Recargar ahora las aplica
 */
export async function reloadWithServerFlags(page: Page): Promise<void> {
  const reload = page.getByRole('button', { name: t.configUpdate.reload });
  await expect(reload).toBeVisible({ timeout: 20_000 });
  await reload.click();
  await page.waitForLoadState('load');
  await expect(page.getByRole('button', { name: t.configUpdate.reload })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
}

/** Una fecha larga como la escribe la app, en la zona horaria del navegador de la prueba */
export function longDateIn(iso: string | number, timeZone: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  });
}

export interface SecondDevice {
  context: BrowserContext;
  page: Page;
}

/**
 * Otro navegador con la misma nube, con las mismas opciones del proyecto (tamaño, idioma, zona
 * horaria y tema). Sus errores de consola también tumban la prueba. Quien lo abre lo cierra al terminar
 */
export async function openSecondDevice(
  browser: Browser,
  cloud: FakeSupabaseServer,
  consoleErrors: string[],
): Promise<SecondDevice> {
  const use = test.info().project.use;
  const context = await browser.newContext({
    baseURL: use.baseURL,
    viewport: use.viewport,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    userAgent: use.userAgent,
    locale: use.locale,
    timezoneId: use.timezoneId,
    reducedMotion: use.reducedMotion,
    colorScheme: use.colorScheme,
    serviceWorkers: use.serviceWorkers,
  });
  await cloud.attach(context);
  const page = await context.newPage();
  watchConsole(page, consoleErrors);
  return { context, page };
}

/** Hora de reintento como la dice el aviso del límite, HH:MM en la zona horaria del navegador de prueba */
export function retryTimeLabel(retryAt: number, timeZone: string): string {
  // El aviso redondea hacia arriba al minuto (src/i18n/device.ts)
  const rounded = Math.ceil(retryAt / 60_000) * 60_000;
  return new Intl.DateTimeFormat('es-MX', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(rounded));
}
