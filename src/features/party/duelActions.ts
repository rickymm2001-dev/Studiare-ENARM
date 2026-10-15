// Lo que el alumno hace con un duelo desde Party (9.6). Crearlo fija sus preguntas y empezarlo abre la
// práctica con esas preguntas como una sesión de tipo reto. Es un solo intento. Una vez empezado no se
// vuelve a abrir, y en la nube el inicio queda también en el servidor (party_start_duel), que sin él
// no acepta el resultado. El resultado sale de la bitácora (duels.ts). En la demostración el rival es
// simulado. En la nube (B7) el rival es otro alumno y el resultado se manda al servidor una sola vez.
// Las preguntas salen de la fuente del alumno (B11, 5.4). Con el banco de la nube se eligen del catálogo
// publicado, sin variantes, y el rival baja esas versiones exactas antes de empezar. La base rechaza un
// duelo con ids que no sean versiones aprobadas (8.13).
import type { DataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import { newId } from '@/data/ids';
import type { Challenge, Group, Membership } from '@/data/schemas/activity';
import type { User } from '@/data/schemas/people';
import { createDuel } from '@/data/usecases/party';
import { DUEL_QUESTIONS } from '@/engines/party';
import { t } from '@/i18n/es-MX';
import { pickQuestions } from '../simulator/pickQuestions';
import { clock, usePractice, type PracticeState } from '../simulator/practice';
import { currentQuestionSource } from '../shared/useQuestionSource';
import { duelAttemptSession } from './duels';

/**
 * Las preguntas de un duelo, siempre las mismas con la misma semilla. Sin variantes, porque los dos
 * jugadores deben tener el mismo banco. Con el banco de demostración solo entran sus preguntas, que son
 * iguales en cualquier navegador. Con la nube, las publicadas del catálogo, que el rival baja con su id
 * de versión. Vacío si no hay banco
 */
export async function pickDuelQuestionIds(
  api: Pick<DataApi, 'repos'>,
  seed: string,
): Promise<string[]> {
  const source = currentQuestionSource(api);
  if ((await source.prepare()) !== 'ready') return [];
  const { practice } = await source.pool();
  const shared = practice.filter(
    (question) => question.variantOf === undefined && (source.kind === 'cloud' || question.isDemo),
  );
  return pickQuestions(shared, seed, DUEL_QUESTIONS).map((question) => question.id);
}

/** Reta a un compañero simulado de la demostración. null si el banco no tiene preguntas */
export async function challengeToDuel(
  api: Pick<DataApi, 'repos'>,
  group: Group,
  opponent: Pick<Membership, 'id' | 'alias'>,
): Promise<Challenge | null> {
  const id = newId();
  // La semilla es el id del duelo, así las preguntas salen en el mismo orden para quien las juegue
  const questionIds = await pickDuelQuestionIds(api, `duel|${id}`);
  if (questionIds.length === 0) return null;
  return createDuel(api, group, {
    id,
    title: t.party.duel.title(opponent.alias),
    opponent,
    questionIds,
  });
}

/** Un duelo listo para jugar. En la demostración es un reto local y en la nube un duelo del servidor */
export interface DuelToPlay {
  id: string;
  questionIds: readonly string[];
}

/** Cómo terminó el intento de abrir un duelo */
export type StartDuelOutcome =
  /** La práctica del duelo quedó abierta */
  | 'started'
  /** Ya lo había empezado, en este o en otro dispositivo. Es un solo intento */
  | 'already_started'
  /** No tiene preguntas o alguna no está en el banco de este dispositivo */
  | 'unavailable'
  /** El servidor no contestó */
  | 'failed';

/** Lo que contesta el servidor al registrar el inicio. failed si no contestó */
export type DuelStartClaim = 'started' | 'already' | 'failed';

/**
 * Abre la práctica del duelo, una sola vez. Si la bitácora ya tiene una sesión de ese duelo no la abre
 * otra vez. Tampoco si le faltan preguntas en el banco de este dispositivo, porque entonces los dos no
 * contestarían lo mismo. En la nube, claimStart registra el inicio en el servidor antes de abrirla, y si
 * el servidor dice que ya lo había empezado en otro dispositivo tampoco la abre
 */
export async function startDuel(
  api: Pick<DataApi, 'repos' | 'recordEvent'>,
  user: Pick<User, 'id' | 'timeZone'>,
  duel: DuelToPlay,
  claimStart?: () => Promise<DuelStartClaim>,
): Promise<StartDuelOutcome> {
  const questionIds = [...duel.questionIds];
  if (questionIds.length === 0) return 'unavailable';
  // La pantalla puede ir un paso atrás. Antes de abrir se revisa la bitácora guardada
  const stored = await api.repos.events.query({ userId: user.id });
  if (duelAttemptSession(stored, duel.id) !== null) return 'already_started';
  // Quien recibe el reto puede no haber abierto nunca el simulador en este dispositivo. Con la nube
  // baja las versiones exactas del duelo. Si falta alguna, los dos no contestarían lo mismo
  const source = currentQuestionSource(api);
  await source.prepare();
  const bodies = await source.ensureBodies(questionIds, 'duel');
  if (bodies.ready.length < new Set(questionIds).size) return 'unavailable';
  if (claimStart) {
    const claim = await claimStart();
    if (claim === 'already') return 'already_started';
    if (claim === 'failed') return 'failed';
  }
  const sessionId = newId();
  await api.recordEvent(
    createEvent(
      'session_started',
      { kind: 'challenge', config: { duelId: duel.id, count: questionIds.length } },
      { userId: user.id, tz: user.timeZone, sessionId },
    ),
  );
  usePractice.getState().set({
    sessionId,
    userId: user.id,
    questionIds,
    index: 0,
    answers: [],
    startedAt: clock(),
    ended: false,
    kind: 'challenge',
    duelId: duel.id,
    targetTags: [],
  });
  return 'started';
}

/**
 * La sesión del duelo que el alumno tiene abierta ahora en esta pestaña, o null. Mientras no la
 * termine se puede continuar y su resultado todavía no se manda
 */
export function activeDuelSessionOf(
  state: Pick<PracticeState, 'sessionId' | 'userId' | 'kind' | 'duelId' | 'ended'>,
  userId: string,
): string | null {
  return state.userId === userId &&
    state.kind === 'challenge' &&
    state.duelId !== null &&
    !state.ended
    ? state.sessionId
    : null;
}

/** La sesión del duelo abierta en esta pestaña, al día con la práctica */
export function useActiveDuelSession(userId: string): string | null {
  return usePractice((state) => activeDuelSessionOf(state, userId));
}
