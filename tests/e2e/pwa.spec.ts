// PWA opcional (4.11). Manifest válido, service worker activo, instalable en localhost
// y apertura sin conexión después de la primera carga (14.4).
import { BRAND } from '@/config/brand';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, test } from './support/fixtures';

interface ManifestIcon {
  src: string;
  sizes: string;
  purpose?: string;
}

test('el manifest declara nombre, idioma, modo y los íconos que pide la instalación', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const response = await request.get(href ?? '');
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as {
    name: string;
    short_name: string;
    lang: string;
    start_url: string;
    display: string;
    icons: ManifestIcon[];
  };
  expect(manifest).toMatchObject({
    name: BRAND.name,
    short_name: BRAND.shortName,
    lang: 'es-MX',
    start_url: '/',
    display: 'standalone',
  });
  const sizes = manifest.icons.map((icon) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    const iconResponse = await request.get(`/${icon.src}`);
    expect(iconResponse.ok(), icon.src).toBe(true);
  }
});

test('el service worker se registra y Chromium la considera instalable', async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return registration.active?.state ?? null;
      }),
    )
    .toBe('activated');

  // Chromium dice por qué una página no se puede instalar. Una lista vacía significa instalable
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: { errorId: string }[];
  };
  expect(installabilityErrors.map((error) => error.errorId)).toEqual([]);
});

test('después de la primera carga abre sin conexión', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Recarga para que el service worker controle la página
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await context.setOffline(true);
  await page.goto(SCREENS.review.path);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.review.title);
  await expect(page.getByText(t.offlineBanner)).toBeVisible();
  await context.setOffline(false);
});
