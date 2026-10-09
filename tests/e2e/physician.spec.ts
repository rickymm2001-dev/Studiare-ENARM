// Panel del médico de la Fase E. Pantalla 19, acuerdo del etiquetado. Sin etiquetas mide nada y dice
// que el alumno ve trampas. El médico sin preguntas asignadas no tiene cola y el admin no etiqueta.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';
import type { Page } from '@playwright/test';

const text = t.agreementScreen;

async function enterAs(page: Page, role: 'physician' | 'admin') {
  await page.goto(SCREENS.roleSelector.path);
  await page.getByRole('radio', { name: new RegExp(t.roles.names[role]) }).click();
  await page.getByRole('button', { name: t.roles.enterAs(t.roles.names[role]) }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test('acuerdo del etiquetado. El médico sin asignaciones no tiene cola y el tablero calibra', async ({
  page,
}) => {
  // Con cuenta, porque la cola lleva las preguntas asignadas a quien etiqueta
  await signUp(page);
  await enterAs(page, 'physician');
  await page.goto(SCREENS.agreement.path);
  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.agreement.title }),
  ).toBeVisible();
  const queue = page.getByRole('region', { name: text.queue.title });
  await expect(queue.getByText(text.queue.empty)).toBeVisible();
  await expect(page.getByText(text.vocabulary.title)).toBeVisible();
  await expect(page.getByText(text.vocabulary.trap, { exact: false })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test('acuerdo del etiquetado. El admin ve el tablero y no etiqueta', async ({ page }) => {
  await enterAs(page, 'admin');
  await page.goto(SCREENS.agreement.path);
  const queue = page.getByRole('region', { name: text.queue.title });
  await expect(queue.getByText(text.queue.adminNote)).toBeVisible();
  await expect(queue.getByRole('combobox')).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
});
