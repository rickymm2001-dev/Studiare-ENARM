// Ayudantes de las e2e de Buscar tarjetas (B4 del plan del cambio). En la computadora los resultados
// son una tabla y la tarjeta se abre en un panel al lado. En el teléfono son una lista y la tarjeta
// se abre en una hoja. Estos ayudantes dan lo mismo en los dos tamaños.
import type { Locator, Page } from '@playwright/test';
import { t } from '@/i18n/es-MX';

/** La tabla o la lista de tarjetas encontradas */
export function searchResults(page: Page): Locator {
  const name = t.cardSearch.resultsLabel;
  return page.getByRole('table', { name }).or(page.getByRole('list', { name }));
}

/** Una fila por tarjeta encontrada, sin el encabezado de la tabla */
export function resultRows(page: Page): Locator {
  return searchResults(page).locator(':scope > tbody > tr, :scope > li');
}

/** El panel de la tarjeta abierta, al lado en la computadora o en una hoja en el teléfono */
export function cardPanel(page: Page): Locator {
  const name = t.cardSearch.panel.label;
  return page.getByRole('region', { name }).or(page.getByRole('dialog', { name }));
}

/** Abre la tarjeta de una fila */
export async function openCard(row: Locator): Promise<void> {
  await row.locator('[data-row-open]').click();
}

/** Cuántas tarjetas dice el encabezado de resultados. Con filtros dice "x de y" y toma la x */
export async function resultCount(page: Page): Promise<number> {
  const text = await page
    .getByRole('status')
    .filter({ hasText: /tarjetas?( de [\d,]+)?$/ })
    .first()
    .innerText();
  return Number(/^[\d,]+/.exec(text)?.[0]?.replace(/,/g, ''));
}
