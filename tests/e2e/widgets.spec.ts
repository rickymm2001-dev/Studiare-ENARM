// Flujo 5 de 14.1. Tablero de widgets, agregar, configurar, reordenar y quitar, con acomodos
// predefinidos. Todo con botones, así que también se maneja con teclado (9.1)
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';
import type { Page } from '@playwright/test';

const names = t.widgets.names;

/** Nombres de los widgets en el orden en que están en la página */
const widgetOrder = (page: Page) =>
  page
    .locator('main section[aria-label]')
    .evaluateAll((sections) => sections.map((section) => section.getAttribute('aria-label')));

test('agregar, configurar, reordenar y quitar widgets, y se recuerda al recargar', async ({
  page,
}) => {
  await signUp(page);
  // El acomodo esencial trae cinco widgets
  await expect
    .poll(() => widgetOrder(page))
    .toEqual([names.today, names.streak, names.daily_goal, names.level_xp, names.heatmap]);

  await page.getByRole('button', { name: t.home.edit }).click();

  // Agregar. Un widget con datos que aún no alcanzan muestra su estado en vez de cifras inventadas
  await page.getByLabel(t.home.addLabel).selectOption('bias_pattern');
  await page.getByRole('button', { name: t.home.add, exact: true }).click();
  const bias = page.getByRole('region', { name: names.bias_pattern });
  await expect(bias).toBeVisible();
  await expect(bias.getByText(t.states.calibrating.title)).toBeVisible();
  await expect(
    bias.getByText(
      t.states.calibrating.remaining(
        DEFAULT_THRESHOLDS.bias.minTaggedErrors,
        t.widgets.biasPattern.unit,
      ),
    ),
  ).toBeVisible();

  // Reordenar con botones accesibles por teclado
  await page.getByRole('button', { name: t.home.moveDown(names.today) }).focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await widgetOrder(page)).slice(0, 2))
    .toEqual([names.streak, names.today]);

  // Quitar
  await page.getByRole('button', { name: t.home.remove(names.daily_goal) }).click();
  await expect(page.getByRole('region', { name: names.daily_goal })).toHaveCount(0);

  // Configurar el heatmap. El acomodo pasa a Personalizado
  await page.getByRole('button', { name: t.home.settings(names.heatmap) }).click();
  await page.getByLabel(t.widgets.heatmap.range).selectOption('90');
  await expect(page.getByLabel(t.home.presetLabel)).toHaveValue('custom');
  await page.getByRole('button', { name: t.home.doneEditing }).click();
  await expectNoSeriousA11yViolations(page);

  const expected = [names.streak, names.today, names.level_xp, names.heatmap, names.bias_pattern];
  await expect.poll(() => widgetOrder(page)).toEqual(expected);

  // Se recuerda al recargar, con el rango del heatmap
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: t.screens.home.title })).toBeVisible();
  await expect.poll(() => widgetOrder(page)).toEqual(expected);
  await page.getByRole('button', { name: t.home.edit }).click();
  await page.getByRole('button', { name: t.home.settings(names.heatmap) }).click();
  await expect(page.getByLabel(t.widgets.heatmap.range)).toHaveValue('90');
});

test('los acomodos predefinidos cambian los widgets', async ({ page }) => {
  await signUp(page);
  await page.getByRole('button', { name: t.home.edit }).click();
  await page.getByLabel(t.home.presetLabel).selectOption('competitive');
  await expect
    .poll(() => widgetOrder(page))
    .toEqual([
      names.level_xp,
      names.streak,
      names.party_challenge,
      names.daily_goal,
      names.heatmap,
    ]);
  await page.getByLabel(t.home.presetLabel).selectOption('analytic');
  await expect
    .poll(() => widgetOrder(page))
    .toEqual([
      names.today,
      names.heatmap,
      names.weak_topics,
      names.bias_pattern,
      names.future_load,
    ]);
});
