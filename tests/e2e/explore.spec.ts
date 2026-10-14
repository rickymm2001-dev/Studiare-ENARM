// Buscar tarjetas (B4 del plan del cambio, comentario 11, antes Explorar). Con un mazo precargado
// seguido y un mazo propio, busca al teclear, filtra por tema, edita una tarjeta en el panel sin
// perder la lista, suspende varias por lote y las reanuda, y llega con el filtro de los enlaces de
// siempre, como ?estado=sanguijuelas. En la computadora es una tabla con un panel al lado y en el
// teléfono una lista con una hoja de filtros.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { topicKey } from '@/engines/cardSearch';
import { t } from '@/i18n/es-MX';
import { followSmallestDeck } from './support/b1';
import { cardPanel, openCard, resultCount, resultRows, searchResults } from './support/cardSearch';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const text = t.cardSearch;
const OWN_DECK = 'Mi mazo de urgencias';

/** Un mazo propio con una tarjeta, para editarla en el panel */
async function createOwnCard(page: Page) {
  await page.goto(SCREENS.decks.path);
  const own = page.getByRole('region', { name: t.decks.yoursTitle });
  await own.getByLabel(t.decks.nameLabel).fill(OWN_DECK);
  await own.getByRole('button', { name: t.decks.createButton }).click();
  const dialog = page.getByRole('dialog', { name: t.decks.editor.title(OWN_DECK) });
  await dialog
    .getByLabel(t.decks.editor.front, { exact: true })
    .fill('¿Antídoto del síndrome colinérgico?');
  await dialog.getByLabel(t.decks.editor.back, { exact: true }).fill('Atropina');
  await dialog.getByRole('button', { name: t.decks.editor.save }).click();
  await expect(dialog.getByText(t.decks.editor.saved)).toBeVisible();
  await dialog.getByRole('button', { name: t.decks.editor.close }).click();
}

/** Filtra por un tema, con el chip en la computadora o con la hoja de filtros en el teléfono */
async function filterByTopic(page: Page, isMobile: boolean, path: readonly string[]) {
  const name = path.at(-1) ?? '';
  if (isMobile) {
    await page.getByRole('button', { name: text.openFilters(0) }).click();
    const sheet = page.getByRole('dialog', { name: text.filtersLabel });
    await sheet.getByLabel(text.topic, { exact: true }).selectOption(topicKey(path));
    await expectNoSeriousA11yViolations(page);
    await sheet.getByRole('button', { name: /^Ver [\d,]+ tarjetas?$/ }).click();
    await expect(sheet).toHaveCount(0);
    return;
  }
  const filters = page.getByRole('group', { name: text.filtersLabel });
  await filters.getByRole('button', { name: text.topic, exact: true }).click();
  await page
    .getByRole('group', { name: text.topic, exact: true })
    .getByRole('button', { name: new RegExp(`^${name}\\s*[\\d,]+$`) })
    .click();
  await expect(filters.getByRole('button', { name: new RegExp(`^Tema, ${name}`) })).toBeVisible();
}

test('busca, filtra, edita en el panel y suspende varias por lote', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const isMobile = testInfo.project.name === 'mobile';
  await signUp(page);
  await followSmallestDeck(page);
  await createOwnCard(page);

  await page.goto(SCREENS.explore.path);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Buscar tarjetas');
  const tabs = page.getByRole('navigation', { name: t.studyTabs.label });
  await expect(tabs.getByRole('link', { name: 'Buscar tarjetas' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const results = searchResults(page);
  await expect(results).toBeVisible({ timeout: 30_000 });
  await expectNoSeriousA11yViolations(page);
  const total = await resultCount(page);
  expect(total).toBeGreaterThan(100);

  // Resultados al teclear, sin acentos
  const search = page.getByRole('searchbox', { name: text.searchLabel });
  await search.fill('anticolinergico');
  await expect.poll(() => resultCount(page)).toBeLessThan(total);
  expect(await resultCount(page)).toBeGreaterThan(0);
  await search.fill('zzzzxqj');
  await expect(page.getByText(text.noResults)).toBeVisible();
  await search.fill('');
  await expect.poll(() => resultCount(page)).toBe(total);

  // Un tema, con el chip o con la hoja de filtros
  await filterByTopic(page, isMobile, ['Urgencias', 'Quemaduras']);
  await expect.poll(() => resultCount(page)).toBeLessThan(total);
  await expect(resultRows(page).first()).toContainText('Quemaduras');
  await page.getByRole('button', { name: text.clear }).first().click();
  await expect.poll(() => resultCount(page)).toBe(total);

  // Abre la tarjeta propia en el panel, la edita y la lista sigue ahí. La búsqueda también lee el
  // nombre del mazo, y una frase entre comillas lo encuentra
  await search.fill(`"${OWN_DECK}"`);
  await expect(resultRows(page)).toHaveCount(1);
  await openCard(resultRows(page).first());
  const panel = cardPanel(page);
  await expect(panel.getByText('Atropina')).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await panel.getByRole('button', { name: text.panel.edit }).click();
  await panel
    .getByLabel(t.decks.editor.front, { exact: true })
    .fill('¿Cuál es el antídoto del síndrome colinérgico?');
  await panel.getByRole('button', { name: text.panel.save }).click();
  await expect(panel.getByText(text.panel.saved)).toBeVisible();
  await expect(
    panel.getByRole('heading', { name: '¿Cuál es el antídoto del síndrome colinérgico?' }),
  ).toBeVisible();
  if (isMobile) {
    await panel.getByRole('button', { name: text.panel.close }).click();
    await expect(panel).toHaveCount(0);
  } else {
    // En la computadora la tabla sigue a la vista con el panel abierto
    await expect(results).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  }
  await expect(resultRows(page).first()).toContainText(
    '¿Cuál es el antídoto del síndrome colinérgico?',
  );

  // Marca tres y las suspende por lote
  await search.fill('');
  await expect.poll(() => resultCount(page)).toBe(total);
  for (const index of [0, 1, 2]) await resultRows(page).nth(index).getByRole('checkbox').check();
  const actions = page.getByRole('region', { name: text.actions.title });
  await expect(actions.getByText(text.selected(3))).toBeVisible();
  await actions.getByRole('button', { name: text.actions.suspend }).click();
  await expect(page.getByText(text.actions.suspended(3))).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // El enlace con ?estado= llega con su filtro puesto
  await page.goto(`${SCREENS.explore.path}?estado=suspendidas`);
  await expect(results).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => resultCount(page)).toBe(3);
  if (isMobile) {
    await page.getByRole('button', { name: text.selectAll(3) }).click();
  } else {
    await page.getByRole('checkbox', { name: text.selectAll(3) }).check();
  }
  await page
    .getByRole('region', { name: text.actions.title })
    .getByRole('button', { name: text.actions.unsuspend })
    .click();
  await expect(page.getByText(text.actions.unsuspended(3))).toBeVisible();
});

test('los enlaces de siempre a las sanguijuelas llegan con su filtro puesto', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const isMobile = testInfo.project.name === 'mobile';
  await signUp(page);
  await followSmallestDeck(page);

  await page.goto(`${SCREENS.explore.path}?estado=sanguijuelas`);
  await expect(page.getByText(text.noResults)).toBeVisible({ timeout: 30_000 });
  if (isMobile) {
    await expect(page.getByRole('button', { name: text.openFilters(1) })).toBeVisible();
  } else {
    await expect(
      page
        .getByRole('group', { name: text.filtersLabel })
        .getByRole('button', { name: new RegExp(`^${text.leech}\\s*0$`) }),
    ).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByRole('button', { name: text.clear }).first().click();
  await expect(searchResults(page)).toBeVisible();
  expect(await resultCount(page)).toBeGreaterThan(100);
});
