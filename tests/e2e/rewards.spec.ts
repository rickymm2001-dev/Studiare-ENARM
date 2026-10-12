// Logros (Fase P bloque 6). Un alumno nuevo ve sus misiones en cero, la misión de aciertos
// calibrando y la liga de partida. La pantalla no se desborda de lado y no tiene violaciones serias
// de accesibilidad. Los widgets de misiones, liga e insignias se agregan al tablero de Inicio.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

test('un alumno nuevo ve sus misiones en cero y la liga de partida', async ({ page }) => {
  await signUp(page);
  await page.goto(SCREENS.rewards.path);
  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.rewards.title }),
  ).toBeVisible();
  const today = page.getByRole('region', { name: t.rewards.missionsToday });
  await expect(today).toBeVisible();
  await expect(page.getByText(t.rewards.leagueNow(t.rewards.leagues.bronze, 0))).toBeVisible();
  await expect(page.getByText(t.rewards.calibrating(0, 30))).toBeVisible();
  await expect(page.getByText(t.rewards.noRecent)).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test('las misiones de hoy salen en Inicio sin agregarlas', async ({ page }) => {
  await signUp(page);
  await page.goto(SCREENS.home.path);
  const missions = page.getByRole('region', { name: t.widgets.names.missions });
  await expect(missions).toBeVisible();
  await expect(missions.getByRole('progressbar').first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});
