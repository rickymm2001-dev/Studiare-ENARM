// Capturas del bloque B0 (D-119). Lo que cambió a la vista es la marca Studiare en la pestaña y la
// portada, y los textos que decían prototipo en Suscripción (pagos simulados) y en Cambiar de rol.
import { expect, test } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { signUp } from '../../e2e/support/fixtures';
import { capture, outDirFor } from './capture';

const OUT_DIR = outDirFor('b0');

test('portada con la marca Studiare', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page).toHaveTitle(t.app.documentTitle(t.landing.documentTitle));
  await capture(page, OUT_DIR, 'portada', info.project.name);
});

test('suscripción simulada y cambiar de rol sin la palabra prototipo', async ({ page }, info) => {
  test.setTimeout(180_000);
  await signUp(page);
  await page.goto(SCREENS.subscription.path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/prototipo/i)).toHaveCount(0);
  await capture(page, OUT_DIR, 'suscripcion', info.project.name);

  await page.goto(SCREENS.roleSelector.path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/prototipo/i)).toHaveCount(0);
  await capture(page, OUT_DIR, 'cambiar-rol', info.project.name);
});
