// Un historial de errores para el Tutor de una cuenta de nube (B12, 7.5). En una cuenta recién creada el
// Tutor calibra, porque no hay errores. Las pruebas de la IA necesitan que haya hipótesis, informe y consejos,
// y generar la demostración vive en otra base y sin proxy alojado. Aquí se arman con la misma función de
// eventos de la app las respuestas equivocadas y seguras de una cuenta, sobre el banco de demostración que
// la app siembra en su base al abrir Simular, y se escriben en la bitácora. Las respuestas caen en los
// últimos días, casi todas en una misma área y con una misma trampa, que es lo que el tutor busca.
import type { Page } from '@playwright/test';
import { createEvent } from '@/data/events/createEvent';
import { SCREENS } from '@/app/screens';
import { expect } from './fixtures';
import { putRows, readTable } from './b1';

interface QuestionRow {
  id: string;
  subtopic: string;
}
interface OptionRow {
  id: string;
  questionVersionId: string;
  isCorrect: boolean;
  biasTag: string | null;
}

export interface TutorHistory {
  /** El área en la que se repiten los errores */
  subtopic: string;
  /** La trampa que más elige */
  biasTag: string;
  answers: number;
}

const HOUR_MS = 3_600_000;

/** La cuenta que tiene la sesión abierta en este navegador, tal como la guardó la app */
export async function sessionUserId(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('enarm.preferences.v1') ?? '{}') as {
        sessionUserId?: unknown;
      };
      return typeof stored.sessionUserId === 'string' ? stored.sessionUserId : null;
    } catch {
      return null;
    }
  });
  if (!id) throw new Error('No hay una cuenta abierta en este navegador');
  return id;
}

/**
 * Siembra el banco de demostración en la base de la cuenta, que la app hace al abrir Simular, y le agrega
 * respuestas equivocadas y seguras de los últimos días. La mitad cae en una misma área, para que el tutor
 * confirme una hipótesis, y todas eligen la misma trampa, para que salga un consejo. Hay más de 20
 * respuestas, que es lo que pide el informe, y más de 40 con trampa, que es lo que piden los consejos
 */
export async function seedTutorHistory(page: Page, answers = 48): Promise<TutorHistory> {
  await page.goto(SCREENS.simulatorSetup.path);
  await expect
    .poll(async () => (await readTable(page, 'questions')).length, { timeout: 90_000 })
    .toBeGreaterThan(50);
  const [questions, options, userId] = await Promise.all([
    readTable<QuestionRow>(page, 'questions'),
    readTable<OptionRow>(page, 'options'),
    sessionUserId(page),
  ]);

  // Por pregunta, la opción equivocada con cada trampa
  const wrongByTag = new Map<string, Map<string, OptionRow>>();
  for (const option of options) {
    if (option.isCorrect || !option.biasTag) continue;
    const byQuestion = wrongByTag.get(option.biasTag) ?? new Map<string, OptionRow>();
    byQuestion.set(option.questionVersionId, option);
    wrongByTag.set(option.biasTag, byQuestion);
  }
  // La trampa con más preguntas, y de ellas el área con más, que es donde se acumulan los errores
  const [biasTag, withTag] =
    [...wrongByTag.entries()].sort((a, b) => b[1].size - a[1].size)[0] ?? [];
  if (!biasTag || !withTag) throw new Error('El banco de demostración no trae opciones con trampa');
  const candidates = questions.filter((question) => withTag.has(question.id));
  const bySubtopic = new Map<string, QuestionRow[]>();
  for (const question of candidates) {
    bySubtopic.set(question.subtopic, [...(bySubtopic.get(question.subtopic) ?? []), question]);
  }
  const [subtopic, focus] =
    [...bySubtopic.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
  if (!subtopic || !focus || focus.length === 0) throw new Error('No hay área con errores');
  const others = candidates.filter((question) => question.subtopic !== subtopic);

  const optionsOf = new Map<string, OptionRow[]>();
  for (const option of options) {
    optionsOf.set(option.questionVersionId, [
      ...(optionsOf.get(option.questionVersionId) ?? []),
      option,
    ]);
  }

  const now = Date.now();
  const rows = Array.from({ length: answers }, (_, index) => {
    // La mitad en el área de enfoque, que se repite entre sus pocas preguntas, y el resto repartido
    const pool = index % 2 === 0 ? focus : others;
    const question = pool[Math.floor(index / 2) % pool.length] ?? focus[0];
    const option = question ? withTag.get(question.id) : undefined;
    if (!question || !option) throw new Error('Falta una pregunta con la trampa elegida');
    // Una cada tres horas hacia atrás, que son unos seis días de historial
    const at = now - (answers - index) * 3 * HOUR_MS;
    const context = (when: number) => ({
      userId,
      tz: 'America/Merida',
      sessionId: null,
      clock: { now: () => new Date(when) },
    });
    // Las opciones que vio, que son las que miden cuánto lo atrae cada trampa: la que eligió, la
    // correcta y otras dos equivocadas
    const all = optionsOf.get(question.id) ?? [];
    const shown = [
      option,
      ...all.filter((other) => other.isCorrect).slice(0, 1),
      ...all.filter((other) => !other.isCorrect && other.id !== option.id).slice(0, 2),
    ];
    return [
      createEvent(
        'question_shown',
        {
          questionVersionId: question.id,
          shownOptions: shown.map((item, position) => ({ optionVersionId: item.id, position })),
          seed: `e2e-${String(index)}`,
          samplingMode: 'canonical',
          highlightEnabled: false,
          positionInSession: index,
        },
        context(at - 1000),
      ),
      createEvent(
        'question_answered',
        {
          questionVersionId: question.id,
          optionVersionId: option.id,
          correct: false,
          confidence: 'sure',
          msToAnswer: 70_000,
          changeCount: 0,
          highlightEnabled: false,
        },
        context(at),
      ),
    ];
  }).flat();
  await putRows(page, 'events', rows);
  return { subtopic, biasTag, answers };
}
