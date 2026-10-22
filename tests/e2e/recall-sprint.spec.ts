// Recall sprint y plan de hoy (V4-B4). Con un plan de pago, un apunte se abre en el sprint, el alumno
// escribe de memoria, ve su apunte junto a lo escrito, marca una línea que le faltó y se crea su
// tarjeta en el mazo del apunte. Además, el plan de la guía se aplica con un toque en Ajustes del
// repaso y Inicio muestra las tres cifras del día. Corre en teléfono y en computadora.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { readTable, reviewSettingsPanel, subscribeMonthly } from './support/b1';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const editorOf = (page: Page) => page.getByRole('textbox', { name: t.outlines.editor.label });

test('el recall sprint compara con el apunte y crea una tarjeta con lo que faltó', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);
  await subscribeMonthly(page);

  await page.goto(SCREENS.outlines.path);
  await page.getByLabel(t.outlines.newTitle).fill('Sepsis');
  await page.getByRole('button', { name: t.outlines.create }).click();
  await expect(editorOf(page)).toBeVisible({ timeout: 30_000 });
  await editorOf(page).click();
  await page.keyboard.type('Antibióticos en la primera hora');
  await expect(page.getByText(t.outlines.editor.saved, { exact: true })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('button', { name: t.recallSprint.open }).click();
  const dialog = page.getByRole('dialog', { name: t.recallSprint.title('Sepsis') });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('timer')).toContainText('3:0');
  await dialog.getByLabel(t.recallSprint.writeLabel).fill('Hay que dar líquidos');
  await expectNoSeriousA11yViolations(page);
  await dialog.getByRole('button', { name: t.recallSprint.done }).click();

  // Lo escrito junto al apunte. La línea que faltó se marca y se vuelve tarjeta
  await expect(dialog.getByText('Hay que dar líquidos')).toBeVisible();
  await dialog.getByLabel(t.recallSprint.missed('Antibióticos en la primera hora')).check();
  await dialog.getByRole('button', { name: t.recallSprint.create(1) }).click();
  await expect(
    dialog.getByRole('status').filter({ hasText: t.recallSprint.created(1, 0) }),
  ).toBeVisible();

  const notes = await readTable<{ front?: string; fields?: unknown; kind?: string }>(page, 'notes');
  expect(JSON.stringify(notes)).toContain('Antibióticos en la primera hora');
});

test('el plan de la guía se aplica con un toque y Inicio muestra las tres cifras', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);

  await page.goto(`${SCREENS.review.path}?ajustes=1`);
  const panel = reviewSettingsPanel(page);
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: t.settings.guidePlanApply }).click();
  await expect(panel.getByText(t.settings.guidePlanActive)).toBeVisible();
  await expect(panel.getByRole('spinbutton', { name: t.settings.questionsPerDay })).toHaveValue(
    '50',
  );
  await panel.getByRole('button', { name: t.settings.saveChanges }).click();
  await expect(panel.getByText(t.settings.saved, { exact: true })).toBeVisible();

  await page.goto('/');
  const goal = page.getByRole('region', { name: t.widgets.names.daily_goal });
  await expect(goal.getByText(t.widgets.plan.title)).toBeVisible({ timeout: 30_000 });
  await expect(goal.getByText(t.widgets.goal.ratio(0, 300))).toBeVisible();
  await expect(goal.getByText(t.widgets.goal.ratio(0, 50)).first()).toBeVisible();
});
