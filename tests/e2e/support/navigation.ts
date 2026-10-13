// Abrir una sección desde el menú en el teléfono y en computadora (B3 del plan del cambio). En
// computadora todo está en el riel. En el teléfono lo que no cabe en la barra se abre desde Más (4.28).
import type { Page } from '@playwright/test';
import { t } from '@/i18n/es-MX';
import { expect } from './fixtures';

/** Debajo de este ancho se ve la barra de abajo y no el riel. Es el lg de Tailwind */
export const isPhone = (page: Page): boolean => (page.viewportSize()?.width ?? 0) < 1024;

export const mainNav = (page: Page) => page.getByRole('navigation', { name: t.nav.label });

/** Toca una sección del menú. En el teléfono, si no está en la barra, la busca en Más */
export async function openFromMenu(page: Page, label: string): Promise<void> {
  const nav = mainNav(page);
  await expect(nav).toBeVisible();
  const direct = nav.getByRole('link', { name: label, exact: true });
  if (!isPhone(page) || (await direct.isVisible())) {
    await direct.click();
    return;
  }
  await nav.getByRole('button', { name: t.navItems.more }).click();
  const sheet = page.getByRole('dialog', { name: t.nav.more });
  await sheet.getByRole('link', { name: label, exact: true }).click();
  await expect(sheet).toBeHidden();
}
