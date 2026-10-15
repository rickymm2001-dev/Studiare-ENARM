// Capturas de cierre de B16 del plan del cambio (legal y privacidad, respuestas 42 a 49). El aviso
// de privacidad (versión 2026-10-15b) y los términos (versión 2026-10-15), con la marca de borrador
// para el abogado y sin ninguna marca de pendiente a la vista, y la bienvenida con el resumen del
// aviso y los permisos apagados. Quedan en docs/screenshots/v3/b16. El aviso y los términos van en
// los seis proyectos y la bienvenida en teléfono y computadora, en claro y en oscuro. Del aviso y
// de los términos va solo lo que se ve al abrir, con el título, la marca de borrador y el índice,
// porque la página completa pesa casi 1 MB por imagen y el abogado lee el texto en docs/legal.
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { legalText } from '@/i18n/legal';
import { t } from '@/i18n/es-MX';
import { capture, outDirFor } from './capture';

const OUT_DIR = outDirFor('b16');

/** Lo que se ve al abrir la página, sin página completa */
async function top(page: Page, name: string, project: string) {
  await page.waitForLoadState('networkidle');
  await page.screenshot({
    path: join(OUT_DIR, `${name}--${project}.jpg`),
    type: 'jpeg',
    quality: 60,
  });
}

test('aviso de privacidad y términos, borrador para el abogado', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.goto(SCREENS.privacyNotice.path);
  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.privacyNotice.title }),
  ).toBeVisible();
  await expect(page.getByRole('note')).toContainText(legalText.draftNotice);
  await expect(page.getByRole('main')).not.toContainText(/[[\]{}]|\bpendiente/i);
  await top(page, '01-aviso-de-privacidad', info.project.name);

  await page.goto(SCREENS.terms.path);
  await expect(page.getByRole('heading', { level: 1, name: t.screens.terms.title })).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText(/[[\]{}]|\bpendiente/i);
  await top(page, '02-terminos', info.project.name);
});

test('bienvenida con el resumen del aviso', async ({ page }, info) => {
  // La bienvenida va solo en teléfono y computadora, como lo no clave de B9
  if (info.project.name.startsWith('1920')) return;
  test.setTimeout(120_000);
  await page.goto(SCREENS.onboarding.path);
  await expect(page.getByText(legalText.onboarding.summary)).toBeVisible();
  await capture(page, OUT_DIR, '03-bienvenida', info.project.name);
});
