// Flujo 6 de 14.1. Party, crear un grupo, ver la tabla de la semana, unirse con un código y
// completar un reto. Los grupos viven en este navegador y los compañeros llevan etiqueta de
// simulados (9.6, 4.6)
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

test('crea un grupo, ve la tabla, se une con su código y completa un reto', async ({ page }) => {
  await signUp(page);
  await page.goto(SCREENS.party.path);
  await expect(page.getByText(t.party.privacy)).toBeVisible();
  await expect(page.getByText(t.party.createHint)).toBeVisible();

  // Crear con compañeros simulados, marcados como tales
  await page.getByLabel(t.party.groupName).fill('Guardia de los jueves');
  await page.getByRole('button', { name: t.party.create }).click();
  const group = page.getByRole('region', { name: 'Guardia de los jueves' });
  await expect(group).toBeVisible();
  await expect(group.getByText(t.labels.simulatedData).first()).toBeVisible();
  const code = (await group.locator('strong.font-mono').textContent()) ?? '';
  expect(code).toMatch(/^[A-Z2-9]{6}$/);

  // La tabla de la semana trae a la persona y a sus compañeros simulados, y solo comparte lo permitido
  const table = group.getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(8);
  await expect(table.getByRole('row', { name: new RegExp(t.party.you) })).toBeVisible();
  await expect(table.getByText(t.party.simulated).first()).toBeVisible();
  await expect(table.getByRole('columnheader').allTextContents()).resolves.toEqual([
    '#',
    t.party.alias,
    t.party.level,
    t.party.streak,
    t.party.weeklyXp,
  ]);
  await expectNoSeriousA11yViolations(page);

  // Unirse con el mismo código avisa que ya está, y un código que no existe también lo dice
  const join = page.getByRole('region', { name: t.party.joinTitle });
  await join.getByLabel(t.party.code).fill(code);
  await join.getByRole('button', { name: t.party.join }).click();
  await expect(join.getByRole('status')).toHaveText(t.party.joinResults.already);
  await join.getByLabel(t.party.code).fill('ZZZZZZ');
  await join.getByRole('button', { name: t.party.join }).click();
  await expect(join.getByRole('status')).toHaveText(t.party.joinResults.not_found);

  // Reto colectivo. Con una meta pequeña los compañeros simulados lo cumplen y se reclama una vez
  await group.getByRole('button', { name: t.party.newChallenge }).click();
  await group.getByLabel(t.party.challengeTitle).fill('Primeras tarjetas');
  await group.getByLabel(t.party.metric).selectOption('cards');
  await group.getByLabel(t.party.target).fill('1');
  await group.getByRole('button', { name: t.party.createChallenge }).click();
  await expect(group.getByRole('progressbar', { name: 'Primeras tarjetas' })).toBeVisible();
  await group.getByRole('button', { name: t.party.claim }).click();
  await expect(group.getByText(t.party.claimed)).toBeVisible();
  await expect(group.getByRole('button', { name: t.party.claim })).toHaveCount(0);

  // Los 100 XP del reto ya cuentan en Inicio
  await page.goto('/');
  await expect(page.getByText(t.widgets.level.total(100))).toBeVisible();

  // Salir del grupo lo quita de la lista
  await page.goto(SCREENS.party.path);
  await page.getByRole('button', { name: t.party.leave }).click();
  await expect(page.getByRole('region', { name: 'Guardia de los jueves' })).toHaveCount(0);
  await expect(page.getByText(t.party.createHint)).toBeVisible();
});
