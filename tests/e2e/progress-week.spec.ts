// La semana de Progreso (comentario 13 del plan del cambio, B3). Es lo que pasó del planificador,
// con los mismos flujos que tenía su prueba. Sin mazos la semana lo dice y los minutos calibran.
// Con un mazo seguido entran las nuevas a lo planeado, con poco tiempo avisa la sobrecarga y cada
// ajuste cambia el plan. Corre en teléfono y en computadora con los dos proyectos de Playwright.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { subscribeMonthly } from './support/b1';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

test('la semana calibra los minutos, avisa la sobrecarga y cada ajuste cambia lo planeado', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUp(page);
  // Seguir mazos del catálogo es de los planes de pago (4.25, B8)
  await subscribeMonthly(page);

  // Progreso se abre desde la navegación, el riel en computadora y la barra de abajo en el teléfono
  await page
    .getByRole('navigation', { name: t.nav.label })
    .getByRole('link', { name: t.navItems.progress, exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.progress.title);

  // Siete días desde hoy. Hoy va marcado y es el único con lo hecho, los demás traen lo planeado
  const week = page.getByRole('region', { name: t.planner.weekTitle });
  const days = week.getByRole('list', { name: t.weekPlan.daysLabel }).getByRole('listitem');
  await expect(days).toHaveCount(7);
  const today = days.first();
  await expect(today).toHaveAttribute('aria-current', 'date');
  await expect(today.getByText(t.planner.today, { exact: true })).toBeVisible();
  await expect(today.getByText(t.weekPlan.done, { exact: true })).toBeVisible();
  await expect(today.getByText(t.weekPlan.nothingDone, { exact: true })).toBeVisible();
  await expect(today.getByText(t.weekPlan.toDo, { exact: true })).toBeVisible();
  await expect(days.nth(1).getByText(t.planner.tomorrow, { exact: true })).toBeVisible();
  await expect(days.nth(1).getByText(t.weekPlan.planned, { exact: true })).toBeVisible();
  await expect(days.nth(1).getByText(t.weekPlan.done, { exact: true })).toHaveCount(0);

  // Sin mazos la semana lo dice y los minutos aparecen calibrando con cuánto falta
  await expect(week.getByText(t.planner.noDecksBody)).toBeVisible();
  const time = week.getByRole('region', { name: t.planner.minutesTitle });
  await expect(time.getByText(t.states.calibrating.title)).toBeVisible();
  await expect(
    time.getByText(t.states.calibrating.remaining(3, t.planner.minutesUnit)),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Los minutos que declara el alumno se validan, se guardan y la semana los usa
  await time.getByLabel(t.planner.minutesLabel).fill('3');
  await time.getByRole('button', { name: t.planner.minutesSave }).click();
  await expect(time.getByText(t.planner.minutesError)).toBeVisible();
  await time.getByLabel(t.planner.minutesLabel).fill('90');
  await time.getByRole('button', { name: t.planner.minutesSave }).click();
  await expect(time.getByText(t.planner.minutesSaved)).toBeVisible();
  await expect(time.getByText(new RegExp(`^${t.planner.minutesDeclared(90)}`))).toBeVisible();
  await expect(today.getByText(/ de 90 min$/)).toBeVisible();

  // Con un mazo seguido entran las tarjetas nuevas a lo que falta hoy y la carga cabe
  await page.goto(SCREENS.decks.path);
  const deck = page.getByRole('listitem').filter({ hasText: 'Urgencias (Paco)' });
  await deck.getByRole('button', { name: t.decks.follow }).click();
  await expect(deck.getByRole('button', { name: t.decks.unfollow })).toBeVisible({
    timeout: 60_000,
  });
  await page.goto(SCREENS.progress.path);
  await expect(today.getByText(new RegExp(t.planner.newShort(20)))).toBeVisible();
  await expect(week.getByText(t.planner.noDecksBody)).toHaveCount(0);
  await expect(week.getByRole('region', { name: t.planner.overloadTitle })).toHaveCount(0);

  // Con 5 minutos la carga no cabe. Avisa y ofrece dos ajustes con su efecto
  await time.getByLabel(t.planner.minutesLabel).fill('5');
  await time.getByRole('button', { name: t.planner.minutesSave }).click();
  const warning = week.getByRole('region', { name: t.planner.overloadTitle });
  await expect(warning).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  const options = warning.getByRole('listitem');
  await expect(options).toHaveCount(2);

  // Bajar las nuevas a la mitad cambia la propuesta siguiente
  await options
    .filter({ hasText: /Baja las tarjetas nuevas a 10 por día/ })
    .getByRole('button', { name: t.planner.apply })
    .click();
  await expect(week.getByText(t.planner.applied)).toBeVisible();
  await expect(warning.getByText(/Baja las tarjetas nuevas a 5 por día/)).toBeVisible();

  // Subir el tiempo hace que la carga quepa. El aviso desaparece, el cambio se confirma y el campo
  // ya muestra los minutos nuevos
  await options
    .filter({ hasText: /Sube tu tiempo a/ })
    .getByRole('button', { name: t.planner.apply })
    .click();
  await expect(week.getByRole('region', { name: t.planner.overloadTitle })).toHaveCount(0);
  await expect(week.getByText(t.planner.applied)).toBeVisible();
  await expect(time.getByLabel(t.planner.minutesLabel)).not.toHaveValue('5');
  await expect(days).toHaveCount(7);
});
