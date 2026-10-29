// Menú de cada rol en el teléfono y en computadora (B3 del plan del cambio, D-150). En computadora la
// barra pizarra trae las primeras seis secciones en línea y Más abre las demás con Configuración al
// final. En el teléfono el dock trae las secciones principales y Más, que abre una hoja con lo demás
// (4.28). Plan, Logros y Perfil ya no están, y sus rutas viejas llevan a Configuración y a Progreso.
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
  t.navItems.calendar,
  t.navItems.tutor,
  t.navItems.party,
];
const STUDENT_BAR = [t.navItems.home, t.navItems.review, t.navItems.simulate, t.navItems.progress];
const STUDENT_MORE = [t.navItems.outlines, t.navItems.calendar, t.navItems.tutor, t.navItems.party];
/** En computadora caben seis en línea y Tutor y Party se abren desde Más (D-150) */
const STUDENT_TOP = STUDENT_MAIN.slice(0, 6);
const STUDENT_TOP_MORE = [t.navItems.tutor, t.navItems.party];
// Datos de demostración aparece porque el build de las pruebas es la demo, con demoTools prendida (5.4)
const ADMIN_GROUP = [
  t.navItems.users,
  // Admin, Pagos de B10, después de Usuarios
  t.navItems.billing,
  t.navItems.costs,
  // Auditoría de la IA (B12), después de Costos de IA
  t.navItems.audit,
  // Calibración nocturna del modelo del alumno (B14), después de la Auditoría de la IA
  t.screens.calibrationAdmin.title,
  t.navItems.platform,
  t.navItems.bank,
  // Banco en la nube (B11). Banco y Sheet, Revisiones de médicos y Catálogo de mazos
  t.screens.bankAdmin.title,
  t.screens.physicianReviews.title,
  t.screens.deckCatalogAdmin.title,
  t.screens.demoData.title,
];
const PHYSICIAN_MAIN = [
  t.navItems.bank,
  t.navItems.agreement,
  t.navItems.drafts,
  t.navItems.reports,
];
// La Auditoría de la IA (B12) no cabe en la barra del teléfono, que ya trae cuatro, y se abre desde Más
const PHYSICIAN_MORE = [t.navItems.audit];

/**
 * En computadora revisa la barra en línea, abre Más, revisa el panel y lo cierra con Escape. En el
 * teléfono hace lo mismo con el dock y la hoja
 */
async function expectMenu(
  page: Page,
  menu: {
    top: readonly string[];
    topMore: readonly string[];
    bar: readonly string[];
    more: readonly string[];
  },
): Promise<void> {
  const nav = mainNav(page);
  await expect(nav).toBeVisible();
  for (const gone of ['Plan', 'Logros', 'Perfil']) {
    await expect(nav.getByRole('link', { name: gone, exact: true })).toHaveCount(0);
  }
  const inline = isPhone(page) ? menu.bar : menu.top;
  const inMore = isPhone(page) ? menu.more : menu.topMore;
  await expect(nav.getByRole('link')).toHaveText([...inline]);
  const more = nav.getByRole('button', { name: t.navItems.more });
  await expect(more).toBeVisible();
  await more.click();
  const sheet = page.getByRole('dialog', { name: t.nav.more });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('link')).toHaveText([...inMore, t.navItems.settings]);
  await expectNoSeriousA11yViolations(page);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(more).toBeFocused();
}

test('alumno. Sus secciones en línea o en el dock, y Más con lo demás y Configuración', async ({
  page,
}) => {
  await signUp(page);
  await expectMenu(page, {
    top: STUDENT_TOP,
    topMore: STUDENT_TOP_MORE,
    bar: STUDENT_BAR,
    more: STUDENT_MORE,
  });
  await expectNoSeriousA11yViolations(page);

  // Una sección de Más abre su pantalla y deja marcado Más en el menú
  const nav = mainNav(page);
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
  await expect(page).toHaveURL(new RegExp(`${SCREENS.tutor.path}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.tutor.title);
  await expect(nav.getByRole('link', { name: t.navItems.home })).not.toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('médico. Banco, Acuerdo, Borradores y Reportes, la Auditoría de la IA en línea y Configuración en Más', async ({
  page,
}) => {
  await presetPreferences(page, { role: 'physician' });
  await page.goto(SCREENS.questionBank.path);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.questionBank.title);
  await expectMenu(page, {
    top: [...PHYSICIAN_MAIN, ...PHYSICIAN_MORE],
    topMore: [],
    bar: PHYSICIAN_MAIN,
    more: PHYSICIAN_MORE,
  });
});

test('admin. Lo del alumno y su grupo de administración con nombre dentro de Más', async ({
  page,
}) => {
  await presetPreferences(page, { role: 'admin' });
  await signUp(page);
  await expectMenu(page, {
    top: STUDENT_TOP,
    topMore: [...STUDENT_TOP_MORE, ...ADMIN_GROUP],
    bar: STUDENT_BAR,
    more: [...STUDENT_MORE, ...ADMIN_GROUP],
  });
  // El grupo de administración lleva su nombre dentro de la hoja
  await mainNav(page).getByRole('button', { name: t.navItems.more }).click();
  const admin = page
    .getByRole('dialog', { name: t.nav.more })
    .getByRole('list', { name: t.navItems.admin });
  await expect(admin.getByRole('link')).toHaveText(ADMIN_GROUP);
  await page.keyboard.press('Escape');
});

test('las rutas viejas de Perfil, Plan y Logros llevan a Configuración y a Progreso', async ({
  page,
}) => {
  await signUp(page);
  for (const [from, to, title] of [
    ['/perfil', SCREENS.settings.path, t.settings.heroTitle],
    ['/planificador', SCREENS.progress.path, t.progress.title],
    ['/logros', SCREENS.progress.path, t.progress.title],
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
