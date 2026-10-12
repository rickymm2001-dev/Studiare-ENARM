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
  escapeRegExp,
  finishExam,
  statNumber,
  statValue,
  subscribeMonthly,
} from './support/b1';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const FULL_EXAM = 280;
const ANSWERED = 3;

/** La tarjeta del examen en Simular, ya con el banco demo sembrado */
async function examCard(page: Page) {
  await page.goto(SCREENS.simulatorSetup.path);
  const card = page.getByRole('region', { name: t.exam.cardTitle });
  await expect(card.getByRole('combobox', { name: t.exam.size })).toBeVisible({ timeout: 90_000 });
  return card;
}

test('en un plan de pago el examen de 280 arranca con todo el banco, el navegador lista cada pregunta y el diálogo lo termina', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUp(page);
  await subscribeMonthly(page);
  const card = await examCard(page);

  // El tamaño por defecto es el examen completo y ya no se dice que sea de pago
  const size = card.getByRole('combobox', { name: t.exam.size });
  await expect(size).toHaveValue(String(FULL_EXAM));
  await expect(card.getByText(t.exam.fullLocked)).toHaveCount(0);

  // El banco de demostración es más chico que 280, así que la tarjeta avisa de cuántas será
  const bank = await statNumber(page, t.simulator.stats.label, t.simulator.stats.bank);
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

  // El navegador lista todas las preguntas, con su estado, y lleva a la última
  const navigator = page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: t.exam.navigatorTitle }) });
  await expect(navigator.locator('summary')).toContainText(t.exam.navigatorSummary(ANSWERED, 0));
  await navigator.locator('summary').click();
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
  const again = await examCard(page);
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
  const card = await examCard(page);
  await expect(card.getByText(t.exam.fullLocked)).toBeVisible();

  // Solo los tamaños abiertos a todos, y el que cabe en las preguntas del día como el elegido
  const size = card.getByRole('combobox', { name: t.exam.size });
  await expect(size.getByRole('option')).toHaveText(
    allowedExamSizes(false).map((option) => t.exam.sizeOption(option)),
  );
  await expect(size.getByRole('option', { name: t.exam.sizeOption(FULL_EXAM) })).toHaveCount(0);
  await expect(size).toHaveValue(String(defaultExamSize(false, PLANS.free.access.dailyQuestions)));
  await expectNoSeriousA11yViolations(page);
});
