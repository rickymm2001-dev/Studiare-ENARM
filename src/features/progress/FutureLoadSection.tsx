// Carga futura de Progreso. Junta las tarjetas de los mazos que sigue el alumno con su estado más
// reciente y proyecta con su configuración. La proyección solo se recalcula cuando cambian sus
// datos o el periodo, porque con mazos grandes cuesta.
import { useMemo, useState } from 'react';
import type { Card, Deck } from '@/data/schemas/decks';
import type { AppEvent } from '@/data/schemas/events';
import { studyDayOf } from '@/engines/studyDay';
import { followedDeckIds } from '../decks/followed';
import { schedulerConfig } from '../review/schedulerConfig';
import { latestCardStates, reviewedToday } from '../review/study';
import type { ReadySession } from '../shared/RequireSession';
import { FutureLoadCard } from './FutureLoadCard';
import { futureLoad, type LoadHorizon } from './futureLoad';

export function FutureLoadSection({
  session,
  events,
  content,
}: {
  session: ReadySession;
  events: readonly AppEvent[];
  content: { decks: readonly Deck[]; cards: readonly Card[] };
}) {
  const [horizon, setHorizon] = useState<LoadHorizon>(30);
  const load = useMemo(() => {
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
  return <FutureLoadCard load={load} horizon={horizon} onHorizon={setHorizon} />;
}
