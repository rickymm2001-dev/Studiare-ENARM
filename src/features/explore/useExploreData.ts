// Los datos de Explorar. Une mazos, notas, cartas y la bitácora en una fila por carta, y lo recalcula
// solo cuando cambia algo de eso. Las filas guardan el texto ya plano y normalizado, así buscar entre
// miles de tarjetas es una sola pasada.
import { useMemo } from 'react';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { Card, Deck, Note } from '@/data/schemas/decks';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { buildExploreRows, type ExploreRow, type ExploreSource } from '@/engines/explore';
import { suspendedCardIds } from '@/engines/suspension';
import { cardFaces, type CardFaces } from '../review/cardFaces';
import { latestCardStates } from '../review/study';
import type { ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';

export interface ExploreData {
  decks: readonly Deck[];
  rows: readonly ExploreRow[];
  /** Cara completa en HTML de una carta, para la vista previa */
  facesOf: (cardId: string) => CardFaces | null;
  /** Momento en que se armaron las filas. De aquí se decide qué está vencido */
  now: Date;
}

export function useExploreData(session: ReadySession): ExploreData | undefined {
  const api = useDataApi();
  const stored = useLiveData(async () => {
    const [decks, notes, cards] = await Promise.all([
      api.repos.decks.list(),
      api.repos.notes.list(),
      api.repos.cards.list(),
    ]);
    return { decks, notes, cards };
  }, [api.repos]);
  const events = useUserEvents(session.user.id);

  return useMemo(() => {
    if (!stored || !events) return undefined;
    const states = latestCardStates(events);
    const notes = new Map<string, Note>(stored.notes.map((note) => [note.id, note]));
    const cardsById = new Map<string, Card>();
    const sources: ExploreSource[] = [];
    for (const card of stored.cards) {
      const note = notes.get(card.noteId);
      if (!note) continue;
      cardsById.set(card.id, card);
      const faces = cardFaces(note, card);
      sources.push({
        cardId: card.id,
        noteId: note.id,
        deckId: card.deckId,
        kind: note.kind,
        ordinal: card.ordinal,
        tags: note.tags,
        front: faces.front,
        back: faces.back,
        origin: note.origin,
        isDemo: note.isDemo,
        createdAt: card.createdAt,
        updatedAt: card.updatedAt ?? card.createdAt,
        state: states.get(card.id) ?? null,
      });
    }
    const rows = buildExploreRows(
      sources,
      suspendedCardIds(events),
      DEFAULT_THRESHOLDS.fsrs.leechLapses,
    );
    const facesOf = (cardId: string): CardFaces | null => {
      const card = cardsById.get(cardId);
      const note = card ? notes.get(card.noteId) : undefined;
      return card && note ? cardFaces(note, card) : null;
    };
    return { decks: stored.decks, rows, facesOf, now: new Date() };
  }, [stored, events]);
}
