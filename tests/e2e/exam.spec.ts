// Flujo 4. Examen completo corto de 20 preguntas con descarte y marca, resultados y errores al
// repaso. Y el cierre por tiempo con sus avisos. Las respuestas se registran al terminar, así que
// los resultados esperan a que se guarden antes de revisar el repaso.
import type { Locator, Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { examTotalMs } from '@/engines/exam';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const QUESTIONS = 20;

/** Una cifra del resumen, que se lee como término y valor */
async function expectStat(summary: Locator, label: string, value: number) {
  await expect(summary.locator('dl > div').filter({ hasText: label })).toContainText(String(value));
}

async function startExam(page: Page) {
  await page.goto(SCREENS.simulatorSetup.path);
  const card = page.getByRole('region', { name: t.exam.cardTitle });
  // El banco demo se siembra la primera vez que se entra y puede tardar
  await expect(card.getByText(t.exam.timeTotal(examTotalMs(QUESTIONS)))).toBeVisible({
    timeout: 60_000,
  });
  await card.getByRole('button', { name: t.exam.start }).click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.exam.path}$`));
  await expect(page.getByRole('timer')).toBeVisible();
}

/** Mueve el inicio del examen guardado para que queden `remainingMs` de tiempo */
async function leaveTimeRemaining(page: Page, remainingMs: number) {
  await page.evaluate((remaining) => {
    const key = Object.keys(localStorage).find((name) => name.startsWith('enarm.exam.v1.'));
    if (!key) throw new Error('No hay examen guardado');
    const state = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      startedAtMs: number;
      totalMs: number;
    };
    state.startedAtMs = Date.now() - (state.totalMs - remaining);
    localStorage.setItem(key, JSON.stringify(state));
  }, remainingMs);
}

test('examen de 20 con descarte y marca, resultados y errores al repaso', async ({ page }) => {
  test.setTimeout(240_000);
  await signUp(page);
  await startExam(page);
  await expect(page.getByText(t.exam.progress(1, QUESTIONS))).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Primera pregunta. Elige A, descarta C y la marca para revisar
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: t.exam.discardOption('C') }).click();
  await expect(page.getByRole('button', { name: t.exam.restoreOption('C') })).toBeVisible();
  await page.getByRole('button', { name: t.exam.mark }).click();
  await expect(page.getByRole('button', { name: t.exam.unmark })).toBeVisible();

  // Una recarga retoma el examen donde iba, con su respuesta, su descarte y su marca
  await page.reload();
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.getByRole('radio').first()).toBeChecked();
  await expect(page.getByRole('button', { name: t.exam.restoreOption('C') })).toBeVisible();
  await expect(page.getByRole('button', { name: t.exam.unmark })).toBeVisible();

  // La segunda se queda en blanco y las demás se contestan con la primera opción
  await page.getByRole('button', { name: t.exam.next, exact: true }).click();
  await expect(page.getByText(t.exam.progress(2, QUESTIONS))).toBeVisible();
  for (let index = 2; index < QUESTIONS; index += 1) {
    await page.getByRole('button', { name: t.exam.next, exact: true }).click();
    await page.getByRole('radio').first().check();
  }
  await expect(page.getByText(t.exam.progress(QUESTIONS, QUESTIONS))).toBeVisible();

  // La cuadrícula muestra el estado de cada pregunta y lleva a cualquiera
  await page.getByText(t.exam.navigatorTitle).click();
  await expect(
    page.getByRole('button', {
      name: t.exam.goToQuestion(1, `${t.exam.status.answered}, ${t.exam.status.marked}`),
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: t.exam.goToQuestion(2, t.exam.status.blank) }),
  ).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^${t.exam.goToQuestion(2, '')}`) }).click();
  await expect(page.getByText(t.exam.progress(2, QUESTIONS))).toBeVisible();

  // Al terminar avisa cuántas quedan en blanco y cuántas marcó
  await page.getByRole('button', { name: t.exam.finish }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(t.exam.finishBody(QUESTIONS - 1, 1, 1))).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await dialog.getByRole('button', { name: t.exam.finishConfirm }).click();

  // Resultados. Las respuestas se guardan y los errores pasan al repaso
  await expect(page).toHaveURL(new RegExp(`${SCREENS.examResults.path}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.examResults.title);
  await expect(page.getByText(t.examResults.saving)).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByText(t.examResults.saveError)).toHaveCount(0);
  const summary = page.getByRole('region', { name: t.examResults.summaryTitle });
  await expectStat(summary, t.examResults.answered, QUESTIONS - 1);
  await expectStat(summary, t.examResults.blank, 1);
  await expectStat(summary, t.examResults.marked, 1);
  await expect(summary.getByText(t.examResults.notPrediction)).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: t.examResults.eliminationTitle })
      .getByText(t.examResults.eliminationBody(1, 1)),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Con 19 contestadas casi seguro hay errores. Los de la lista son los que pasaron a Mis errores
  const review = page.getByRole('region', { name: t.examResults.reviewTitle });
  await review.getByRole('button', { name: t.examResults.filter.missed }).click();
  const missed = await review.locator('ol > li').count();
  expect(missed).toBeGreaterThan(0);
  await expect(
    page
      .getByRole('region', { name: t.examResults.errorsTitle })
      .getByText(t.examResults.errorsSent(missed)),
  ).toBeVisible();
  // Una pregunta se abre y muestra su retroalimentación
  await review.locator('ol > li').first().locator('summary').click();
  await expect(review.getByText(t.examResults.explanation).first()).toBeVisible();

  // El repaso empieza por los errores y dice de dónde vienen
  await page
    .getByRole('region', { name: t.examResults.errorsTitle })
    .getByRole('link', { name: t.examResults.reviewNow })
    .click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.review.path}$`));
  await page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ }).click();
  await expect(page.getByText(t.review.errorCard)).toBeVisible();
  await page.getByRole('button', { name: t.review.confidence.unsure, exact: true }).click();
  await page.getByRole('button', { name: t.review.show }).click();
  await expect(page.getByText(t.errorCards.correctAnswer)).toBeVisible();

  // Mis errores aparece entre los mazos del alumno
  await page.goto(SCREENS.decks.path);
  const own = page.getByRole('region', { name: t.decks.yoursTitle });
  await expect(own.getByText(t.errorCards.deckName)).toBeVisible();

  // En el plan Gratis las respuestas del examen cuentan para el límite del día
  await page.goto(SCREENS.simulatorSetup.path);
  await expect(
    page.getByRole('region', { name: t.exam.cardTitle }).getByText(t.exam.limitedTo(1)),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: t.exam.cardTitle }).getByText(t.exam.lastTitle),
  ).toBeVisible();
});

test('con poco tiempo avisa y al acabarse cierra solo', async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page);
  await startExam(page);
  await page.getByRole('radio').first().check();

  // Quedan 4 minutos. Se cruzaron varios avisos de golpe y sale el más urgente
  await leaveTimeRemaining(page, 4 * 60_000);
  await page.reload();
  await expect(page.getByText(t.exam.alert.minutes(5))).toBeVisible();
  await page.getByRole('button', { name: t.exam.dismiss }).click();
  await expect(page.getByText(t.exam.alert.minutes(5))).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  // Se acaba el tiempo y el examen termina solo, con lo contestado y el resto en blanco
  await leaveTimeRemaining(page, 0);
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.examResults.path}$`));
  await expect(page.getByText(t.examResults.ended.time_up)).toBeVisible();
  await expect(page.getByText(t.examResults.saving)).toHaveCount(0, { timeout: 60_000 });
  const summary = page.getByRole('region', { name: t.examResults.summaryTitle });
  await expectStat(summary, t.examResults.answered, 1);
  await expectStat(summary, t.examResults.blank, QUESTIONS - 1);
});

test('con las alarmas apagadas el reloj sigue pero no avisa', async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page);
  await page.goto(SCREENS.simulatorSetup.path);
  const card = page.getByRole('region', { name: t.exam.cardTitle });
  await expect(card.getByText(t.exam.timeTotal(examTotalMs(QUESTIONS)))).toBeVisible({
    timeout: 60_000,
  });
  await card.getByText(t.exam.settings).click();
  await card.getByLabel(t.exam.alerts).uncheck();
  await card.getByRole('button', { name: t.exam.start }).click();
  await expect(page.getByRole('timer')).toBeVisible();

  // Quedan 4 minutos, cuando con las alarmas encendidas saldría el aviso de 5
  await leaveTimeRemaining(page, 4 * 60_000);
  await page.reload();
  const timer = page.getByRole('timer');
  await expect(timer).toBeVisible();
  // Se espera a que el reloj avance para estar seguro de que el aviso tuvo su oportunidad
  const first = await timer.getAttribute('aria-label');
  await expect(timer).not.toHaveAttribute('aria-label', first ?? '');
  await expect(page.getByText(t.exam.alert.minutes(5))).toHaveCount(0);
  await expect(page.getByText(t.exam.alert.minutes(10))).toHaveCount(0);
});

test('sin un examen guardado las pantallas lo dicen y llevan a configurarlo', async ({ page }) => {
  await signUp(page);
  await page.goto(SCREENS.exam.path);
  await expect(page.getByText(t.exam.noActive)).toBeVisible();
  await page.getByRole('link', { name: t.exam.goSetup }).click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.simulatorSetup.path}$`));
  await page.goto(SCREENS.examResults.path);
  await expect(page.getByText(t.examResults.noExam)).toBeVisible();
});
