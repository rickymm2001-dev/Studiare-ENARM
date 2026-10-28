// Examen completo de 280 (D-012, pantallas 7, 8 y 9). En un plan de pago la tarjeta de Simular lo
// propone por defecto, avisa si el banco tiene menos preguntas, el examen arranca con todas las que
// hay, el navegador las lista y se termina con el diálogo dejando el resto en blanco. En el plan
// Gratis el tamaño de 280 no se ofrece y la tarjeta dice que es de los planes de pago.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { PLANS } from '@/config/billing';
import { examTotalMs } from '@/engines/exam';
import { allowedExamSizes, defaultExamSize } from '@/features/exam/examSizes';
import { t } from '@/i18n/es-MX';
import {
  answerExamQuestions,
  bankCount,
  escapeRegExp,
  expectSegment,
  finishExam,
  openExamSetup,
  openPracticeSetup,
  segmented,
  statValue,
  subscribeMonthly,
} from './support/b1';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const FULL_EXAM = 280;
const ANSWERED = 3;

/**
 * Cuántas preguntas tiene el banco demo. La cifra va en la nota de las ramas de la práctica, porque
 * el examen reparte por rama y no las muestra
 */
async function demoBank(page: Page): Promise<number> {
  return bankCount(await openPracticeSetup(page));
}

test('en un plan de pago el examen de 280 arranca con todo el banco, el navegador lista cada pregunta y el diálogo lo termina', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUp(page);
  await subscribeMonthly(page);
  const bank = await demoBank(page);
  const card = await openExamSetup(page);

  // El tamaño por defecto es el examen completo y ya no se dice que sea de pago
  await expectSegment(card, t.exam.size, t.exam.sizeOption(FULL_EXAM));
  await expect(card.getByText(t.exam.fullLocked)).toHaveCount(0);

  // El banco de demostración es más chico que 280, así que la tarjeta avisa de cuántas será
  const total = Math.min(FULL_EXAM, bank);
  if (bank < FULL_EXAM)
    await expect(card.getByText(t.exam.shortfall(FULL_EXAM, bank))).toBeVisible();
  await expect(card.getByText(t.exam.timeTotal(examTotalMs(total)))).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await card.getByRole('button', { name: t.exam.start }).click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.exam.path}$`));
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.getByText(t.exam.progress(1, total), { exact: true })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Se contestan unas cuantas con el teclado y las demás se quedan en blanco
  await answerExamQuestions(page, total, ANSWERED);
  await expect(page.getByText(t.exam.progress(ANSWERED + 1, total), { exact: true })).toBeVisible();

  // El mapa del examen lista todas las preguntas, con su estado, y lleva a la última
  const navigator = page.getByRole('region', { name: t.exam.navigatorTitle });
  await expect(navigator.getByText(t.exam.navigatorSummary(ANSWERED, 0))).toBeVisible();
  await expect(navigator.locator('ol > li')).toHaveCount(total);
  await expect(
    navigator.getByRole('button', {
      name: t.exam.goToQuestion(1, t.exam.status.answered),
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    navigator.getByRole('button', {
      name: t.exam.goToQuestion(ANSWERED + 1, `${t.exam.status.current}, ${t.exam.status.blank}`),
      exact: true,
    }),
  ).toBeVisible();
  await navigator
    .getByRole('button', { name: t.exam.goToQuestion(total, t.exam.status.blank), exact: true })
    .click();
  await expect(page.getByText(t.exam.progress(total, total), { exact: true })).toBeVisible();

  // El diálogo dice cuántas quedan en blanco y termina. Los resultados cuentan todas las preguntas
  await finishExam(page, { answered: ANSWERED, blank: total - ANSWERED, marked: 0 });
  await expect(statValue(page, t.examResults.statsLabel, t.examResults.answered)).toHaveText(
    String(ANSWERED),
  );
  await expect(statValue(page, t.examResults.statsLabel, t.examResults.blank)).toHaveText(
    (total - ANSWERED).toLocaleString('es-MX'),
  );
  await expect(page.getByText(t.examResults.ended.completed)).toBeVisible();
  if (bank < FULL_EXAM) {
    await expect(page.getByText(t.examResults.shortfall(FULL_EXAM, total))).toBeVisible();
  }
  await expectNoSeriousA11yViolations(page);

  // Simular recuerda el último examen con su total
  const again = await openExamSetup(page);
  await expect(again.getByText(t.exam.lastTitle)).toBeVisible();
  await expect(
    again.getByText(
      new RegExp(`^${escapeRegExp(t.exam.lastBody(0, total)).replace('0', '\\d+')}$`),
    ),
  ).toBeVisible();
});

test('en el plan Gratis el examen de 280 no se ofrece y la tarjeta dice que es de los planes de pago', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUp(page);
  const card = await openExamSetup(page);
  await expect(card.getByText(t.exam.fullLocked)).toBeVisible();

  // Solo los tamaños abiertos a todos, y el que cabe en las preguntas del día como el elegido
  const sizes = segmented(card, t.exam.size).getByRole('button');
  await expect(sizes).toHaveText(
    allowedExamSizes(false).map((option) => t.exam.sizeOption(option)),
  );
  await expect(sizes.filter({ hasText: t.exam.sizeOption(FULL_EXAM) })).toHaveCount(0);
  await expectSegment(
    card,
    t.exam.size,
    t.exam.sizeOption(defaultExamSize(false, PLANS.free.access.dailyQuestions)),
  );
  await expectNoSeriousA11yViolations(page);
});
