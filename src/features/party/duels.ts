// Duelos de Party (9.6). Las mismas preguntas para los dos jugadores, gana más exactitud y desempata
// el menor tiempo. El resultado del alumno sale de su bitácora, sin guardar nada aparte. El del rival
// simulado sale de una semilla por compañero y duelo, y la interfaz lo marca como simulado (D-028).
// Sin React ni Dexie.
import type { Challenge, Membership } from '@/data/schemas/activity';
import type { AppEvent } from '@/data/schemas/events';
import { decideDuel, DUEL_QUESTIONS, type DuelResult } from '@/engines/party';
import { createRng } from '@/engines/random';

/** Aciertos por pregunta que va de lo más flojo a lo más fuerte entre los compañeros simulados */
const SKILL_MIN = 0.45;
const SKILL_SPAN = 0.4;
/** Segundos por pregunta de lo más rápido a lo más lento */
const SECONDS_MIN = 35;
const SECONDS_SPAN = 50;

/** Cuántas preguntas tiene el duelo. Las que se fijaron al crearlo */
export const duelSize = (challenge: Pick<Challenge, 'questionIds'>) =>
  challenge.questionIds?.length ?? DUEL_QUESTIONS;

/**
 * Resultado del alumno en un duelo, o null si todavía no lo juega. Cuenta la sesión de tipo reto de
 * ese duelo que ya terminó. Las que no contestó cuentan como incorrectas. El tiempo es la suma de lo
 * que tardó en contestar, sin lo que dedicó a leer la retroalimentación
 */
export function playerDuelResult(
  events: readonly AppEvent[],
  challenge: Pick<Challenge, 'id' | 'questionIds'>,
  memberId: string,
): DuelResult | null {
  const sessions = new Set<string>();
  for (const event of events) {
    if (
      event.type === 'session_started' &&
      event.payload.kind === 'challenge' &&
      event.payload.config.duelId === challenge.id &&
      event.sessionId
    )
      sessions.add(event.sessionId);
  }
  const ended = events.find(
    (event) =>
      event.type === 'session_ended' &&
      event.payload.kind === 'challenge' &&
      event.sessionId !== null &&
      sessions.has(event.sessionId),
  );
  if (!ended?.sessionId) return null;
  const questions = new Set(challenge.questionIds ?? []);
  let correct = 0;
  let totalMs = 0;
  const seen = new Set<string>();
  for (const event of events) {
    if (event.type !== 'question_answered' || event.sessionId !== ended.sessionId) continue;
    // Una pregunta del duelo cuenta una sola vez, la primera vez que se contestó
    if (seen.has(event.payload.questionVersionId)) continue;
    if (questions.size > 0 && !questions.has(event.payload.questionVersionId)) continue;
    seen.add(event.payload.questionVersionId);
    if (event.payload.correct) correct += 1;
    totalMs += event.payload.msToAnswer;
  }
  return { memberId, correct, answered: duelSize(challenge), totalMs };
}

/**
 * Resultado de un compañero simulado, ya jugado. Cada compañero tiene su nivel y su ritmo estables y
 * cada duelo agrega un poco de suerte, así gana unos y pierde otros
 */
export function simulatedDuelResult(
  opponent: Pick<Membership, 'id'>,
  challenge: Pick<Challenge, 'id' | 'questionIds'>,
): DuelResult {
  const size = duelSize(challenge);
  const skill = SKILL_MIN + createRng(`duel-skill|${opponent.id}`).next() * SKILL_SPAN;
  const secondsEach = SECONDS_MIN + createRng(`duel-pace|${opponent.id}`).next() * SECONDS_SPAN;
  const luck = createRng(`duel|${challenge.id}|${opponent.id}`);
  const correct = Math.min(
    size,
    Math.max(0, Math.round(size * (skill + (luck.next() - 0.5) * 0.2))),
  );
  const totalMs = Math.round(size * (secondsEach + luck.next() * 10)) * 1000;
  return { memberId: opponent.id, correct, answered: size, totalMs };
}

export type DuelVerdict = { kind: 'draw' } | { kind: 'win' | 'lose'; by: 'accuracy' | 'time' };

export type DuelView =
  /** El alumno todavía no juega. No se le muestra el resultado del rival */
  | { status: 'pending' }
  | { status: 'decided'; self: DuelResult; rival: DuelResult; verdict: DuelVerdict };

/** Lo que muestra un duelo desde el punto de vista del alumno */
export function duelView(input: {
  events: readonly AppEvent[];
  challenge: Pick<Challenge, 'id' | 'questionIds'>;
  selfId: string;
  opponent: Pick<Membership, 'id'>;
}): DuelView {
  const self = playerDuelResult(input.events, input.challenge, input.selfId);
  if (!self) return { status: 'pending' };
  const rival = simulatedDuelResult(input.opponent, input.challenge);
  const outcome = decideDuel(self, rival);
  const verdict: DuelVerdict =
    outcome.kind === 'draw'
      ? { kind: 'draw' }
      : { kind: outcome.memberId === self.memberId ? 'win' : 'lose', by: outcome.by };
  return { status: 'decided', self, rival, verdict };
}
