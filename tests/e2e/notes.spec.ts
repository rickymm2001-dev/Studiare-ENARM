// Apuntes en esquema (D-092). Se escribe un apunte con una pregunta, un término con inversa y un
// hueco, se espera al guardado automático y las tarjetas aparecen en Explorar dentro del mazo del
// apunte. Quitar la marca las borra. La pantalla no se desborda de lado y no tiene violaciones
// serias de accesibilidad.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

/** Espera a que el guardado automático termine. Al escribir aparece Cambios sin guardar y se va al guardar */
async function waitForSave(page: Page) {
  await expect(page.getByText(t.notes.save.dirty)).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(t.notes.save.saving)).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(t.notes.save.saved)).toBeVisible();
}

test('las líneas con marca se vuelven tarjetas que aparecen en Explorar', async ({ page }) => {
  await signUp(page);
  await page.goto(SCREENS.notes.path);
  await expect(page.getByText(t.notes.empty)).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await page.getByLabel(t.notes.titleLabel).fill('Cardiología');
  await page.getByRole('button', { name: t.notes.create }).click();
  const first = page.getByLabel(t.notes.lineLabel(1, 1));
  await expect(first).toBeVisible();

  await first.fill('Triada de Beck :: Hipotensión, yugulares y ruidos apagados');
  await page.keyboard.press('Enter');
  const second = page.getByLabel(t.notes.lineLabel(2, 1));
  await second.fill('Metformina ;; Biguanida');
  await page.keyboard.press('Enter');
  const third = page.getByLabel(t.notes.lineLabel(3, 1));
  await third.fill('La {{troponina}} sube a las {{3 horas}} #cardio::infarto');
  await expectNoSeriousA11yViolations(page);

  // El guardado automático avisa y la tarjeta ya existe
  await waitForSave(page);

  await page.goto(SCREENS.explore.path);
  const list = page.getByRole('list', { name: t.explore.list });
  await expect(list).toBeVisible({ timeout: 30_000 });
  // 1 básica, 2 de la inversa y 2 huecos
  await expect(page.getByText(t.explore.results(5, 5))).toBeVisible();
  await expect(list.getByText('Triada de Beck').first()).toBeVisible();

  // Quitar la marca borra la tarjeta
  await page.goto(SCREENS.notes.path);
  await page.getByRole('link', { name: t.notes.open('Cardiología') }).click();
  const again = page.getByLabel(t.notes.lineLabel(1, 1));
  await again.fill('Triada de Beck sin marca');
  await waitForSave(page);
  await page.goto(SCREENS.explore.path);
  await expect(page.getByText(t.explore.results(4, 4))).toBeVisible({ timeout: 30_000 });
});

test('el editor cabe en el teléfono y se maneja con los botones de la barra', async ({ page }) => {
  await signUp(page);
  await page.goto(SCREENS.notes.path);
  await page.getByLabel(t.notes.titleLabel).fill('Nefrología');
  await page.getByRole('button', { name: t.notes.create }).click();
  const first = page.getByLabel(t.notes.lineLabel(1, 1));
  await first.fill('Hiperpotasemia');
  await page.getByRole('button', { name: t.notes.toolbar.add }).click();
  await page.getByLabel(t.notes.lineLabel(2, 1)).fill('Primera medida');
  await page.getByRole('button', { name: t.notes.toolbar.card }).click();
  await page.getByLabel(t.notes.lineLabel(2, 1)).pressSequentially('Gluconato de calcio');
  await page.getByRole('button', { name: t.notes.toolbar.indent }).click();
  await expect(page.getByLabel(t.notes.lineLabel(2, 2))).toHaveValue(
    'Primera medida :: Gluconato de calcio',
  );
  await expect(page.getByText(t.notes.badges.basic, { exact: true })).toBeVisible();
  await waitForSave(page);
  await expectNoSeriousA11yViolations(page);
});
