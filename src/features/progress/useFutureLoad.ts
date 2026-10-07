// La carga futura del alumno con su configuración, lista para mostrar. Junta las tarjetas de los mazos
// que sigue con su estado más reciente y proyecta. Solo se recalcula cuando cambian sus datos o el
// periodo, porque con mazos grandes cuesta. null si no sigue ningún mazo.
import { useMemo } from 'react';
import type { Card, Deck } from '@/data/schemas/decks';
import type { AppEvent } from '@/data/schemas/events';
import { studyDayOf } from '@/engines/studyDay';
import { followedDeckIds } from '../decks/followed';
import { schedulerConfig } from '../review/schedulerConfig';
import { latestCardStates, reviewedToday } from '../review/study';
import type { ReadySession } from '../shared/RequireSession';
import { futureLoad, type FutureLoad, type LoadHorizon } from './futureLoad';

export function useFutureLoad(
  session: ReadySession,
  events: readonly AppEvent[],
  content: { decks: readonly Deck[]; cards: readonly Card[] },
  horizon: LoadHorizon,
): FutureLoad | null {
  return useMemo(() => {
    const followed = followedDeckIds(session, content.decks);
    const cards = content.cards.filter((card) => followed.has(card.deckId));
    if (cards.length === 0) return null;
    const now = new Date();
    const states = latestCardStates(events);
    return futureLoad({
      now,
      config: schedulerConfig(session),
      cards: cards.map((card) => ({
        cardId: card.id,
        noteId: card.noteId,
        state: states.get(card.id) ?? null,
      })),
      reviewedToday: reviewedToday(
        events,
        studyDayOf(now, session.user.timeZone),
        new Map(cards.map((card) => [card.id, card.noteId])),
      ),
      horizon,
    });
  }, [session, events, content, horizon]);
}
