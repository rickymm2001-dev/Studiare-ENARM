// Carga futura de Progreso. El periodo se elige aquí y la proyección la calcula useFutureLoad.
import { useState } from 'react';
import type { Card, Deck } from '@/data/schemas/decks';
import type { AppEvent } from '@/data/schemas/events';
import type { ReadySession } from '../shared/RequireSession';
import { FutureLoadCard } from './FutureLoadCard';
import type { LoadHorizon } from './futureLoad';
import { useFutureLoad } from './useFutureLoad';

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
  const load = useFutureLoad(session, events, content, horizon);
  return <FutureLoadCard load={load} horizon={horizon} onHorizon={setHorizon} />;
}
