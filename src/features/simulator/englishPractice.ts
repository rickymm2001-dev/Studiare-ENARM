// La práctica de Inglés médico (B13, 2.1, 2.2 y 2.4 del plan de B13). Casos de lectura completos, por
// textos y no por preguntas, aparte de la práctica en español. Aquí vive lo que no es pintura: en qué
// estado está la tarjeta (sin textos, esperando casos, calibrando o lista), cuántos textos caben con lo
// que le queda hoy a Gratis y el inicio de la práctica, que baja los cuerpos, deja la sesión en la
// bitácora y arma la práctica en curso.
import type { Thresholds } from '@/config/thresholds';
import { shortfallReason } from '@/data/bank/quota';
import type { PoolQuestion, QuestionSource } from '@/data/bank/questionSource';
import type { DataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import { newId } from '@/data/ids';
import type { User } from '@/data/schemas/people';
import { groupCaseUnits } from '@/engines/caseUnits';
import { cloudBankScreensText as bankText } from '@/i18n/cloudBankScreens';
import { chooseWithBodies } from '../shared/chooseWithBodies';
import { useBankNotice } from '../shared/bankNotice';
import { pickEnglishCases } from './pickQuestions';
import { clock, usePractice } from './practice';

/** Cuántos textos se ofrecen en la tarjeta, como en español se ofrecen 5, 10, 20 y 40 preguntas */
export const ENGLISH_TEXT_COUNTS = [1, 3, 5, 10] as const;

export type EnglishCardState =
  /** Ningún caso publicado */
  | { kind: 'none' }
  /** Hay casos, pero menos de los que pide el umbral para abrir la práctica */
  | { kind: 'waiting'; cases: number; needed: number }
  /** Práctica abierta, con menos reactivos de los que pide la parte del examen */
  | { kind: 'calibrating'; cases: number; items: number; target: number }
  /** Práctica abierta y con reactivos suficientes para la parte del examen */
  | { kind: 'ready'; cases: number; items: number };

/**
 * En qué estado está la tarjeta de inglés. Los casos salen del pool de práctica y los reactivos de la
 * parte del examen salen del pool del examen, que es el que cuenta para sus 30
 */
export function englishCardState(
  pool: { practice: readonly PoolQuestion[]; exam: readonly PoolQuestion[] },
  thresholds: Pick<Thresholds['english'], 'practiceMinCases' | 'examMinItems'>,
): EnglishCardState {
  const cases = groupCaseUnits(pool.practice).length;
  if (cases === 0) return { kind: 'none' };
  if (cases < thresholds.practiceMinCases) {
    return { kind: 'waiting', cases, needed: thresholds.practiceMinCases };
  }
  const items = pool.exam.length;
  return items < thresholds.examMinItems
    ? { kind: 'calibrating', cases, items, target: thresholds.examMinItems }
    : { kind: 'ready', cases, items };
}

export interface EnglishPracticePlan {
  /** Textos que hay en el banco */
  available: number;
  /** Textos que caben solos en lo que le queda hoy. Sin tope son todos */
  fitting: number;
  /** El texto más corto, en preguntas. null si no hay textos */
  smallest: number | null;
  /** Cuántos textos completos caben juntos en lo que le queda hoy, tomando los más cortos. Sin tope, todos */
  fits: number;
  /** Hasta cuántos textos tendrá la práctica con lo pedido y lo que cabe */
  texts: number;
}

/**
 * Cuántos textos tendrá la práctica. Un texto se concede completo o no se concede (2.2 de B11), así que
 * con el tope de Gratis solo cuentan los que caben en lo que le queda hoy. left es null sin tope. La
 * práctica real elige al azar entre los que caben, así que puede salir con menos textos que esta cuenta,
 * que por eso dice hasta cuántos
 */
export function englishPracticePlan(
  pool: readonly PoolQuestion[],
  requested: number,
  left: number | null,
): EnglishPracticePlan {
  const sizes = groupCaseUnits(pool)
    .map((unit) => unit.length)
    .toSorted((a, b) => a - b);
  let budget = left ?? Number.POSITIVE_INFINITY;
  let fits = 0;
  for (const size of sizes) {
    if (size > budget) break;
    budget -= size;
    fits += 1;
  }
  return {
    available: sizes.length,
    fitting: sizes.filter((size) => left === null || size <= left).length,
    smallest: sizes[0] ?? null,
    fits,
    texts: Math.min(Math.max(0, Math.floor(requested)), fits),
  };
}

export type StartEnglishResult = { started: true } | { started: false; message: string };

/**
 * Empieza una práctica de inglés. Elige los textos completos con la semilla de la sesión, baja sus
 * cuerpos, deja session_started con la sección y la configuración y arma la práctica en curso. Si no llega
 * ninguna pregunta no empieza y dice por qué. Si llegan menos de las pedidas, empieza con lo concedido y
 * el marco de la app dice por qué faltó lo demás, igual que en español
 */
export async function startEnglishPractice(input: {
  api: Pick<DataApi, 'recordEvent'>;
  user: Pick<User, 'id' | 'timeZone'>;
  source: Pick<QuestionSource, 'kind' | 'ensureBodies'>;
  pool: readonly PoolQuestion[];
  texts: number;
  /** Preguntas que le quedan hoy. null sin tope */
  left: number | null;
  /** Trampas a las que dirigir las opciones. Vacío es el muestreo variado */
  targetTags: readonly string[];
  secondsPerItem: number;
}): Promise<StartEnglishResult> {
  const { api, user, source, pool, targetTags } = input;
  const sessionId = newId();
  const seed = `practice-en|${sessionId}`;
  // Con la nube se bajan los cuerpos antes de empezar. Sin conexión se elige solo de lo ya bajado
  const { ids, result, fromStored } = await chooseWithBodies({
    source,
    candidates: pool,
    purpose: 'practice',
    choose: (from) =>
      pickEnglishCases(from, seed, input.texts, input.left).picked.map((question) => question.id),
  });
  const ready = new Set(result.ready);
  const ordered = ids.filter((id) => ready.has(id));
  const reason = fromStored
    ? 'offline'
    : shortfallReason({
        denied: result.denied,
        offline: result.offline,
        missing: ids.length - ordered.length,
      });
  // Sin conexión se compara con lo que se habría elegido de todo el banco, no con lo ya bajado
  const requested = fromStored
    ? pickEnglishCases(pool, seed, input.texts, input.left).picked.length
    : ids.length;
  const retryAt = result.quota?.brake.retryAt ?? null;
  if (ordered.length === 0) {
    return {
      started: false,
      message:
        reason === 'brake' && retryAt
          ? bankText.brake(retryAt)
          : reason
            ? bankText.shortfall.reasons[reason]
            : bankText.shortfall.none,
    };
  }
  if (reason && (fromStored || ordered.length < requested)) {
    useBankNotice.getState().show({ reason, granted: ordered.length, requested, retryAt });
  }
  const byId = new Map(pool.map((question) => [question.id, question] as const));
  const cases = new Set(ordered.map((id) => byId.get(id)?.caseId ?? id)).size;
  const targeted = targetTags.length > 0;
  await api.recordEvent(
    createEvent(
      'session_started',
      {
        kind: 'practice',
        config: {
          section: 'english',
          cases,
          secondsPerItem: input.secondsPerItem,
          targeted,
          count: ordered.length,
          sampling: targeted ? 'targeted' : 'diverse',
          ...(targeted ? { targetTags: [...targetTags] } : {}),
        },
      },
      { userId: user.id, tz: user.timeZone, sessionId },
    ),
  );
  usePractice.getState().set({
    sessionId,
    userId: user.id,
    questionIds: ordered,
    index: 0,
    answers: [],
    startedAt: clock(),
    ended: false,
    kind: 'practice',
    duelId: null,
    targetTags: [...targetTags],
    section: 'english',
    secondsPerItem: input.secondsPerItem,
    caseStartedAt: 0,
  });
  return { started: true };
}
