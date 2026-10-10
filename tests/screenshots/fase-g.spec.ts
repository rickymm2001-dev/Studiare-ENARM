// Capturas de cierre de la Fase G (15.1 paso 2). Aviso de privacidad y términos, la configuración del
// admin con su tarjeta de errores del navegador, y Suscripción. Teléfono y escritorio, en claro y
// oscuro. Las imágenes quedan en docs/screenshots/fase-g, en JPEG para no pesar de más. Sin la nube
// configurada, Suscripción muestra el flujo simulado, y la tarjeta de errores dice que necesita la nube.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { adminText } from '@/i18n/admin';
import { signUp } from '../e2e/support/fixtures';

const OUT_DIR = join(import.meta.dirname, '..', '..', 'docs', 'screenshots', 'fase-g');
mkdirSync(OUT_DIR, { recursive: true });

async function capture(page: Page, name: string, projectName: string) {
  await page
    .getByText(t.states.loading.label, { exact: true })
    .waitFor({ state: 'detached' })
    .catch(() => undefined);
  await page.waitForLoadState('networkidle');
  // La barra fija del teléfono sale a media imagen en una captura de página completa
  await page.addStyleTag({
    content: `@media (max-width: 1023px) { nav[aria-label="${t.nav.label}"] { position: static !important; } }`,
  });
  await page.screenshot({
    path: join(OUT_DIR, `${name}--${projectName}.jpg`),
    type: 'jpeg',
    quality: 78,
    fullPage: true,
  });
}

test('aviso de privacidad y términos', async ({ page }, info) => {
  test.setTimeout(120_000);
  for (const [name, path] of [
    ['privacidad', SCREENS.privacyNotice.path],
    ['terminos', SCREENS.terms.path],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await capture(page, name, info.project.name);
  }
});

test('configuración del admin y suscripción', async ({ page }, info) => {
  test.setTimeout(180_000);
  await signUp(page);
  await page.goto(SCREENS.roleSelector.path);
  await page.getByRole('radio', { name: new RegExp(t.roles.names.admin) }).click();
  await page.getByRole('button', { name: t.roles.enterAs(t.roles.names.admin) }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.goto(SCREENS.adminSettings.path);
  await expect(page.getByRole('heading', { name: adminText.clientErrors.title })).toBeVisible();
  await capture(page, 'admin-configuracion', info.project.name);

  await page.goto(SCREENS.subscription.path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await capture(page, 'suscripcion', info.project.name);
});
