// Cifras por mazo (V4-B3). Cada mazo que el alumno sigue o creó, con sus estadísticas y lo que se
// puede hacer con él. Sirve a los mazos del catálogo en la nube y a los propios, que no tienen una
// fila de catálogo donde mostrarlas. Los del catálogo que viene en la app ya llevan sus cifras en su
// propia fila, así que se dejan fuera con excludeUnitIds.
import { Layers } from 'lucide-react';
import { useMemo } from 'react';
import type { Deck } from '@/data/schemas/decks';
import type { FsrsCardState } from '@/data/schemas/common';
import { activeDeckStates, suspendedDeckStates } from '@/engines/deckStats';
import { descendantIds, selectionUnitId } from '@/engines/deckTree';
import { deckStatsText } from '@/i18n/deckStats';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { DeckInsights } from './DeckInsights';
import { CONTAINER_DECKS } from './topicPaths';

export function DeckStatsList({
  decks,
  cardsByDeck,
  states,
  suspended,
  followed,
  excludeUnitIds,
  timeZone,
  leechLapses,
}: {
  decks: readonly Deck[];
  cardsByDeck: ReadonlyMap<string, readonly string[]>;
  states: ReadonlyMap<string, FsrsCardState>;
  suspended: ReadonlySet<string>;
  /** Los mazos que sigue el alumno o creó, con los que cuelgan de ellos */
  followed: ReadonlySet<string>;
  /** Mazos que ya muestran sus cifras en otro lado */
  excludeUnitIds: ReadonlySet<string>;
  timeZone: string;
  leechLapses: number;
}) {
  const items = useMemo(
    () =>
      decks
        .filter(
          (deck) =>
            followed.has(deck.id) &&
            !excludeUnitIds.has(deck.id) &&
            selectionUnitId(decks, deck.id, CONTAINER_DECKS) === deck.id,
        )
        .map((deck) => {
          const cardIds = [...descendantIds(decks, deck.id)].flatMap(
            (deckId) => cardsByDeck.get(deckId) ?? [],
          );
          return { deck, cardIds };
        })
        .filter((item) => item.cardIds.length > 0),
    [decks, cardsByDeck, followed, excludeUnitIds],
  );
  if (items.length === 0) return null;
  const text = deckStatsText.list;
  return (
    <Card aria-labelledby="cifras-por-mazo">
      <CardHeader>
        <CardTitle id="cifras-por-mazo">{text.title}</CardTitle>
        <CardDescription>{text.description}</CardDescription>
      </CardHeader>
      <ul className="flex flex-col divide-y divide-line">
        {items.map(({ deck, cardIds }) => (
          <li key={deck.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-2">
              <Layers aria-hidden className="size-5 shrink-0 text-fg-muted" />
              <span className="min-w-0 flex-1 font-semibold break-words">{deck.name}</span>
              <span className="shrink-0 text-sm text-fg-muted">{text.cards(cardIds.length)}</span>
            </div>
            <DeckInsights
              unitId={deck.id}
              name={deck.name}
              states={activeDeckStates(cardIds, states, suspended)}
              suspendedStates={suspendedDeckStates(cardIds, states, suspended)}
              timeZone={timeZone}
              leechLapses={leechLapses}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
