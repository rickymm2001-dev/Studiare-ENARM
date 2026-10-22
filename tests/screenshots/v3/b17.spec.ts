// Capturas de cierre de B17, Publicación (8.5 del plan de B17). Quedan en docs/screenshots/v3/b17, en 390, 1280 y 1920
// y en claro y en oscuro (los seis proyectos de playwright.screenshots.v3.config.ts).
//   01 y 02  La portada vacía, como se publica hoy, y con los bloques de prueba del creador y de los testimonios
//            (paquete D). Los bloques entran por la vista previa de localStorage, que solo existe fuera de
//            producción, y llevan siempre la etiqueta Contenido de prueba
//   03 y 04  El aviso de catorce días dentro de la demo y la página de mudanza que la reemplaza (paquete A)
//   05 a 09  Suscripción con la bandera expressWallets apagada, con Apple Pay, sin ninguna billetera, con un pago
//            rechazado y con la prueba activa después de pagar con la billetera (paquete C). Corren contra el
//            build con la nube y el Supabase simulado de las e2e de nube, con la bandera prendida en el servidor
//            simulado y Stripe.js simulado (tests/e2e/support/fakeStripeJs.ts), así que los botones dicen
//            (simulado) y nunca se cobra nada
//   10       El aviso de privacidad en la parte que nombra a Cloudflare, GitHub y Stripe (paquete B)
// Plataforma no cambió en B17 (no hay pantalla ni bandera nuevas para el admin), así que no tiene captura.
// npm run screenshots:v3 -- b17.spec.ts
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as plainTest, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { LANDING_PREVIEW_KEY } from '@/features/landing/previewKey';
import { billingCloudText } from '@/i18n/billingCloud';
import { t } from '@/i18n/es-MX';
import type { LandingCreator, LandingTestimonial } from '@/i18n/landing';
import { movedTexts } from '@/i18n/moved';
import { walletTexts } from '@/i18n/wallet';
import { writeMovedSite } from '../../../scripts/deploy/moved-site';
import {
  enterWithLink,
  expect,
  reloadWithServerFlags,
  test as cloudTest,
} from '../../e2e/support/cloudFixtures';
import { walletCheckoutIdOf } from '../../e2e/support/fakeBilling';
import { fakeStripeJsOf } from '../../e2e/support/fakeStripeJs';
import { CLOUD_PREVIEW_URL } from '../../e2e/support/fakeSupabaseConfig';
import {
  startGithubPagesServer,
  type GithubPagesServer,
} from '../../e2e/support/githubPagesServer';
import { buildApp } from '../../security/buildApp';
import { capture, outDirFor } from './capture';

const B17_DIR = outDirFor('b17');

const text = billingCloudText;

/** Captura la página completa desde arriba. Después de un clic la página queda desplazada */
async function shot(page: Page, name: string, project: string) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await capture(page, B17_DIR, name, project);
}

// ---------------------------------------------------------------------------------------------------------------
// Portada (paquete D)
// ---------------------------------------------------------------------------------------------------------------

const creator: LandingCreator = {
  name: 'Persona de prueba',
  role: 'Rol de prueba, sin ninguna persona real',
  quote: 'Texto de prueba de la cita del creador.',
  photo: { file: 'creador-prueba.webp', alt: 'Retrato de prueba, sin ninguna persona real' },
};
const testimonials: LandingTestimonial[] = [
  {
    quote: 'Texto de prueba del primer testimonio.',
    who: 'Primera persona de prueba',
    permissionOn: '2026-10-01',
  },
  {
    quote: 'Texto de prueba del segundo testimonio, un poco más largo para ver cómo se acomoda.',
    who: 'Segunda persona de prueba',
    permissionOn: '2026-10-02',
  },
];

/**
 * Un retrato de prueba, hecho con el mismo Chromium de la captura. La portada lo pide en public/landing, donde no
 * hay ningún archivo, y la captura lo atiende por la red del navegador. Es una silueta gris y no la foto de nadie
 */
async function serveSamplePhoto(page: Page): Promise<void> {
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(320, 320);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Sin canvas');
    context.fillStyle = '#9aa7b4';
    context.fillRect(0, 0, 320, 320);
    context.fillStyle = '#6b7885';
    context.beginPath();
    context.arc(160, 128, 56, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.ellipse(160, 320, 112, 104, 0, Math.PI, 0);
    context.fill();
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  await page.route('**/landing/creador-prueba.webp', (route) =>
    route.fulfill({ contentType: 'image/webp', body: Buffer.from(base64, 'base64') }),
  );
}

plainTest('B17. Portada vacía y con los bloques de prueba', async ({ page }, info) => {
  plainTest.setTimeout(180_000);
  const project = info.project.name;

  // Como se publica hoy: sin los bloques del creador ni de los testimonios, la portada es la de siempre
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.landing.title);
  await expect(page.getByRole('region', { name: t.landing.pricingTitle })).toBeVisible();
  await expect(page.getByText(t.landing.sampleLabel)).toHaveCount(0);
  await shot(page, '01-portada-vacia', project);

  // Con la vista previa guardada en el navegador, que es como la agencia o Ricardo ven su texto antes de pegarlo
  await serveSamplePhoto(page);
  await page.evaluate(
    ([key, json]) => {
      localStorage.setItem(key, json);
    },
    [LANDING_PREVIEW_KEY, JSON.stringify({ creator, testimonials })] as const,
  );
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.landing.title);
  await expect(page.getByRole('region', { name: t.landing.testimonialsTitle })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(t.landing.sampleLabel).first()).toBeVisible();
  // La foto de prueba ya cargó. Es perezosa (loading lazy): en el teléfono queda lejos de la primera pantalla y no se
  // baja hasta acercarse, así que se lleva a la vista. Una captura con la imagen a medias engaña
  await page.locator('img[src*="/landing/"]').scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const photo = document.querySelector<HTMLImageElement>('img[src*="/landing/"]');
        return photo !== null && photo.complete && photo.naturalWidth > 0;
      }),
    )
    .toBe(true);
  await shot(page, '02-portada-con-bloques-de-prueba', project);
});

// ---------------------------------------------------------------------------------------------------------------
// Mudanza de GitHub Pages (paquete A)
// ---------------------------------------------------------------------------------------------------------------

const PREFIX = '/Studiare-ENARM';
const NEW_ORIGIN = 'https://tudominio.mx';

/** Una captura de página completa de una página que no es la app, sin tocar su política ni esperar a la app */
async function plainShot(page: Page, name: string, project: string) {
  await page.waitForLoadState('networkidle');
  await page.screenshot({
    path: join(B17_DIR, `${name}--${project}.jpg`),
    type: 'jpeg',
    quality: 60,
    fullPage: true,
  });
}

plainTest.describe('B17. Mudanza de la demo de GitHub Pages', () => {
  let builtDir = '';
  let siteRoot = '';
  let demo: GithubPagesServer;
  let moved: GithubPagesServer;

  plainTest.beforeAll(async () => {
    plainTest.setTimeout(480_000);
    // La demo de GitHub Pages catorce días antes, igual que la arma pages.yml: bajo la ruta del repositorio, con
    // las dos variables de la mudanza y con 404.html. La fecha cae dentro de catorce días
    const when = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const moveOn = `${String(when.getFullYear())}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`;
    builtDir = buildApp({
      VITE_APP_ENV: 'demo',
      VITE_SUPABASE_URL: '',
      BASE_PATH: PREFIX,
      VITE_MOVED_TO: NEW_ORIGIN,
      VITE_MOVED_ON: moveOn,
    });
    copyFileSync(join(builtDir, 'index.html'), join(builtDir, '404.html'));
    demo = await startGithubPagesServer(builtDir, PREFIX);
    // Y el sitio que la reemplaza el día de la mudanza
    siteRoot = mkdtempSync(join(tmpdir(), 'enarm-b17-moved-shots-'));
    writeMovedSite(join(siteRoot, 'site'), { movedTo: NEW_ORIGIN, base: PREFIX });
    moved = await startGithubPagesServer(join(siteRoot, 'site'), PREFIX);
  });

  plainTest.afterAll(async () => {
    await demo.close();
    await moved.close();
    for (const folder of [builtDir, siteRoot]) rmSync(folder, { recursive: true, force: true });
  });

  plainTest(
    'B17. Aviso de catorce días arriba de la portada de la demo',
    async ({ page }, info) => {
      plainTest.setTimeout(180_000);
      await page.goto(`${demo.origin}${PREFIX}/`);
      const notice = page.getByRole('region', { name: movedTexts.title });
      await expect(notice).toBeVisible({ timeout: 60_000 });
      await expect(notice).toContainText('Studiare se muda a tudominio.mx el ');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.landing.title);
      // Solo lo que ve la ventana: el aviso va arriba y el resto de la portada ya está en la captura 01
      await capture(page, B17_DIR, '03-aviso-de-mudanza', info.project.name, {
        maxHeight: page.viewportSize()?.height ?? 844,
      });
    },
  );

  plainTest('B17. Página de mudanza que reemplaza a la demo', async ({ page }, info) => {
    plainTest.setTimeout(120_000);
    // La página espera unos segundos antes de llevar a la persona al dominio nuevo. Para la captura no se va:
    // las esperas largas no corren, y si alguna petición llegara a salir, el dominio nuevo no existe y la atiende
    // Playwright
    await page.addInitScript(() => {
      const original = window.setTimeout.bind(window);
      window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
        (delay ?? 0) >= 3000 ? 0 : original(handler, delay, ...args)) as typeof window.setTimeout;
    });
    await page.route(`${NEW_ORIGIN}/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Studiare</title>' }),
    );
    await page.goto(`${moved.origin}${PREFIX}/repasar?ref=ABC`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Studiare cambió de dirección' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'tudominio.mx' })).toBeVisible();
    await plainShot(page, '04-pagina-de-mudanza', info.project.name);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Apple Pay y Google Pay (paquete C)
// ---------------------------------------------------------------------------------------------------------------

cloudTest.describe('Apple Pay y Google Pay', () => {
  cloudTest.use({ baseURL: CLOUD_PREVIEW_URL, serviceWorkers: 'block' });

  cloudTest(
    'B17. Billeteras apagadas, en la forma de pago, sin billeteras, pago rechazado y prueba activa',
    async ({ page, context, cloud }, info) => {
      cloudTest.setTimeout(300_000);
      const project = info.project.name;
      const stripe = fakeStripeJsOf(context);
      if (!stripe) throw new Error('El Stripe.js simulado no está enganchado a este contexto');
      stripe.onWalletPaid = (secret) => {
        cloud.billing.completeCheckout(walletCheckoutIdOf(secret), null);
      };

      // Como se publica hoy: la prueba gratis está, la bandera de las billeteras no, y la forma de pago de la
      // tarjeta es la de siempre, sin ninguna sección de billeteras ni petición a Stripe
      cloud.setFeatureFlags({ expressWallets: false, freeTrial: true, cashPasses: true });
      await enterWithLink(page, cloud, 'ana.b17@ejemplo.mx', 'Ana');
      await reloadWithServerFlags(page);
      await page.goto(SCREENS.subscription.path);
      const monthly = page.getByRole('region', { name: t.billing.plans.monthly, exact: true });
      await monthly.getByRole('button', { name: t.billing.freeTrialCta }).click();
      const wallets = page.getByRole('region', { name: walletTexts.title });
      await expect(
        page.getByRole('radio', { name: new RegExp(text.options.card.label) }),
      ).toBeVisible({ timeout: 60_000 });
      await expect(wallets).toHaveCount(0);
      await shot(page, '05-suscripcion-con-billeteras-apagadas', project);

      // Con la bandera prendida en el servidor simulado
      cloud.setFeatureFlags({ expressWallets: true, freeTrial: true, cashPasses: true });
      await page.reload();
      await reloadWithServerFlags(page);
      await page.goto(SCREENS.subscription.path);
      await monthly.getByRole('button', { name: t.billing.freeTrialCta }).click();
      const apple = page.getByRole('button', { name: 'Suscribirme con Apple Pay (simulado)' });

      // Un aparato con Apple Pay. La forma de pago con el resumen del cobro y, debajo, el botón de un toque
      await expect(apple).toBeVisible({ timeout: 60_000 });
      await shot(page, '06-billeteras-con-prueba', project);

      // Un aparato sin ninguna billetera
      stripe.wallet.wallets = { applePay: false, googlePay: false };
      await page.getByRole('radio', { name: new RegExp(text.options.oxxo.label) }).click();
      await page.getByRole('radio', { name: new RegExp(text.options.card.label) }).click();
      await expect(page.getByText(walletTexts.noWallet)).toBeVisible({ timeout: 30_000 });
      await shot(page, '07-sin-billeteras-en-el-aparato', project);

      // Un pago rechazado se dice sin el texto de Stripe y con la tarjeta a la mano
      stripe.wallet.wallets = { applePay: true, googlePay: false };
      stripe.wallet.confirm = 'declined';
      await page.getByRole('radio', { name: new RegExp(text.options.oxxo.label) }).click();
      await page.getByRole('radio', { name: new RegExp(text.options.card.label) }).click();
      await expect(apple).toBeVisible({ timeout: 30_000 });
      await apple.click();
      await expect(page.getByRole('alert')).toContainText(walletTexts.errors.declined);
      await shot(page, '08-pago-rechazado', project);
      stripe.wallet.confirm = 'ok';

      // Paga con la billetera. Vuelve a Suscripción y la prueba ya empezó, sin cobrar
      await apple.click();
      await expect(page.getByText(text.returning.trialStarted)).toBeVisible({ timeout: 30_000 });
      await expect(wallets).toHaveCount(0);
      await shot(page, '09-prueba-activa-con-billetera', project);
    },
  );
});

// ---------------------------------------------------------------------------------------------------------------
// Aviso de privacidad (paquete B)
// ---------------------------------------------------------------------------------------------------------------

plainTest('B17. Aviso de privacidad con Cloudflare, GitHub y Stripe', async ({ page }, info) => {
  plainTest.setTimeout(120_000);
  await page.goto(SCREENS.privacyNotice.path);
  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.privacyNotice.title }),
  ).toBeVisible();
  // Sin ninguna marca de pendiente a la vista, igual que en B16
  await expect(page.getByRole('main')).not.toContainText(/[[\]{}]|\bpendiente/i);
  // La parte que cambió, la lista de con quién se comparten los datos. El resto del aviso va en docs/legal
  const providers = page.locator('#terceros');
  await expect(providers).toContainText('Cloudflare');
  await expect(providers).toContainText('Stripe');
  await capture(page, B17_DIR, '10-aviso-de-privacidad-proveedores', info.project.name, {
    element: providers,
  });
});
