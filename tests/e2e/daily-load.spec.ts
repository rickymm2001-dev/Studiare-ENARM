// Carga diaria (D-085, Etapa 2). Con un mazo precargado seguido: los tres contadores bajan al
// calificar, el temporizador opcional se enciende en Ajustes del repaso y muestra la respuesta solo,
// y con el reloj tres días adelante las tarjetas repasadas quedan atrasadas, se reparten y se
// deshace el cambio. Todo cambio de fecha es un evento nuevo, la bitácora no se edita.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { followSmallestDeck } from './support/b1';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const rating = (page: Page, value: keyof typeof t.review.ratings) =>
  page.getByRole('button', { name: new RegExp(`^${t.review.ratings[value]}`) });

/** Ajustes del repaso, el panel de Repasar con todos los ajustes que se guardan (B3) */
const settingsPanel = (page: Page) =>
  page.getByRole('dialog', { name: t.settingsPage.reviewSettings.title });

const counterValues = async (page: Page) =>
  page
    .getByRole('list', { name: t.review.counters.label })
    .getByRole('listitem')
    .locator('strong')
    .allInnerTexts();

test('contadores, temporizador, atrasos repartidos y deshacer', async ({ page }) => {
  test.setTimeout(240_000);
  await signUp(page);
  await followSmallestDeck(page);

  // El temporizador viene apagado. Se enciende en Ajustes del repaso con el tiempo más corto
  await page.goto(`${SCREENS.review.path}?ajustes=1`);
  const panel = settingsPanel(page);
  await panel.getByRole('checkbox', { name: t.settings.cardTimerEnabled }).check();
  await panel.getByRole('combobox', { name: t.settings.cardTimerSeconds }).selectOption('10');
  await panel.getByRole('checkbox', { name: t.settings.cardTimerAutoReveal }).check();
  await panel.getByRole('button', { name: t.settings.saveChanges }).click();
  await expect(panel.getByText(t.settings.saved)).toBeVisible();

  // Tres contadores con los números de la selección y el de la tarjeta actual subrayado
  await page.goto(SCREENS.review.path);
  await page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ }).click();
  const [newAtStart = 0, learningAtStart = -1, reviewAtStart = -1] = (
    await counterValues(page)
  ).map((value) => Number(value.replace(/,/g, '')));
  expect(newAtStart).toBeGreaterThan(3);
  expect(learningAtStart).toBe(0);
  expect(reviewAtStart).toBe(0);
  await expectNoSeriousA11yViolations(page);

  // Con el temporizador encendido se ve la barra y, al acabarse el tiempo, muestra la respuesta
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.getByRole('button', { name: t.review.show })).toBeHidden({ timeout: 25_000 });
  await expect(page.getByText(t.review.timer.expired)).toBeVisible();
  await rating(page, 'good').click();
  // El contador baja cuando termina de guardarse la calificación, no en el mismo instante del clic
  await expect
    .poll(async () => Number((await counterValues(page))[0]?.replace(/,/g, '')))
    .toBe(newAtStart - 1);

  // Dos tarjetas más y se termina, para que haya tarjetas con repasos
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole('button', { name: t.review.show }).click();
    await rating(page, 'good').click();
  }
  await page.getByRole('button', { name: t.review.finish }).click();
  await expect(page.getByText(t.review.doneTitle)).toBeVisible();

  // Tres días después esas tarjetas ya son atrasos. El reloj fijo solo mueve la fecha
  await page.clock.setFixedTime(new Date(Date.now() + 3 * 86_400_000));
  await page.goto(SCREENS.review.path);
  const tools = page.getByText(t.overdue.title, { exact: true });
  await expect(tools).toBeVisible({ timeout: 30_000 });
  await tools.click();
  await expectNoSeriousA11yViolations(page);

  // Repartir las atrasadas en 3 días. El resultado se ve y Deshacer lo regresa
  await page.getByRole('combobox', { name: t.overdue.spreadDays }).selectOption('3');
  await page.getByRole('button', { name: /^Repartir \d+ tarjetas?$/ }).click();
  await expect(page.getByText(/tarjetas? repartidas?\.$/)).toBeVisible();
  await page.getByRole('button', { name: t.overdue.undoButton }).click();
  await expect(page.getByText(/a su fecha de antes\.$/)).toBeVisible();
});

test('el perfil guía, la sugerencia de nuevas y el límite viven en Ajustes del repaso', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);
  await followSmallestDeck(page);
  await page.goto(SCREENS.review.path);
  await page.getByRole('button', { name: t.settingsPage.reviewSettings.open }).click();
  const panel = settingsPanel(page);

  const guide = panel.getByRole('region', { name: t.dailyLoad.guideTitle });
  await expect(guide).toBeVisible();
  await guide.getByRole('button', { name: t.dailyLoad.guideApply }).click();
  await expect(guide.getByText(t.dailyLoad.guideApplied)).toBeVisible();
  await expect(guide.getByText(t.dailyLoad.guideAlready)).toBeVisible();

  // Sin minutos de estudio la sugerencia manda a Plan
  const suggestion = panel.getByRole('region', { name: t.dailyLoad.suggestionTitle });
  await suggestion.getByRole('button', { name: t.dailyLoad.calculate }).click();
  const needsMinutes = suggestion.getByText(t.dailyLoad.needsMinutes);
  const ready = suggestion.getByText(/^Te sugerimos/);
  await expect(needsMinutes.or(ready)).toBeVisible({ timeout: 30_000 });
  await expectNoSeriousA11yViolations(page);

  // Quitar el límite apaga el campo y, al guardar, la sugerencia avisa. Volver a ponerlo lo regresa.
  // La casilla está una sola vez, junto al campo de tarjetas nuevas
  const unlimited = panel.getByRole('checkbox', { name: t.settings.unlimitedNewCards });
  const newCards = panel.getByRole('spinbutton', { name: t.settings.newCardsPerDay });
  await unlimited.check();
  await expect(newCards).toBeDisabled();
  await panel.getByRole('button', { name: t.settings.saveChanges }).click();
  await expect(suggestion.getByText(t.dailyLoad.unlimitedOn)).toBeVisible();
  await unlimited.uncheck();
  await expect(newCards).toBeEnabled();
  await panel.getByRole('button', { name: t.settings.saveChanges }).click();
  await expect(suggestion.getByText(t.dailyLoad.unlimitedOn)).toHaveCount(0);
});
