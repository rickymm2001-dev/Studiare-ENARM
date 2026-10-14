// Los datos de Buscar tarjetas (B4 del plan del cambio, antes Explorar). Une mazos, notas, cartas y
// la bitácora en una fila por carta, con la ruta de su mazo y la de sus temas, y lo recalcula solo
// cuando cambia algo de eso. Las filas guardan el texto ya plano y normalizado, así buscar entre
// miles de tarjetas es una sola pasada.
import { useMemo } from 'react';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { isAiNote, isEditableDeck, type Card, type Deck, type Note } from '@/data/schemas/decks';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { buildSearchRows, type CardSearchRow, type CardSearchSource } from '@/engines/cardSearch';
import { deckChain } from '@/engines/deckTree';
import { suspendedCardIds } from '@/engines/suspension';
import { cardFaces, latestCardStates, type CardFaces } from '../review/study';
import { followedDeckIds } from '../decks/followed';
import { deckPlaces, noteTopicPath } from '../decks/topicPaths';
import type { ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';

export interface CardSearchData {
  /** Los mazos que se ven, los seguidos y los que los contienen */
  decks: readonly Deck[];
  /** Los mazos del alumno a los que se pueden mover notas */
  ownDecks: readonly Deck[];
  rows: readonly CardSearchRow[];
  /** La nota de una carta, para editarla en el panel */
  noteOf: (noteId: string) => Note | undefined;
  /** Cara completa en HTML de una carta, para el panel */
  facesOf: (cardId: string) => CardFaces | null;
  /** Momento en que se armaron las filas. De aquí se decide qué está vencido */
  now: Date;
}

export function useCardSearchData(session: ReadySession): CardSearchData | undefined {
  const api = useDataApi();
  const stored = useLiveData(async () => {
    const [decks, notes, cards] = await Promise.all([
      api.repos.decks.list(),
      api.repos.notes.list(),
      api.repos.cards.list(),
    ]);
    return { decks, notes, cards };
  }, [api.repos]);
  const { isDemo } = session;
  const userId = session.user.id;
  const followedDecks = session.settings.followedDecks;
  const events = useUserEvents(session.user.id);

  return useMemo(() => {
    if (!stored || !events) return undefined;
    const states = latestCardStates(events);
    // Solo lo que Repasar también ofrece, es decir lo tuyo y lo de los mazos que sigues. La base
    // local puede traer lo de otros perfiles y mazos que dejaste de seguir
    const followed = followedDeckIds(
      { isDemo, user: { id: userId }, settings: { followedDecks } },
      stored.decks,
    );
    const visibleDecks = new Set(followed);
    for (const id of followed)
      for (const deck of deckChain(stored.decks, id)) visibleDecks.add(deck.id);
    const notes = new Map<string, Note>(
      stored.notes.filter((note) => followed.has(note.deckId)).map((note) => [note.id, note]),
    );
    const placeOf = deckPlaces(stored.decks);
    const cardsById = new Map<string, Card>();
    const sources: CardSearchSource[] = [];
    for (const card of stored.cards) {
      if (!followed.has(card.deckId)) continue;
      const note = notes.get(card.noteId);
      if (!note) continue;
      cardsById.set(card.id, card);
      const faces = cardFaces(note, card.ordinal);
      const place = placeOf(card.deckId);
      sources.push({
        cardId: card.id,
        noteId: note.id,
        deckId: card.deckId,
        kind: note.kind,
        tags: note.tags,
        front: faces.front,
        back: faces.back,
        origin: note.origin,
        createdAt: card.createdAt,
        updatedAt: card.updatedAt ?? card.createdAt,
        state: states.get(card.id) ?? null,
        controversy: note.controversy ?? null,
        aiDraft: isAiNote(note),
        deckPath: place.chain,
        topicPath: noteTopicPath(note, place.chain.slice(1)),
      });
    }
    const rows = buildSearchRows(
      sources,
      suspendedCardIds(events),
      DEFAULT_THRESHOLDS.fsrs.leechLapses,
    );
    const facesOf = (cardId: string): CardFaces | null => {
      const card = cardsById.get(cardId);
      const note = card ? notes.get(card.noteId) : undefined;
      return card && note ? cardFaces(note, card.ordinal) : null;
    };
    return {
      decks: stored.decks.filter((deck) => visibleDecks.has(deck.id)),
      ownDecks: stored.decks.filter((deck) => isEditableDeck(deck, userId)),
      rows,
      noteOf: (noteId: string) => notes.get(noteId),
      facesOf,
      now: new Date(),
    };
  }, [stored, events, isDemo, userId, followedDecks]);
}
