// Registra una respuesta de opción múltiple con el XP que gana (9.5). La comparten la práctica y el
// examen, así un cambio en cómo se premia vive en un solo lugar.
import type { DataApi } from '@/data/context';
import { createEvent, type EventContext } from '@/data/events/createEvent';
import type { AppEvent, EventOf } from '@/data/schemas/events';
import type { User, UserSettings } from '@/data/schemas/people';
import { awardXp } from '@/engines/xp';
import { buildSnapshot } from '../home/snapshot';
import { volumeXpToday } from '../review/study';

export type AnsweredPayload = EventOf<'question_answered'>['payload'];

export interface RecordedAnswer {
  answered: AppEvent;
  /** Eventos de XP que se registraron para esta respuesta */
  xpEvents: AppEvent[];
  xp: number;
}

export async function recordAnswerWithXp(input: {
  api: Pick<DataApi, 'recordEvent'>;
  user: User;
  settings: UserSettings;
  /** Puede traer un reloj propio, para fechar la respuesta cuando ocurrió y no cuando se registra */
  ctx: EventContext;
  payload: AnsweredPayload;
  physicianDifficulty: number;
  /** Bitácora del alumno hasta ahora, para el multiplicador de racha y el tope de XP por volumen */
  events: readonly AppEvent[];
}): Promise<RecordedAnswer> {
  const { api, ctx, payload } = input;
  const answered = await api.recordEvent(createEvent('question_answered', payload, ctx));
  const allEvents = [...input.events, answered];
  const snapshot = buildSnapshot({
    events: allEvents,
    user: input.user,
    settings: input.settings,
    now: new Date(),
  });
  const awards = awardXp({
    activity: {
      kind: 'mcq',
      correct: payload.correct,
      physicianDifficulty: input.physicianDifficulty,
      eventId: answered.id,
    },
    streakDays: snapshot.streak.current,
    volumeXpToday: volumeXpToday(allEvents, snapshot.today),
  });
  const xpEvents: AppEvent[] = [];
  let xp = 0;
  for (const award of awards) {
    xpEvents.push(await api.recordEvent(createEvent('xp_awarded', award, ctx)));
    xp += award.amount;
  }
  return { answered, xpEvents, xp };
}
