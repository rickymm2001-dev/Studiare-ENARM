// Qué quieres repasar (D-072, D-078). Arriba el modo y el botón de empezar con cuántas tarjetas
// tocan. Mazos, ramas y límites quedan plegados con un resumen, porque se cambian poco. La última
// selección se recuerda en este dispositivo.
import { Play } from 'lucide-react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import type { DailyCounters } from '@/engines/counters';
import { useMemo, useState, type ReactNode } from 'react';
import type { Card as CardEntity } from '@/data/schemas/decks';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { CheckboxField, TextField } from '@/ui/components/field';
import { DemoContentLabel } from '@/ui/components/labels';
import { BranchTopicPicker } from '../shared/BranchTopicPicker';
import { ALL_TOPICS } from '../shared/topics';
import { ReviewCounters } from './ReviewCounters';
import { loadSelection, saveSelection, type ReviewMode, type ReviewSelection } from './selection';

export function ReviewSetup({
  addDeck,
  hasDemo,
  cards,
  deckNames,
  topicOfCard,
  countFor,
  countersFor,
  leechCount,
  limits,
  limitsExtra,
  onSaveLimits,
  onStart,
}: {
  /** Atajo para agregar un mazo, junto al título */
  addDeck?: ReactNode;
  /** Algún mazo que se sigue es de demostración, así que el repaso lleva su etiqueta (4.6) */
  hasDemo: boolean;
  cards: CardEntity[];
  deckNames: Map<string, string>;
  /** Subespecialidad de cada tarjeta. null si su nota no la trae */
  topicOfCard: Map<string, string | null>;
  /** Cuántas tarjetas tocarían hoy con esta selección */
  countFor: (selection: ReviewSelection) => number;
  /** Cuántas de esas son nuevas, de aprendizaje o programadas */
  countersFor: (selection: ReviewSelection) => DailyCounters;
  /** Tarjetas que se olvidan una y otra vez, para avisar y llevar a Explorar */
  leechCount: number;
  /** Límites diarios del alumno. Se cambian aquí mismo y aplican al momento */
  limits: { newCardsPerDay: number; reviewsPerDay: number; unlimitedNewCards: boolean };
  /** Ayudas de carga diaria que van dentro de los límites, como la sugerencia de nuevas */
  limitsExtra?: ReactNode;
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
  const counters = countersFor(selection);
  const text = t.reviewSetup;

  return (
    <Card aria-labelledby="que-repasar">
      <CardHeader className="mb-3 flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle id="que-repasar" className="text-base sm:text-lg">
            {text.title}
          </CardTitle>
          {hasDemo ? <DemoContentLabel /> : null}
        </div>
        {addDeck}
      </CardHeader>
      <div className="flex flex-col gap-3">
        <fieldset>
          <legend className="sr-only">{text.mode}</legend>
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
                  'min-h-9 rounded-full border-2 px-3 text-sm font-semibold transition-all sm:min-h-touch sm:px-4',
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

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            size="lg"
            className="w-full sm:w-auto"
            disabled={total === 0}
            onClick={() => {
              saveSelection(selection, deckIds);
              onStart(selection);
            }}
          >
            <Play aria-hidden />
            {text.start(total)}
          </Button>
          {total === 0 ? <p className="text-sm text-fg-muted">{text.nothing}</p> : null}
        </div>
        {total > 0 ? (
          <ReviewCounters counters={counters} current={null} label={text.countersLabel} />
        ) : null}
        {leechCount > 0 ? (
          <p className="text-sm text-fg-muted">
            {text.leeches(leechCount)}{' '}
            <Link
              to={`${screenPath('explore')}?estado=sanguijuelas`}
              className="font-semibold text-primary underline underline-offset-2"
            >
              {text.seeLeeches}
            </Link>
          </p>
        ) : null}

        <Disclosure
          title={text.filters}
          summary={text.filtersSummary(
            selection.decks.size,
            selection.topics.size,
            ALL_TOPICS.length,
          )}
          defaultOpen={total === 0}
        >
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">{text.decks}</legend>
            <div className="grid gap-x-3 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
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
            showCount={false}
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
        </Disclosure>

        <Disclosure
          title={text.limits}
          summary={
            limits.unlimitedNewCards
              ? text.limitsSummaryUnlimited(limits.reviewsPerDay)
              : text.limitsSummary(limits.newCardsPerDay, limits.reviewsPerDay)
          }
        >
          <DailyLimits limits={limits} onSave={onSaveLimits} />
          {limitsExtra}
        </Disclosure>
      </div>
    </Card>
  );
}

/** Tarjetas nuevas y repasos por día, con guardado al momento. También están en Configuración */
function DailyLimits({
  limits,
  onSave,
}: {
  limits: { newCardsPerDay: number; reviewsPerDay: number; unlimitedNewCards: boolean };
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
    <fieldset>
      <legend className="sr-only">{t.reviewSetup.limits}</legend>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <TextField
          label={t.settings.newCardsPerDay}
          type="number"
          min={0}
          max={500}
          inputMode="numeric"
          value={newCards}
          disabled={limits.unlimitedNewCards}
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
