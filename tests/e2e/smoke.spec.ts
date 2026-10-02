// Prueba de humo de la Fase A. Abre cada una de las 26 rutas en teléfono y escritorio,
// revisa su título, la navegación y la accesibilidad básica con axe.
import { SCREEN_KEYS, SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, test } from './support/fixtures';

for (const key of SCREEN_KEYS) {
  const screen = SCREENS[key];
  test(`pantalla ${screen.number} ${key} abre en ${screen.path}`, async ({ page }) => {
    await page.goto(screen.path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens[key].title);
    await expect(page).toHaveTitle(t.app.documentTitle(t.screens[key].title));
    await expect(page.getByRole('navigation', { name: t.nav.label })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
}

test('navega con la barra inferior entre las 5 secciones', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: t.nav.label });
  for (const [label, key] of [
    [t.navItems.review, 'review'],
    [t.navItems.simulate, 'simulatorSetup'],
    [t.navItems.progress, 'progress'],
    [t.navItems.profile, 'profile'],
    [t.navItems.home, 'home'],
  ] as const) {
    await nav.getByRole('link', { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${SCREENS[key].path}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens[key].title);
    await expect(nav.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
  }
});

test('cada estado reutilizable se ve y pasa axe', async ({ page }) => {
  for (const state of ['vacio', 'cargando', 'error', 'sin-conexion', 'calibrando']) {
    await page.goto(`/progreso?estado=${state}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.progress.title);
    await expectNoSeriousA11yViolations(page);
  }
  await expect(
    page.getByText(t.states.calibrating.remaining(28, t.states.exampleUnit)),
  ).toBeVisible();
  await expect(page.getByText(t.labels.simulatedData)).toBeVisible();
});

test('el tema oscuro se aplica y se recuerda al recargar', async ({ page }) => {
  await page.goto('/perfil');
  await page.getByRole('radio', { name: t.theme.dark }).click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await expectNoSeriousA11yViolations(page);
});

test('una ruta desconocida muestra la pantalla de no encontrada', async ({ page }) => {
  await page.goto('/no-existe');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.notFound.title);
});
