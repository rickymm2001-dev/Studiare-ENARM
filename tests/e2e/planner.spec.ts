// Planificador (pantalla 13, 7.10). Sin mazos ni días de estudio el plan lo dice y calibra los
// minutos. Con un mazo seguido y poco tiempo avisa de la sobrecarga y cada ajuste cambia el plan
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

test('calibra los minutos, avisa la sobrecarga y cada ajuste cambia el plan', async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page);
  await page.goto(SCREENS.planner.path);

  // Sin mazos el plan lo dice y los minutos aparecen calibrando con cuánto falta
  const today = page.getByRole('region', { name: t.planner.todayTitle });
  await expect(today.getByText(t.planner.noDecksTitle)).toBeVisible();
  await expect(today.getByText(t.planner.topicsCalibrating)).toBeVisible();
  // Y dice cuántas respuestas le faltan al tema más cercano, no solo que calibra
  await expect(today.getByText(/Faltan \d+ respuestas en un tema/)).toBeVisible();
  const time = page.getByRole('region', { name: t.planner.minutesTitle });
  await expect(time.getByText(t.states.calibrating.title)).toBeVisible();
  await expect(
    time.getByText(t.states.calibrating.remaining(3, t.planner.minutesUnit)),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Los minutos que declara el alumno se validan y se guardan
  await time.getByLabel(t.planner.minutesLabel).fill('3');
  await time.getByRole('button', { name: t.planner.minutesSave }).click();
  await expect(time.getByText(t.planner.minutesError)).toBeVisible();
  await time.getByLabel(t.planner.minutesLabel).fill('90');
  await time.getByRole('button', { name: t.planner.minutesSave }).click();
  await expect(time.getByText(t.planner.minutesSaved)).toBeVisible();
  await expect(time.getByText(new RegExp(`^${t.planner.minutesDeclared(90)}`))).toBeVisible();
  await expect(today.getByText(/^\d+ de 90 min$/).first()).toBeVisible();

  // Con un mazo seguido entran las tarjetas nuevas al plan de hoy
  await page.goto(SCREENS.decks.path);
  const deck = page.getByRole('listitem').filter({ hasText: 'Urgencias (Paco)' });
  await deck.getByRole('button', { name: t.decks.follow }).click();
  await expect(deck.getByRole('button', { name: t.decks.unfollow })).toBeVisible({
    timeout: 60_000,
  });
  await page.goto(SCREENS.planner.path);
  await expect(today.getByText(t.planner.cardsLine(0, 20))).toBeVisible();
  await expect(page.getByRole('region', { name: t.planner.overloadTitle })).toHaveCount(0);

  // Con 5 minutos la carga no cabe. Avisa y ofrece dos ajustes con su efecto
  await time.getByLabel(t.planner.minutesLabel).fill('5');
  await time.getByRole('button', { name: t.planner.minutesSave }).click();
  const warning = page.getByRole('region', { name: t.planner.overloadTitle });
  await expect(warning).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  const options = warning.getByRole('listitem');
  await expect(options).toHaveCount(2);

  // Bajar las nuevas a la mitad cambia la propuesta siguiente
  await options
    .filter({ hasText: /Baja las tarjetas nuevas a 10 por día/ })
    .getByRole('button')
    .click();
  await expect(warning.getByText(t.planner.applied)).toBeVisible();
  await expect(warning.getByText(/Baja las tarjetas nuevas a 5 por día/)).toBeVisible();

  // Subir el tiempo hace que la carga quepa y el aviso desaparece
  await options
    .filter({ hasText: /Sube tu tiempo a/ })
    .getByRole('button')
    .click();
  await expect(page.getByRole('region', { name: t.planner.overloadTitle })).toHaveCount(0);

  // Semana de 7 días, con hoy marcado
  await expect(
    page.getByRole('region', { name: t.planner.weekTitle }).getByRole('listitem'),
  ).toHaveCount(7);

  // En el teléfono el plan se abre desde Accesos en Perfil y en computadora desde el riel lateral
  const phone = (page.viewportSize()?.width ?? 0) < 1024;
  await page.goto(phone ? SCREENS.profile.path : '/');
  const scope = phone
    ? page.getByRole('main')
    : page.getByRole('navigation', { name: t.nav.label });
  await scope.getByRole('link', { name: t.navItems.planner, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.planner.title);
});
