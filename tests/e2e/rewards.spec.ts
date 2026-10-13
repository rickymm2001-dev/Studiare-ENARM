// Logros (Fase P bloque 6). Un alumno nuevo ve sus misiones en cero, la misión de aciertos
// calibrando y la liga de partida. La pantalla no se desborda de lado y no tiene violaciones serias
// de accesibilidad. Los widgets de misiones, liga e insignias se agregan al tablero de Inicio.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

test('la ruta /logros redirige a Progreso', async ({ page }) => {
  await signUp(page);
  await page.goto(SCREENS.rewards.path);
  await expect(page).toHaveURL(new RegExp(SCREENS.progress.path));
});

test('las misiones de hoy salen en Inicio sin agregarlas', async ({ page }) => {
  await signUp(page);
  await page.goto(SCREENS.home.path);
  const missions = page.getByRole('region', { name: t.widgets.names.missions });
  await expect(missions).toBeVisible();
  await expect(missions.getByRole('progressbar').first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});
