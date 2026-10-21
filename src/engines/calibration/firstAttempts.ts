/**
 * Primeros intentos válidos de la calibración (B14, 3.4 y 3.10 del plan de B14).
 *
 * Qué hace. De todas las respuestas de los alumnos con permiso deja solo las que sirven para calibrar
 * la dificultad y los distractores, el primer intento de cada alumno en cada pregunta estable, y le
 * pega la pantalla de opciones que vio. Es donde se aplica la defensa contra datos falsos, para que un
 * alumno no mueva la dificultad de todos.
 * Entradas. Las respuestas ya ordenables, el banco por versión, las exposiciones y los topes.
 * Salidas. Los primeros intentos válidos y cuánto se dejó fuera por cada motivo, solo en números.
 * Método
 *   - Un intento por alumno y pregunta estable. Si vio la v1 y después la v2, cuenta su primera
 *     respuesta, para la versión que contestó. El orden es el del tiempo, primero el día más lejano y
 *     dentro del día el orden de llegada a la bitácora
 *   - Tope de primeros intentos por alumno y día (400, J). Un día arriba del tope no cuenta
 *   - Se quitan las respuestas más rápidas que la lectura plausible, palabras entre 6 por segundo (el
 *     umbral de behavior.ts), porque son azar y harían ver la pregunta más difícil de lo que es. Las
 *     palabras son las del caso, la viñeta y la pregunta, más las de las opciones que se mostraron. Una
 *     respuesta sin tiempo (msToAnswer ausente o que no es un número) tampoco tiene lectura plausible
 *     que demostrar, y el servidor no lo exige, así que se quita igual y se cuenta como rápida
 *   - La pantalla de opciones es la última question_shown de ese alumno y esa versión antes de la
 *     respuesta. Si no hay, o la opción elegida no estaba en ella, el intento sirve para la dificultad
 *     pero no para exposiciones y elecciones
 * Umbrales. Los de model_settings.thresholds.maxDailyFirstAttempts y thresholds.behavior.maxWordsPerSecond.
 * La otra parte de la defensa, que la respuesta tenga una lectura previa en bank_reads, la hace la base
 * al exportar.
 */
import type { Thresholds } from '@/config/thresholds';
import type {
  AnswerRow,
  BankItemRow,
  ExposureRow,
  FirstAttempt,
  FirstAttemptCounts,
} from './types';

/** El orden del tiempo. El día más lejano primero y, dentro del día, el orden de llegada */
export function chronological(a: Pick<AnswerRow, 'daysBefore' | 'seq'>, b: typeof a): number {
  return b.daysBefore - a.daysBefore || a.seq - b.seq;
}

/** La última pantalla de opciones de la lista, ordenada por seq, anterior a un seq. null si no hay */
export function lastBefore(
  list: readonly ExposureRow[] | undefined,
  seq: number,
): ExposureRow | null {
  if (!list) return null;
  let found: ExposureRow | null = null;
  for (const exposure of list) {
    if (exposure.seq >= seq) break;
    found = exposure;
  }
  return found;
}

export function indexExposures(
  exposures: readonly ExposureRow[],
): ReadonlyMap<string, readonly ExposureRow[]> {
  const index = new Map<string, ExposureRow[]>();
  for (const exposure of [...exposures].sort((a, b) => a.seq - b.seq)) {
    const key = `${exposure.person}|${exposure.versionId}`;
    const list = index.get(key);
    if (list) list.push(exposure);
    else index.set(key, [exposure]);
  }
  return index;
}

export function selectFirstAttempts(input: {
  answers: readonly AnswerRow[];
  bank: ReadonlyMap<string, BankItemRow>;
  exposures: readonly ExposureRow[];
  thresholds: Pick<Thresholds, 'behavior'>;
  maxDailyFirstAttempts: number;
}): { attempts: FirstAttempt[]; counts: FirstAttemptCounts } {
  const counts: FirstAttemptCounts = {
    answers: input.answers.length,
    unknownVersion: 0,
    repeatAttempts: 0,
    cappedDays: 0,
    cappedAttempts: 0,
    rapidExcluded: 0,
    noExposure: 0,
    inconsistentExposure: 0,
    firstAttempts: 0,
  };
  const exposureIndex = indexExposures(input.exposures);

  // Un intento por alumno y pregunta estable, el primero en el orden del tiempo
  const seen = new Set<string>();
  const first: { row: AnswerRow; item: BankItemRow }[] = [];
  for (const row of [...input.answers].sort(chronological)) {
    const item = input.bank.get(row.versionId);
    if (!item) {
      counts.unknownVersion += 1;
      continue;
    }
    const key = `${row.person}|${item.questionId}`;
    if (seen.has(key)) {
      counts.repeatAttempts += 1;
      continue;
    }
    seen.add(key);
    first.push({ row, item });
  }

  // Tope por alumno y día. Un día arriba del tope no cuenta completo
  const perDay = new Map<string, number>();
  for (const { row } of first) {
    const key = `${row.person}|${row.daysBefore}`;
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  const cappedDays = new Set(
    [...perDay].filter(([, count]) => count > input.maxDailyFirstAttempts).map(([key]) => key),
  );
  counts.cappedDays = cappedDays.size;

  // Palabras de cada opción por versión, para sumar solo las que se mostraron
  const wordsOf = new Map<string, ReadonlyMap<string, number>>();
  const optionWords = (item: BankItemRow): ReadonlyMap<string, number> => {
    let words = wordsOf.get(item.versionId);
    if (!words) {
      words = new Map(item.options.map((option) => [option.id, option.words]));
      wordsOf.set(item.versionId, words);
    }
    return words;
  };

  const attempts: FirstAttempt[] = [];
  for (const { row, item } of first) {
    if (cappedDays.has(`${row.person}|${row.daysBefore}`)) {
      counts.cappedAttempts += 1;
      continue;
    }
    const shown = lastBefore(exposureIndex.get(`${row.person}|${row.versionId}`), row.seq);
    const exposed = shown?.options.includes(row.optionId) ? shown.options : null;

    const shownWords = optionWords(item);
    const words =
      item.words + (exposed ?? []).reduce((sum, id) => sum + (shownWords.get(id) ?? 0), 0);
    const minimumMs = (Math.max(words, 1) / input.thresholds.behavior.maxWordsPerSecond) * 1000;
    if (row.ms === null || row.ms < minimumMs) {
      counts.rapidExcluded += 1;
      continue;
    }
    if (shown === null) counts.noExposure += 1;
    else if (exposed === null) counts.inconsistentExposure += 1;
    attempts.push({
      person: row.person,
      questionId: item.questionId,
      versionId: row.versionId,
      optionId: row.optionId,
      correct: row.correct,
      daysBefore: row.daysBefore,
      seq: row.seq,
      exposed,
    });
  }
  counts.firstAttempts = attempts.length;
  return { attempts, counts };
}
