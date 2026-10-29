// Lo que comparten las specs de Cómo vas frente a otros y sus capturas (B14, paquete C, 8.4 del plan de B14). Arma el
// banco simulado con la foto de la noche y la especialidad de la cuenta, baja unas preguntas con una práctica corta y
// siembra en la bitácora del alumno lo que hizo en los días anteriores. Contestar 24 preguntas en cinco días no cabe en
// una prueba, y los eventos que se escriben son los de la app, validados con createEvent. Todo es simulado.
import type { Page } from '@playwright/test';
import { createEvent } from '@/data/events/createEvent';
import { newId } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';
import { openPracticeSetup, putRows, readTable } from './b1';
import { enterWithLink, expect, reloadWithServerFlags } from './cloudFixtures';
import { openBank, seedBank } from './fakeBank';
import { createFakeBankStore } from './fakeBankStore';
import { createFakeModelStore, type FakeModelStore } from './fakeModelStore';
import { attachBank, attachModel, type FakeSupabaseServer } from './fakeSupabase';
import { sessionUserId } from './tutorHistory';

/** La alumna de las specs de comparación */
export const COMPARISON_STUDENT = 'ana.comparacion@ejemplo.mx';
const DAY_MS = 86_400_000;
const TIME_ZONE = 'America/Merida';

interface QuestionRow {
  id: string;
  branch: string;
}
interface OptionRow {
  id: string;
  questionVersionId: string;
  isCorrect: boolean;
}

/** El banco simulado con sus preguntas, el modelo con la foto de la noche y la especialidad de la cuenta */
export function cloudWith(
  cloud: FakeSupabaseServer,
  seed: (model: FakeModelStore) => void,
  specialty: string | null,
): { model: FakeModelStore } {
  const bank = createFakeBankStore();
  attachBank(cloud, bank);
  seedBank(bank, 20);
  const model = createFakeModelStore();
  attachModel(cloud, model);
  seed(model);
  const user = cloud.createUser({ email: COMPARISON_STUDENT, alias: 'Ana' });
  model.specialties.set(user.id, specialty);
  return { model };
}

/** Entra con el banco abierto y la prueba gratis prendidos en el servidor, como lo hará Ricardo */
export async function enterWithOpenBank(page: Page, cloud: FakeSupabaseServer) {
  openBank(cloud);
  cloud.setFeatureFlags({ freeTrial: true });
  await enterWithLink(page, cloud, COMPARISON_STUDENT, 'Ana');
  await reloadWithServerFlags(page);
}

/** Empieza una práctica corta, que baja y guarda preguntas del banco en la cuenta, y vuelve a Inicio */
export async function downloadQuestions(page: Page): Promise<void> {
  const practice = await openPracticeSetup(page, { count: 5 });
  await practice.getByRole('button', { name: t.simulator.start }).click();
  await expect(page.getByText(t.simulator.progress(1, 5), { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(async () => (await readTable(page, 'questions')).length, { timeout: 30_000 })
    .toBeGreaterThan(0);
}

export interface OwnHistory {
  branch: string;
  answers: number;
  correct: number;
  reviews: number;
  days: number;
}

/**
 * Siembra en la bitácora de la cuenta, en los días anteriores a hoy, respuestas de simulador de una rama con
 * las preguntas que ya bajó y repasos de tarjetas. Los eventos son los de la app, validados con createEvent
 */
export async function seedOwnHistory(
  page: Page,
  history: { answers: number; correct: number; reviews: number; days: number },
): Promise<OwnHistory> {
  const [questions, options, userId] = await Promise.all([
    readTable<QuestionRow>(page, 'questions'),
    readTable<OptionRow>(page, 'options'),
    sessionUserId(page),
  ]);
  const first = questions[0];
  if (!first) throw new Error('La cuenta no bajó ninguna pregunta');
  const pool = questions.filter((question) => question.branch === first.branch);
  // Cada sesión cae a las 12 del día en Mérida, de hace dos días hacia atrás. Así ninguna respuesta cruza el
  // corte de las 4 de la mañana del día de estudio y todas quedan antes del día de estudio de hoy
  const meridaNow = new Date(Date.now() - 6 * 3_600_000);
  const noon = (daysAgo: number) =>
    Date.UTC(
      meridaNow.getUTCFullYear(),
      meridaNow.getUTCMonth(),
      meridaNow.getUTCDate() - daysAgo,
      12 + 6,
    );
  const context = (at: number, sessionId: string | null) => ({
    userId,
    tz: TIME_ZONE,
    sessionId,
    clock: { now: () => new Date(at) },
  });
  const rows: unknown[] = [];
  const sessions = Array.from({ length: history.days }, (_, index) => ({
    id: newId(),
    startedAt: noon(index + 2),
  }));
  for (const session of sessions) {
    rows.push(
      createEvent(
        'session_started',
        { kind: 'practice', config: {} },
        context(session.startedAt, session.id),
      ),
    );
  }
  for (let index = 0; index < history.answers; index += 1) {
    const session = sessions[index % history.days];
    const question = pool[index % pool.length];
    if (!session || !question) throw new Error('Falta una sesión o una pregunta');
    const own = options.filter((option) => option.questionVersionId === question.id);
    const correct = index < history.correct;
    const option = own.find((item) => item.isCorrect === correct) ?? own[0];
    if (!option) throw new Error('La pregunta no trae opciones');
    rows.push(
      createEvent(
        'question_answered',
        {
          questionVersionId: question.id,
          optionVersionId: option.id,
          correct,
          confidence: 'sure',
          msToAnswer: 70_000,
          changeCount: 0,
          highlightEnabled: false,
        },
        context(session.startedAt + (index + 1) * 60_000, session.id),
      ),
    );
  }
  for (let index = 0; index < history.reviews; index += 1) {
    const session = sessions[index % history.days];
    if (!session) throw new Error('Falta una sesión');
    const at = session.startedAt + 3_600_000 + index * 1000;
    rows.push(
      createEvent(
        'card_reviewed',
        {
          cardId: newId(),
          deckId: newId(),
          source: 'card',
          rating: 'good',
          confidence: null,
          msToReveal: 3000,
          msToRate: 2000,
          stateBefore: null,
          stateAfter: {
            due: new Date(at + 5 * DAY_MS).toISOString(),
            stability: 5,
            difficulty: 5,
            scheduledDays: 5,
            learningSteps: 0,
            reps: 1,
            lapses: 0,
            state: 'review',
            lastReview: new Date(at).toISOString(),
          },
        },
        context(at, null),
      ),
    );
  }
  await putRows(page, 'events', rows);
  return { branch: first.branch, ...history };
}
