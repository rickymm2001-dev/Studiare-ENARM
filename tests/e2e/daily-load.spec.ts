// Carga diaria (D-085, Etapa 2). Con un mazo precargado seguido: los tres contadores bajan al
// calificar, el temporizador opcional se enciende en Configuración y muestra la respuesta solo, y
// con el reloj tres días adelante las tarjetas repasadas quedan atrasadas, se reparten y se deshace
// el cambio. Todo cambio de fecha es un evento nuevo, la bitácora no se edita.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

async function followSmallestDeck(page: Page) {
  await page.goto(SCREENS.decks.path);
  const deck = page.getByRole('listitem').filter({ hasText: 'Urgencias (Paco)' });
  await deck.getByRole('button', { name: t.decks.follow }).click();
  await expect(deck.getByRole('button', { name: t.decks.unfollow })).toBeVisible({
    timeout: 60_000,
  });
}

const rating = (page: Page, value: keyof typeof t.review.ratings) =>
  page.getByRole('button', { name: new RegExp(`^${t.review.ratings[value]}`) });

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

  // El temporizador viene apagado. Se enciende en Configuración con el tiempo más corto
  await page.goto(`${SCREENS.settings.path}?seccion=study`);
  await page.getByRole('checkbox', { name: t.settings.cardTimerEnabled }).check();
  await page.getByRole('combobox', { name: t.settings.cardTimerSeconds }).selectOption('10');
  await page.getByRole('checkbox', { name: t.settings.cardTimerAutoReveal }).check();
  await page.getByRole('button', { name: t.settings.saveChanges }).click();
  await expect(page.getByText(t.settings.saved)).toBeVisible();

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

test('el perfil guía y la sugerencia de nuevas viven en los límites de hoy', async ({ page }) => {
  test.setTimeout(180_000);
  await signUp(page);
  await followSmallestDeck(page);
  await page.goto(SCREENS.review.path);
  await page.getByText(t.reviewSetup.limits, { exact: true }).first().click();

  const guide = page.getByRole('region', { name: t.dailyLoad.guideTitle });
  await expect(guide).toBeVisible();
  await guide.getByRole('button', { name: t.dailyLoad.guideApply }).click();
  await expect(guide.getByText(t.dailyLoad.guideApplied)).toBeVisible();
  await expect(guide.getByText(t.dailyLoad.guideAlready)).toBeVisible();

  // Sin minutos de estudio la sugerencia manda a Plan
  const suggestion = page.getByRole('region', { name: t.dailyLoad.suggestionTitle });
  await suggestion.getByRole('button', { name: t.dailyLoad.calculate }).click();
  const needsMinutes = suggestion.getByText(t.dailyLoad.needsMinutes);
  const ready = suggestion.getByText(/^Te sugerimos/);
  await expect(needsMinutes.or(ready)).toBeVisible({ timeout: 30_000 });
  await expectNoSeriousA11yViolations(page);

  // Quitar el límite apaga el campo y avisa. Volver a ponerlo lo regresa
  const unlimited = suggestion.getByRole('checkbox', { name: t.settings.unlimitedNewCards });
  // El ajuste se guarda en la base y la casilla cambia al terminar, por eso se hace clic y se espera
  await unlimited.click();
  await expect(unlimited).toBeChecked();
  await expect(suggestion.getByText(t.dailyLoad.unlimitedOn)).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: t.settings.newCardsPerDay })).toBeDisabled();
  await unlimited.click();
  await expect(unlimited).not.toBeChecked();
  await expect(page.getByRole('spinbutton', { name: t.settings.newCardsPerDay })).toBeEnabled();
});
