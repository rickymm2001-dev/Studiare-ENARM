// Qué quieres repasar (D-072). Antes de empezar, el alumno elige el modo, los mazos y las ramas o
// subespecialidades. Muestra cuántas tarjetas tocan con esa selección. La última selección se
// recuerda en este dispositivo.
import { Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Card as CardEntity } from '@/data/schemas/decks';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField } from '@/ui/components/field';
import { BranchTopicPicker } from '../shared/BranchTopicPicker';
import { ALL_TOPICS } from '../shared/topics';
import { loadSelection, saveSelection, type ReviewMode, type ReviewSelection } from './selection';

export function ReviewSetup({
  cards,
  deckNames,
  topicOfCard,
  countFor,
  onStart,
}: {
  cards: CardEntity[];
  deckNames: Map<string, string>;
  /** Subespecialidad de cada tarjeta. null si su nota no la trae */
  topicOfCard: Map<string, string | null>;
  /** Cuántas tarjetas tocarían hoy con esta selección */
  countFor: (selection: ReviewSelection) => number;
  onStart: (selection: ReviewSelection) => void;
}) {
  const deckIds = useMemo(() => [...new Set(cards.map((card) => card.deckId))], [cards]);
  const [selection, setSelection] = useState<ReviewSelection>(() =>
    loadSelection(deckIds, ALL_TOPICS),
  );
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const card of cards) {
      const topic = topicOfCard.get(card.id);
      if (topic && selection.decks.has(card.deckId)) map.set(topic, (map.get(topic) ?? 0) + 1);
    }
    return map;
  }, [cards, topicOfCard, selection.decks]);
  const total = countFor(selection);
  const text = t.reviewSetup;

  return (
    <Card aria-labelledby="que-repasar">
      <CardHeader>
        <CardTitle id="que-repasar">{text.title}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-2 font-semibold">{text.mode}</legend>
          <div className="flex flex-wrap gap-2">
            {(['today', 'due', 'new'] as const).map((mode: ReviewMode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={selection.mode === mode}
                onClick={() => {
                  setSelection({ ...selection, mode });
                }}
                className={cn(
                  'min-h-touch rounded-full border-2 px-4 text-sm font-semibold transition-all',
                  selection.mode === mode
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-line bg-surface hover:border-line-strong',
                )}
              >
                {text.modes[mode]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 font-semibold">{text.decks}</legend>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {deckIds.map((deckId) => (
              <CheckboxField
                key={deckId}
                label={deckNames.get(deckId) ?? deckId}
                checked={selection.decks.has(deckId)}
                onChange={(event) => {
                  const decks = new Set(selection.decks);
                  if (event.target.checked) decks.add(deckId);
                  else decks.delete(deckId);
                  setSelection({ ...selection, decks });
                }}
              />
            ))}
          </div>
        </fieldset>

        <BranchTopicPicker
          selected={selection.topics}
          counts={counts}
          countLabel={text.cards}
          onChange={(topics) => {
            setSelection({ ...selection, topics });
          }}
        />
        <CheckboxField
          label={text.untagged}
          hint={text.untaggedHint}
          checked={selection.includeUntagged}
          onChange={(event) => {
            setSelection({ ...selection, includeUntagged: event.target.checked });
          }}
        />

        <div className="sticky bottom-[calc(var(--spacing-nav)+env(safe-area-inset-bottom)+0.5rem)] flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface/95 p-3 shadow-raised backdrop-blur lg:bottom-4">
          <Button
            size="lg"
            disabled={total === 0}
            onClick={() => {
              saveSelection(selection);
              onStart(selection);
            }}
          >
            <Play aria-hidden />
            {text.start(total)}
          </Button>
          {total === 0 ? <p className="text-sm text-fg-muted">{text.nothing}</p> : null}
        </div>
      </div>
    </Card>
  );
}
