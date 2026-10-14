// Las cifras que el alumno publica de sí mismo en Party en la nube (B7 del plan del cambio). Salen de
// su bitácora con los mismos cálculos que la Party de la demostración, y lo único que viaja es el
// número. También dice qué duelos ya jugó aquí y el servidor todavía no tiene. Las cifras se recortan
// a los topes del servidor (PARTY_CAPS) antes de mandarlas, así nunca se rechazan. Sin React ni Dexie.
import {
  PARTY_CAPS,
  type PartyChallenge,
  type PartyDuel,
  type PartyOverview,
} from '@/data/cloud/party';
import type { AppEvent } from '@/data/schemas/events';
import type { MyPartyNumbers, PlayedDuel } from '@/data/usecases/partyCloud';
import { studyDayOf } from '@/engines/studyDay';
import type { DuelResult } from '@/engines/party';
import type { Snapshot } from '../home/snapshot';
import { duelAttemptSession, playerDuelResult } from './duels';
import { totalsBetween } from './stats';

/** El servidor deja publicar el aporte hasta un día después de que termina el reto */
const PUBLISH_GRACE_MS = 86_400_000;

/** Lo que el alumno aporta a un reto, del día en que empezó al día en que termina o a hoy */
export function contributionTo(
  challenge: Pick<PartyChallenge, 'metric' | 'startsAt' | 'endsAt'>,
  snapshot: Pick<Snapshot, 'activity' | 'today'>,
  timeZone: string,
): number {
  const metric = challenge.metric === 'accuracy' ? 'questions' : challenge.metric;
  const from = studyDayOf(new Date(challenge.startsAt), timeZone);
  const lastDay = studyDayOf(new Date(challenge.endsAt), timeZone);
  const to = lastDay < snapshot.today ? lastDay : snapshot.today;
  return totalsBetween(snapshot, from, to)[metric];
}

/**
 * El XP de la semana y el aporte a cada reto que todavía se puede publicar. El XP llega hasta el tope de
 * la semana y nadie aporta más que la meta de todo el grupo, como pide el servidor
 */
export function myPartyNumbers(
  overview: PartyOverview,
  snapshot: Pick<Snapshot, 'activity' | 'today' | 'weeklyXp'>,
  timeZone: string,
  now: Date,
): MyPartyNumbers {
  const contributions = new Map<string, number>();
  for (const group of overview.groups) {
    for (const challenge of group.challenges) {
      if (Date.parse(challenge.endsAt) <= now.getTime() - PUBLISH_GRACE_MS) continue;
      contributions.set(
        challenge.id,
        Math.min(contributionTo(challenge, snapshot, timeZone), Math.floor(challenge.target)),
      );
    }
  }
  return { weeklyXp: Math.min(snapshot.weeklyXp, PARTY_CAPS.weeklyXp), contributions };
}

/** El resultado del alumno en un duelo de la nube según su bitácora, o null si no lo ha terminado */
export function localDuelResult(
  events: readonly AppEvent[],
  duel: Pick<PartyDuel, 'id' | 'questionIds'>,
): DuelResult | null {
  return playerDuelResult(events, duel, 'self');
}

/**
 * Lo que se manda de un resultado. Un tiempo menor al mínimo por acierto se manda como el mínimo, que
 * solo puede empeorar el desempate de quien lo manda, para que el servidor nunca lo rechace (PT004)
 */
export function submittableResult(result: Pick<DuelResult, 'correct' | 'totalMs'>): {
  correct: number;
  totalMs: number;
} {
  return {
    correct: result.correct,
    totalMs: Math.max(result.totalMs, result.correct * PARTY_CAPS.duelMsPerCorrect),
  };
}

/**
 * Los duelos que el alumno ya jugó en este dispositivo y el servidor todavía no tiene. Cuenta el primer
 * intento aunque no lo haya terminado, salvo el que tiene abierto ahora en esta pestaña
 * (activeSessionId), que se manda cuando lo termine o lo deje
 */
export function playedDuelsToSubmit(
  overview: PartyOverview,
  events: readonly AppEvent[],
  activeSessionId: string | null = null,
): PlayedDuel[] {
  return overview.groups.flatMap((group) =>
    group.duels.flatMap((duel) => {
      if (duel.mine !== null) return [];
      const attempt = duelAttemptSession(events, duel.id);
      if (!attempt || attempt === activeSessionId) return [];
      const result = localDuelResult(events, duel);
      return result ? [{ duelId: duel.id, ...submittableResult(result) }] : [];
    }),
  );
}
