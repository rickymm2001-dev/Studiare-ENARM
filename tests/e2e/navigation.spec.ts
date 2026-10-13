// Menú de cada rol en el teléfono y en computadora (B3 del plan del cambio). En computadora el riel
// trae las secciones arriba y Configuración fija abajo a la izquierda, separada (comentario 3). En el
// teléfono la barra trae las secciones principales y Más, que abre una hoja con lo demás (4.28). Plan,
// Logros y Perfil ya no están, y sus rutas viejas llevan a Configuración y a Progreso.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import {
  expect,
  expectNoSeriousA11yViolations,
  presetPreferences,
  signUp,
  test,
} from './support/fixtures';
import { isPhone, mainNav } from './support/navigation';

const STUDENT_MAIN = [
  t.navItems.home,
  t.navItems.review,
  t.navItems.outlines,
  t.navItems.simulate,
  t.navItems.progress,
  t.navItems.tutor,
  t.navItems.party,
];
const STUDENT_BAR = [t.navItems.home, t.navItems.review, t.navItems.simulate, t.navItems.progress];
const STUDENT_MORE = [t.navItems.outlines, t.navItems.tutor, t.navItems.party];
// Datos de demostración aparece porque el build de las pruebas es la demo, con demoTools prendida (5.4)
const ADMIN_GROUP = [
  t.navItems.users,
  t.navItems.costs,
  t.navItems.platform,
  t.navItems.bank,
  t.screens.demoData.title,
];
const PHYSICIAN_MAIN = [
  t.navItems.bank,
  t.navItems.agreement,
  t.navItems.drafts,
  t.navItems.reports,
];

/**
 * En computadora revisa el riel completo y que Configuración quede abajo a la izquierda. En el
 * teléfono revisa la barra, abre Más, revisa la hoja y la cierra con Escape
 */
async function expectMenu(
  page: Page,
  menu: { rail: readonly string[]; bar: readonly string[]; more: readonly string[] },
): Promise<void> {
  const nav = mainNav(page);
  await expect(nav).toBeVisible();
  for (const gone of ['Plan', 'Logros', 'Perfil']) {
    await expect(nav.getByRole('link', { name: gone, exact: true })).toHaveCount(0);
  }
  if (!isPhone(page)) {
    await expect(nav.getByRole('link')).toHaveText([...menu.rail, t.navItems.settings]);
    await expect(nav.getByRole('button', { name: t.navItems.more })).toHaveCount(0);
    // Configuración, sola abajo a la izquierda y debajo de todo lo demás
    const viewport = page.viewportSize();
    const settings = await nav.getByRole('link', { name: t.navItems.settings }).boundingBox();
    const last = await nav
      .getByRole('link', { name: menu.rail.at(-1) ?? '', exact: true })
      .boundingBox();
    expect(settings).not.toBeNull();
    expect(settings?.x ?? 999).toBeLessThan(100);
    expect((settings?.y ?? 0) + (settings?.height ?? 0)).toBeGreaterThan(
      (viewport?.height ?? 0) - 40,
    );
    expect(settings?.y ?? 0).toBeGreaterThan(last?.y ?? 999);
    return;
  }
  await expect(nav.getByRole('link')).toHaveText([...menu.bar]);
  const more = nav.getByRole('button', { name: t.navItems.more });
  await expect(more).toBeVisible();
  await more.click();
  const sheet = page.getByRole('dialog', { name: t.nav.more });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('link')).toHaveText([...menu.more, t.navItems.settings]);
  await expectNoSeriousA11yViolations(page);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(more).toBeFocused();
}

test('alumno. Sus secciones, Configuración abajo y en el teléfono Más con lo demás', async ({
  page,
}) => {
  await signUp(page);
  await expectMenu(page, {
    rail: STUDENT_MAIN,
    bar: STUDENT_BAR,
    more: STUDENT_MORE,
  });
  await expectNoSeriousA11yViolations(page);

  // Una sección de Más abre su pantalla y deja marcado su lugar en el menú
  const nav = mainNav(page);
  if (isPhone(page)) {
    await nav.getByRole('button', { name: t.navItems.more }).click();
    await page
      .getByRole('dialog', { name: t.nav.more })
      .getByRole('link', { name: t.navItems.tutor })
      .click();
    await expect(page.getByRole('dialog', { name: t.nav.more })).toBeHidden();
    await expect(nav.getByRole('button', { name: t.navItems.more })).toHaveAttribute(
      'aria-current',
      'true',
    );
  } else {
    await nav.getByRole('link', { name: t.navItems.tutor }).click();
    await expect(nav.getByRole('link', { name: t.navItems.tutor })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
  await expect(page).toHaveURL(new RegExp(`${SCREENS.tutor.path}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.tutor.title);
  await expect(nav.getByRole('link', { name: t.navItems.home })).not.toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('médico. Banco, Acuerdo, Borradores y Reportes, y Configuración abajo o en Más', async ({
  page,
}) => {
  await presetPreferences(page, { role: 'physician' });
  await page.goto(SCREENS.questionBank.path);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.questionBank.title);
  await expectMenu(page, { rail: PHYSICIAN_MAIN, bar: PHYSICIAN_MAIN, more: [] });
});

test('admin. Lo del alumno y su grupo de administración, en el riel o en Más', async ({ page }) => {
  await presetPreferences(page, { role: 'admin' });
  await signUp(page);
  await expectMenu(page, {
    rail: [...STUDENT_MAIN, ...ADMIN_GROUP],
    bar: STUDENT_BAR,
    more: [...STUDENT_MORE, ...ADMIN_GROUP],
  });
  if (isPhone(page)) {
    // El grupo de administración lleva su nombre dentro de la hoja
    await mainNav(page).getByRole('button', { name: t.navItems.more }).click();
    const admin = page
      .getByRole('dialog', { name: t.nav.more })
      .getByRole('list', { name: t.navItems.admin });
    await expect(admin.getByRole('link')).toHaveText(ADMIN_GROUP);
    await page.keyboard.press('Escape');
  } else {
    await expect(mainNav(page).getByRole('list', { name: t.navItems.admin })).toBeVisible();
  }
});

test('las rutas viejas de Perfil, Plan y Logros llevan a Configuración y a Progreso', async ({
  page,
}) => {
  await signUp(page);
  for (const [from, to, title] of [
    ['/perfil', SCREENS.settings.path, t.screens.settings.title],
    ['/planificador', SCREENS.progress.path, t.screens.progress.title],
    ['/logros', SCREENS.progress.path, t.screens.progress.title],
  ] as const) {
    await page.goto(SCREENS.review.path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.review.title);
    await page.goto(from);
    await expect(page).toHaveURL(new RegExp(`${to}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    // La ruta vieja no queda en el historial. Atrás vuelve a Repasar
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${SCREENS.review.path}$`));
  }
});
