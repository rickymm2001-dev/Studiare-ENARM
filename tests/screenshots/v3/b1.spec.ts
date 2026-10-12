// Capturas del bloque B1 (D-119). Lo que cambió a la vista. Suscripción y la portada sin el
// Próximamente del examen completo, y Privacidad con los consentimientos opcionales apagados.
import { expect, test } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { signUp } from '../../e2e/support/fixtures';
import { capture, outDirFor } from './capture';

const OUT_DIR = outDirFor('b1');

test('portada sin el Próximamente del examen completo', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.landing.title);
  await expect(page.getByText(t.billing.comingSoon)).toHaveCount(0);
  await capture(page, OUT_DIR, 'portada', info.project.name);
});

test('suscripción y privacidad', async ({ page }, info) => {
  test.setTimeout(180_000);
  await signUp(page);
  await page.goto(SCREENS.subscription.path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(t.billing.comingSoon)).toHaveCount(0);
  await capture(page, OUT_DIR, 'suscripcion', info.project.name);

  await page.goto(`${SCREENS.settings.path}?seccion=privacy`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  for (const purpose of ['party', 'ai_analysis', 'anonymized_improvement'] as const) {
    await expect(
      page.getByRole('checkbox', { name: t.onboarding.consents[purpose][0] }),
    ).not.toBeChecked();
  }
  await capture(page, OUT_DIR, 'privacidad', info.project.name);
});
