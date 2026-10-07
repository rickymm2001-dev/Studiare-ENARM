// Explorar (D-085). Con un mazo precargado seguido, buscar, filtrar por estado y por ruta de etiqueta,
// marcar todas las que coinciden, suspenderlas y comprobar que Repasar ya no las trae. Reanudarlas
// las devuelve. Las suspensiones son eventos, así que el contenido precargado no se toca.
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

/** Cuántas tarjetas dice el encabezado de resultados. Con filtros dice "x de y" y toma la x */
async function resultCount(page: Page): Promise<number> {
  const text = await page
    .getByRole('status')
    .filter({ hasText: /tarjetas?( de [\d,]+)?$/ })
    .first()
    .innerText();
  return Number(/^\d+/.exec(text.replace(/,/g, ''))?.[0]);
}

test('busca, filtra, suspende por lote y Repasar lo respeta', async ({ page }) => {
  test.setTimeout(180_000);
  await signUp(page);
  await followSmallestDeck(page);

  await page.goto(SCREENS.explore.path);
  const tabs = page.getByRole('navigation', { name: t.studyTabs.label });
  await expect(tabs.getByRole('link', { name: t.studyTabs.explore })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const list = page.getByRole('list', { name: t.explore.list });
  await expect(list).toBeVisible({ timeout: 30_000 });
  await expectNoSeriousA11yViolations(page);
  const total = await resultCount(page);
  expect(total).toBeGreaterThan(50);

  // Una búsqueda que no existe lo dice y quitar los filtros lo devuelve todo
  const search = page.getByRole('searchbox', { name: t.explore.search });
  await search.fill('zzzzxqj');
  await expect(page.getByText(t.explore.noResults)).toBeVisible();
  await page.getByRole('button', { name: t.explore.clear }).click();
  await expect(list).toBeVisible();
  expect(await resultCount(page)).toBe(total);

  // Todas son nuevas y ninguna está suspendida
  await page
    .getByRole('button', { name: new RegExp(`^${t.explore.statuses.suspended}\\s*0$`) })
    .click();
  await expect(page.getByText(t.explore.noResults)).toBeVisible();
  await page.getByRole('button', { name: t.explore.clear }).click();

  // Por ruta de etiqueta, con lo que cuelga de ella
  await page.getByText(t.explore.tagsTitle, { exact: true }).click();
  const firstTag = page
    .getByRole('group', { name: t.explore.filtersTitle })
    .or(page.getByRole('search', { name: t.explore.filtersTitle }))
    .locator('details ul > li > div > button[aria-pressed]')
    .first();
  await firstTag.click();
  await expect(page.getByRole('button', { name: t.explore.clear })).toBeVisible();
  expect(await resultCount(page)).toBeLessThanOrEqual(total);
  await page.getByRole('button', { name: t.explore.clear }).click();

  // Marca todas las que coinciden y las suspende
  await page.getByRole('checkbox', { name: t.explore.selectPage }).check();
  await page.getByRole('button', { name: t.explore.selectAllMatching(total) }).click();
  await expect(page.getByText(t.explore.selected(total), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: t.explore.actions.suspend, exact: true }).click();
  await expect(page.getByText(t.explore.actions.suspended(total))).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Ya suspendidas, Repasar no las trae
  await page.goto(SCREENS.review.path);
  await expect(page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ })).toHaveCount(0);

  // Reanudarlas las devuelve
  await page.goto(SCREENS.explore.path);
  await expect(list).toBeVisible({ timeout: 30_000 });
  await page
    .getByRole('button', { name: new RegExp(`^${t.explore.statuses.suspended}\\s*${total}$`) })
    .click();
  await page.getByRole('checkbox', { name: t.explore.selectPage }).check();
  await page.getByRole('button', { name: t.explore.selectAllMatching(total) }).click();
  await page.getByRole('button', { name: t.explore.actions.unsuspend }).click();
  await expect(page.getByText(t.explore.actions.unsuspended(total))).toBeVisible();
  await page.goto(SCREENS.review.path);
  await expect(page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ })).toBeVisible();
});
