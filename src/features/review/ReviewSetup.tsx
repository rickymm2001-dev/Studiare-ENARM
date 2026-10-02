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
import { CheckboxField, TextField } from '@/ui/components/field';
import { BranchTopicPicker } from '../shared/BranchTopicPicker';
import { ALL_TOPICS } from '../shared/topics';
import { loadSelection, saveSelection, type ReviewMode, type ReviewSelection } from './selection';

export function ReviewSetup({
  cards,
  deckNames,
  topicOfCard,
  countFor,
  limits,
  onSaveLimits,
  onStart,
}: {
  cards: CardEntity[];
  deckNames: Map<string, string>;
  /** Subespecialidad de cada tarjeta. null si su nota no la trae */
  topicOfCard: Map<string, string | null>;
  /** Cuántas tarjetas tocarían hoy con esta selección */
  countFor: (selection: ReviewSelection) => number;
  /** Límites diarios del alumno. Se cambian aquí mismo y aplican al momento */
  limits: { newCardsPerDay: number; reviewsPerDay: number };
  onSaveLimits: (patch: { newCardsPerDay: number; reviewsPerDay: number }) => Promise<unknown>;
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

        <DailyLimits limits={limits} onSave={onSaveLimits} />

        <div className="sticky bottom-[calc(var(--spacing-nav)+env(safe-area-inset-bottom)+0.5rem)] flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface/95 p-3 shadow-raised backdrop-blur lg:bottom-4">
          <Button
            size="lg"
            className="w-full sm:w-auto"
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

/** Tarjetas nuevas y repasos por día, con guardado al momento. También están en Configuración */
function DailyLimits({
  limits,
  onSave,
}: {
  limits: { newCardsPerDay: number; reviewsPerDay: number };
  onSave: (patch: { newCardsPerDay: number; reviewsPerDay: number }) => Promise<unknown>;
}) {
  const [newCards, setNewCards] = useState(String(limits.newCardsPerDay));
  const [reviews, setReviews] = useState(String(limits.reviewsPerDay));
  const [saved, setSaved] = useState(false);
  const clamp = (value: string, max: number) =>
    Math.min(max, Math.max(0, Math.round(Number(value) || 0)));
  const next = { newCardsPerDay: clamp(newCards, 500), reviewsPerDay: clamp(reviews, 5000) };
  const dirty =
    next.newCardsPerDay !== limits.newCardsPerDay || next.reviewsPerDay !== limits.reviewsPerDay;
  return (
    <fieldset className="rounded-lg border border-line p-3">
      <legend className="px-1 font-semibold">{t.reviewSetup.limits}</legend>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <TextField
          label={t.settings.newCardsPerDay}
          type="number"
          min={0}
          max={500}
          inputMode="numeric"
          value={newCards}
          onChange={(event) => {
            setNewCards(event.target.value);
            setSaved(false);
          }}
        />
        <TextField
          label={t.settings.reviewsPerDay}
          type="number"
          min={0}
          max={5000}
          inputMode="numeric"
          value={reviews}
          onChange={(event) => {
            setReviews(event.target.value);
            setSaved(false);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={!dirty}
          onClick={() => {
            void onSave(next).then(() => {
              setSaved(true);
            });
          }}
        >
          {t.settings.saveChanges}
        </Button>
      </div>
      <p role="status" className="mt-2 text-sm text-fg-muted">
        {dirty ? t.settings.unsaved : saved ? t.reviewSetup.limitsSaved : t.reviewSetup.limitsHint}
      </p>
    </fieldset>
  );
}
