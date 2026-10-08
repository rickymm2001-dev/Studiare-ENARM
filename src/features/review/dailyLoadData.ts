// Datos que necesitan las herramientas de carga diaria. Arman las tarjetas con su estado y las
// muestras de tiempo por tarjeta desde la bitácora, sin React.
import type { FsrsCardState } from '@/data/schemas/common';
import type { Card } from '@/data/schemas/decks';
import type { AppEvent } from '@/data/schemas/events';
import type { ReviewTimeSample } from '@/engines/dailyLoad';
import type { QueueCard } from '@/engines/fsrs';

/** Las tarjetas con su último estado. Sin repasos, el estado es null y cuenta como nueva */
export function queueCardsOf(
  cards: readonly Pick<Card, 'id' | 'noteId'>[],
  states: ReadonlyMap<string, FsrsCardState>,
): QueueCard[] {
  return cards.map((card) => ({
    cardId: card.id,
    noteId: card.noteId,
    state: states.get(card.id) ?? null,
  }));
}

/** Cuánto tardó cada repaso, y si la tarjeta era nueva en ese momento */
export function timeSamplesOf(events: readonly AppEvent[]): ReviewTimeSample[] {
  const samples: ReviewTimeSample[] = [];
  for (const event of events) {
    if (event.type !== 'card_reviewed') continue;
    const before = event.payload.stateBefore;
    samples.push({
      msToReveal: event.payload.msToReveal,
      msToRate: event.payload.msToRate,
      isNew: before === null || before.state === 'new',
    });
  }
  return samples;
}
