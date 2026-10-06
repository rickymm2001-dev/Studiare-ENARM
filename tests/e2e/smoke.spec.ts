// Prueba de humo. Abre cada ruta de la app en teléfono y escritorio, revisa su título, la
// navegación y la accesibilidad básica con axe. Bienvenida y portada son páginas aparte, sin
// navegación (D-059, D-068), y la raíz sin sesión es la portada de venta.
import { SCREEN_KEYS, SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import {
  expect,
  expectNoSeriousA11yViolations,
  presetPreferences,
  signUp,
  test,
} from './support/fixtures';

for (const key of SCREEN_KEYS) {
  const screen = SCREENS[key];
  test(`pantalla ${screen.number} ${key} abre en ${screen.path}`, async ({ page }) => {
    // Las áreas de médico y admin piden rol. Admin puede ver ambas
    if (screen.area === 'physician' || screen.area === 'admin') {
      await presetPreferences(page, { role: 'admin' });
    }
    await page.goto(screen.path);
    const nav = page.getByRole('navigation', { name: t.nav.label });
    if (key === 'home') {
      // Sin sesión la raíz es la portada de venta. El tablero se prueba con sesión más abajo
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.landing.title);
      await expect(page).toHaveTitle(t.app.documentTitle(t.landing.documentTitle));
      await expect(nav).toHaveCount(0);
    } else {
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens[key].title);
      await expect(page).toHaveTitle(t.app.documentTitle(t.screens[key].title));
      if (key === 'onboarding') await expect(nav).toHaveCount(0);
      else await expect(nav).toBeVisible();
    }
    await expectNoSeriousA11yViolations(page);
  });
}

test('con sesión la raíz es el tablero de Inicio con su navegación', async ({ page }) => {
  await signUp(page);
  await expect(page).toHaveTitle(t.app.documentTitle(t.screens.home.title));
  await expect(page.getByRole('navigation', { name: t.nav.label })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test('navega con la barra inferior entre las 5 secciones', async ({ page }) => {
  await signUp(page);
  const nav = page.getByRole('navigation', { name: t.nav.label });
  for (const [label, key] of [
    [t.navItems.review, 'review'],
    [t.navItems.simulate, 'simulatorSetup'],
    [t.navItems.progress, 'progress'],
    [t.navItems.profile, 'profile'],
    [t.navItems.home, 'home'],
  ] as const) {
    await nav.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${SCREENS[key].path}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens[key].title);
    await expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
});

// Los estados reutilizables se ven en las pantallas que todavía son esqueleto. Hoy la más lejana es
// la del importador del banco. Cuando se construya, esta prueba pasa a la siguiente pantalla
test('cada estado reutilizable se ve y pasa axe', async ({ page }) => {
  await presetPreferences(page, { role: 'admin' });
  for (const state of ['vacio', 'cargando', 'error', 'sin-conexion', 'calibrando']) {
    await page.goto(`${SCREENS.bankImport.path}?estado=${state}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.bankImport.title);
    await expectNoSeriousA11yViolations(page);
  }
  await expect(
    page.getByText(t.states.calibrating.remaining(28, t.states.exampleUnit)),
  ).toBeVisible();
  await expect(page.getByText(t.labels.simulatedData)).toBeVisible();
});

test('el tema oscuro se aplica y se recuerda al recargar', async ({ page }) => {
  await page.goto(`${SCREENS.settings.path}?seccion=appearance`);
  await page.getByRole('radio', { name: t.theme.dark }).click();
  // El tema se ve al instante como vista previa y se queda solo al guardar (D-078)
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await page.getByRole('button', { name: t.settings.saveChanges }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await expectNoSeriousA11yViolations(page);
});

test('una ruta desconocida muestra la pantalla de no encontrada', async ({ page }) => {
  await page.goto('/no-existe');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.notFound.title);
});
