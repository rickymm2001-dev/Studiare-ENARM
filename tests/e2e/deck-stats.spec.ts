// Pantalla de mazo completa (V4-B3). Las cifras del mazo, con las sanguijuelas y la última vez que se
// estudió, calibran hasta que hay repasos, y los botones llevan a Repasar con el mazo elegido, a
// Estudiar un tema y a Buscar tarjetas con el filtro del mazo puesto. Corre en teléfono y en computadora.
import { SCREENS } from '@/app/screens';
import { deckStatsText } from '@/i18n/deckStats';
import { t } from '@/i18n/es-MX';
import { followSmallestDeck } from './support/b1';
import { resultCount } from './support/cardSearch';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';
import { isPhone } from './support/navigation';

const DECK = 'Urgencias (Paco)';
const START = /^Repasar [\d,]+ tarjetas?$/;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('la pantalla de mazo calibra, lleva a Repasar y a Buscar con el mazo puesto y recuerda la última vez', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUp(page);
  await followSmallestDeck(page);
  await page.goto(SCREENS.decks.path);
  const row = page.getByRole('listitem').filter({ hasText: DECK });

  // Los botones del mazo están a la vista y sus cifras, plegadas, calibran porque aún no hay repasos
  const actions = row.getByRole('group', { name: deckStatsText.actions.label(DECK) });
  await expect(actions.getByRole('button', { name: deckStatsText.actions.review })).toBeVisible();
  await expect(actions.getByRole('button', { name: deckStatsText.actions.topic })).toBeVisible();
  await expect(actions.getByRole('link', { name: deckStatsText.actions.search })).toBeVisible();
  await row.getByText(t.deckStats.title).click();
  const leeches = row.getByText(deckStatsText.leeches).locator('..');
  await expect(leeches.getByText(t.insights.calibratingLabel)).toBeVisible();
  await expect(row.getByText(deckStatsText.neverStudied)).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Estudiar un tema abre Repasar con el modo por tema y este mazo ya elegido
  await actions.getByRole('button', { name: deckStatsText.actions.topic }).click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.review.path}$`));
  await expect(page.getByText(t.reviewSetup.topicHint)).toBeVisible();
  await page.getByRole('button', { name: START }).click();
  await page.getByRole('button', { name: t.review.show }).click();
  await page.getByRole('button', { name: new RegExp(`^${t.review.ratings.good}`) }).click();
  await page.getByRole('button', { name: t.review.finish }).click();
  await expect(page.getByText(t.review.doneTitle)).toBeVisible();

  // Con un repaso hecho el mazo ya no calibra las sanguijuelas y dice que se estudió hoy
  await page.goto(SCREENS.decks.path);
  await row.getByText(t.deckStats.title).click();
  await expect(row.getByText(deckStatsText.lastStudiedValue(0), { exact: true })).toBeVisible();
  await expect(row.getByText(deckStatsText.leechesNone)).toBeVisible();

  // Buscar tarjetas de este mazo abre el buscador con el mazo en su filtro y con sus tarjetas
  await row
    .getByRole('group', { name: deckStatsText.actions.label(DECK) })
    .getByRole('link', { name: deckStatsText.actions.search })
    .click();
  await expect(page).toHaveURL(/mazo=/);
  if (isPhone(page)) {
    // En el teléfono los filtros viven en una hoja. El botón cuenta el filtro del mazo y su campo lo dice
    await page.getByRole('button', { name: t.cardSearch.openFilters(1) }).click();
    await expect(
      page.getByRole('combobox', { name: t.cardSearch.deck }).locator('option:checked'),
    ).toContainText(DECK);
    await page.getByRole('button', { name: t.cardSearch.closeFilters }).click();
  } else {
    const chip = t.cardSearch.chipValue(t.cardSearch.deck, DECK);
    await expect(
      page
        .getByRole('group', { name: t.cardSearch.filtersLabel })
        .getByRole('button', { name: new RegExp(`^${escape(chip)}`) }),
    ).toBeVisible();
  }
  await expect.poll(() => resultCount(page)).toBeGreaterThan(0);
});
