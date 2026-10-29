// Practicar lo fallado desde los resultados del examen (pantalla 9, RetryCard). En un plan de pago,
// tras un examen de 20 con fallos, el botón abre una práctica solo con las preguntas falladas, sin
// la respuesta anterior a la vista, y la bitácora dice de dónde viene. En el plan Gratis, con las
// preguntas del día gastadas por el mismo examen, no ofrece la práctica y lo dice.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { PRACTICE_STORAGE_KEY } from '@/features/simulator/practice';
import { t } from '@/i18n/es-MX';
import {
  answerExamQuestions,
  finishExam,
  openPracticeSetup,
  readTable,
  startExam,
  subscribeMonthly,
} from './support/b1';
import {
  answerPracticeQuestion,
  expect,
  expectNoSeriousA11yViolations,
  signUp,
  test,
} from './support/fixtures';

const QUESTIONS = 20;

interface AnswerEvent {
  type: string;
  sessionId: string | null;
  payload: { questionVersionId?: string; correct?: boolean; config?: Record<string, unknown> };
}

/** Un examen de 20 contestado completo con la primera opción, hasta sus resultados guardados */
async function examWithMisses(page: Page) {
  await startExam(page, QUESTIONS);
  await answerExamQuestions(page, QUESTIONS, QUESTIONS);
  await finishExam(page, { answered: QUESTIONS, blank: 0, marked: 0 });
  // Con 20 contestadas con la primera opción casi seguro hay errores. Son los de la lista de falladas
  const review = page.getByRole('region', { name: t.examResults.reviewTitle });
  await review.getByRole('button', { name: t.examResults.filter.missed }).click();
  const missed = await review.locator('ol > li').count();
  expect(missed).toBeGreaterThan(0);
  return missed;
}

test('en un plan de pago, practicar lo fallado abre una práctica solo con las preguntas falladas', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await signUp(page);
  await subscribeMonthly(page);
  const missed = await examWithMisses(page);

  // La tarjeta ofrece todas las falladas, sin el aviso del plan Gratis
  const retry = page.getByRole('region', { name: t.examResults.retryTitle });
  await expect(retry.getByText(t.examResults.retryBody)).toBeVisible();
  await expect(retry.getByText(t.examResults.retryNoLeft)).toHaveCount(0);
  await expect(retry.getByText(t.examResults.retryLimited(missed))).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
  await retry.getByRole('button', { name: t.examResults.retryButton(missed) }).click();

  // La práctica abre con esas preguntas, en el orden del examen, y sin retroalimentación previa
  await expect(page).toHaveURL(new RegExp(`${SCREENS.question.path}$`));
  await expect(page.getByText(t.simulator.progress(1, missed), { exact: true })).toBeVisible();
  await expect(page.getByText(t.simulator.correctAnswer)).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
  const events = await readTable<AnswerEvent>(page, 'events');
  const examMissed = events
    .filter((event) => event.type === 'question_answered' && event.payload.correct === false)
    .map((event) => event.payload.questionVersionId);
  expect(examMissed).toHaveLength(missed);
  const stored = await page.evaluate(
    (key) =>
      JSON.parse(sessionStorage.getItem(key) ?? '{}') as { state?: { questionIds?: string[] } },
    PRACTICE_STORAGE_KEY,
  );
  expect(stored.state?.questionIds).toEqual(examMissed);
  const started = events.filter((event) => event.type === 'session_started');
  expect(started.at(-1)?.payload.config).toMatchObject({
    count: missed,
    sampling: 'exam_missed',
  });

  // Se contesta como cualquier práctica
  await answerPracticeQuestion(page, 1, missed);
});

test('en el plan Gratis, con las preguntas del día gastadas por el examen, no ofrece practicar lo fallado', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await signUp(page);
  await examWithMisses(page);

  // El examen de 20 gastó el límite del día, así que no hay botón y la tarjeta lo explica
  const retry = page.getByRole('region', { name: t.examResults.retryTitle });
  await expect(retry.getByText(t.examResults.retryNoLeft)).toBeVisible();
  await expect(retry.getByRole('button')).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  // Simular dice lo mismo y manda a los planes
  const practice = await openPracticeSetup(page);
  await expect(practice.getByText(t.simulator.limitReached)).toBeVisible();
  await expect(practice.getByRole('link', { name: t.simulator.seePlans })).toBeVisible();
  await expect(practice.getByRole('button', { name: t.simulator.start })).toHaveCount(0);
});
