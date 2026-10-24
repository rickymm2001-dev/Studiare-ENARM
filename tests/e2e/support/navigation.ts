// Abrir una sección desde el menú en el teléfono y en computadora (B3 del plan del cambio, D-150). En
// computadora las primeras secciones van en línea en la barra pizarra y las demás se abren desde Más.
// En el teléfono lo que no cabe en el dock se abre desde Más (4.28).
import type { Page } from '@playwright/test';
import { t } from '@/i18n/es-MX';
import { expect } from './fixtures';

/** Debajo de este ancho se ve el dock de abajo y no la barra en línea. Es el lg de Tailwind */
export const isPhone = (page: Page): boolean => (page.viewportSize()?.width ?? 0) < 1024;

/** El menú que se ve en este ancho. Los dos llevan el mismo nombre, así que se toman por su id */
export const mainNav = (page: Page) =>
  page.locator(isPhone(page) ? '#menu-principal' : '#menu-superior');

/** Toca una sección del menú. Si no está a la vista, la busca en Más */
export async function openFromMenu(page: Page, label: string): Promise<void> {
  const nav = mainNav(page);
  await expect(nav).toBeVisible();
  const direct = nav.getByRole('link', { name: label, exact: true });
  if (await direct.isVisible()) {
    await direct.click();
    return;
  }
  await nav.getByRole('button', { name: t.navItems.more }).click();
  const sheet = page.getByRole('dialog', { name: t.nav.more });
  await sheet.getByRole('link', { name: label, exact: true }).click();
  await expect(sheet).toBeHidden();
}
