// Pantallas de admin de la Fase D. Costos de IA (23), datos de demostración (24) y configuración (25).
// El proxy corre en modo simulado, así que no hay gasto real y la pantalla de costos lo dice.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, test } from './support/fixtures';
import type { Page } from '@playwright/test';

/** La base activa vive en Configuración, en la sección Cuenta y datos */
const ACCOUNT_SETTINGS = `${SCREENS.settings.path}?seccion=account`;

async function becomeAdmin(page: Page) {
  await page.goto(SCREENS.roleSelector.path);
  await page.getByRole('radio', { name: new RegExp(t.roles.names.admin) }).click();
  await page.getByRole('button', { name: t.roles.enterAs(t.roles.names.admin) }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test('costos de IA. Sin llamadas dice que no hay y con el proxy simulado lee el uso de hoy', async ({
  page,
}) => {
  await becomeAdmin(page);
  await page.goto(SCREENS.aiCosts.path);
  await expect(page.getByRole('heading', { level: 1, name: t.adminCosts.title })).toBeVisible();
  await expect(page.getByText(t.adminCosts.empty.title)).toBeVisible();
  const today = page.getByRole('region', { name: t.adminCosts.today.title });
  await expect(today.getByText(t.adminCosts.today.mockNote)).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test('configuración. Un umbral y un peso se guardan, sobreviven al recargar y se restablecen', async ({
  page,
}) => {
  await becomeAdmin(page);
  await page.goto(SCREENS.adminSettings.path);
  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.adminSettings.title }),
  ).toBeVisible();

  const thresholds = page.getByRole('region', { name: t.adminConfig.thresholdsForm.title });
  const label = t.adminConfig.thresholds['bias.minTaggedErrors'].label;
  await expect(thresholds.getByLabel(label)).toHaveValue('40');
  await thresholds.getByLabel(label).fill('25');
  await thresholds.getByRole('button', { name: t.adminConfig.thresholdsForm.save }).click();
  await expect(thresholds.getByText(t.adminConfig.thresholdsForm.saved)).toBeVisible();
  await thresholds.getByRole('button', { name: t.adminConfig.thresholdsForm.reload }).click();

  // Tras recargar la app ya corre con el umbral nuevo
  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.adminSettings.title }),
  ).toBeVisible();
  const reloaded = page.getByRole('region', { name: t.adminConfig.thresholdsForm.title });
  await expect(reloaded.getByLabel(label)).toHaveValue('25');
  await expectNoSeriousA11yViolations(page);

  await reloaded.getByRole('button', { name: t.adminConfig.thresholdsForm.reset }).click();
  await expect(reloaded.getByText(t.adminConfig.thresholdsForm.resetDone)).toBeVisible();
  await expect(reloaded.getByLabel(label)).toHaveValue('40');

  // Los pesos del ENARM también
  const weights = page.getByRole('region', { name: t.adminConfig.weightsForm.title });
  await weights.locator('summary').first().click();
  const weight = weights.getByLabel(/^Peso de la rama/).first();
  await weight.fill('2');
  await weights.getByRole('button', { name: t.adminConfig.weightsForm.save }).click();
  await expect(weights.getByText(t.adminConfig.weightsForm.saved)).toBeVisible();
  await weights.getByRole('button', { name: t.adminConfig.weightsForm.reload }).click();
  const weightsAfter = page.getByRole('region', { name: t.adminConfig.weightsForm.title });
  await weightsAfter.locator('summary').first().click();
  await expect(weightsAfter.getByLabel(/^Peso de la rama/).first()).toHaveValue('2');
  await weightsAfter.getByRole('button', { name: t.adminConfig.weightsForm.reset }).click();
  await expect(weightsAfter.getByText(t.adminConfig.weightsForm.resetDone)).toBeVisible();
});

test('configuración. El presupuesto diario de IA se cambia en el proxy y queda guardado', async ({
  page,
}) => {
  await becomeAdmin(page);
  await page.goto(SCREENS.adminSettings.path);
  const card = page.getByRole('region', { name: t.adminConfig.aiForm.title });
  await expect(card.getByRole('group')).toHaveCount(5);
  const budget = card.getByLabel(t.adminConfig.aiForm.budget);
  await expect(budget).toHaveValue('5');

  await budget.fill('2.5');
  await card.getByRole('button', { name: t.adminConfig.aiForm.save }).click();
  await expect(card.getByText(t.adminConfig.aiForm.saved)).toBeVisible();

  await page.reload();
  await expect(
    page
      .getByRole('region', { name: t.adminConfig.aiForm.title })
      .getByLabel(t.adminConfig.aiForm.budget),
  ).toHaveValue('2.5');
  await expectNoSeriousA11yViolations(page);

  // Se deja como estaba, porque el proxy de las pruebas lo comparten todas
  const restored = page.getByRole('region', { name: t.adminConfig.aiForm.title });
  await restored.getByLabel(t.adminConfig.aiForm.budget).fill('5');
  await restored.getByRole('button', { name: t.adminConfig.aiForm.save }).click();
  await expect(restored.getByText(t.adminConfig.aiForm.saved)).toBeVisible();
});

test('datos de demostración. En Mi cuenta pide cambiar de base y en la demo genera pocos alumnos y borra todo', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await becomeAdmin(page);
  await page.goto(SCREENS.demoData.path);
  await expect(page.getByText(t.adminDemo.notDemo.title)).toBeVisible();

  await page.goto(ACCOUNT_SETTINGS);
  await page.getByRole('radio', { name: new RegExp(t.database.demo) }).click();
  await expect(page.getByText(t.database.storedIn('enarm_demo'))).toBeVisible();

  await page.goto(SCREENS.demoData.path);
  await expect(page.getByRole('heading', { level: 1, name: t.adminDemo.title })).toBeVisible();
  await page.getByLabel(t.adminDemo.fields.cohort).fill('10');
  await page.getByRole('button', { name: t.adminDemo.generate }).click();
  await expect(page.getByRole('status').filter({ hasText: /Listo/ })).toBeVisible({
    timeout: 150_000,
  });
  await expect(page.getByRole('button', { name: t.adminDemo.regenerate })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await page.getByRole('button', { name: t.adminDemo.clear }).click();
  await page.getByRole('button', { name: t.adminDemo.confirmClearYes }).click();
  await expect(page.getByText(t.adminDemo.done.clear(0))).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: t.adminDemo.generate })).toBeVisible();
});
