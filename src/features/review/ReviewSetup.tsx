// Qué quieres repasar (D-072, D-078). Arriba el modo y el botón de empezar con cuántas tarjetas
// tocan. Mazos y ramas quedan plegados con un resumen, porque se cambian poco, y cada mazo dice sus
// ramas y todos sus temas (B4 del plan del cambio, comentario 8). La última selección se recuerda en
// este dispositivo. Aquí solo se elige lo de esta sesión. Los límites de cada día se leen aquí y se
// cambian en Ajustes del repaso, el único lugar de cada ajuste (B3 del plan).
import { CalendarCheck, Play, RotateCw, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import type { DailyCounters } from '@/engines/counters';
import { useMemo, useState, type ReactNode } from 'react';
import type { Card as CardEntity } from '@/data/schemas/decks';
import type { TopicOutline } from '@/engines/deckTopics';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { CheckboxField } from '@/ui/components/field';
import { SegmentedControl } from '@/ui/components/segmented';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
import { DeckTopics } from '../decks/DeckTopics';
import { BranchTopicPicker } from '../shared/BranchTopicPicker';
import { ALL_TOPICS } from '../shared/topics';
import { loadSelection, saveSelection, type ReviewMode, type ReviewSelection } from './selection';

const MODES: readonly ReviewMode[] = ['today', 'due', 'new'];

export function ReviewSetup({
  addDeck,
  cards,
  deckNames,
  deckTopics,
  topicOfCard,
  countFor,
  countersFor,
  leechCount,
  limits,
  onOpenSettings,
  onStart,
}: {
  /** Atajo para agregar un mazo, junto al título */
  addDeck?: ReactNode;
  cards: CardEntity[];
  deckNames: Map<string, string>;
  /** Ramas y temas de cada mazo, por el mismo ID que deckNames */
  deckTopics: ReadonlyMap<string, TopicOutline>;
  /** Subespecialidad de cada tarjeta. null si su nota no la trae */
  topicOfCard: Map<string, string | null>;
  /** Cuántas tarjetas tocarían hoy con esta selección */
  countFor: (selection: ReviewSelection) => number;
  /** Cuántas de esas son nuevas, de aprendizaje o programadas */
  countersFor: (selection: ReviewSelection) => DailyCounters;
  /** Tarjetas que se olvidan una y otra vez, para avisar y llevar a Buscar tarjetas */
  leechCount: number;
  /** Límites diarios del alumno. Aquí solo se leen */
  limits: { newCardsPerDay: number; reviewsPerDay: number; unlimitedNewCards: boolean };
  /** Abre Ajustes del repaso, donde se cambian los límites */
  onOpenSettings: () => void;
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
  const panelText = t.settingsPage.reviewSettings;

  return (
    <>
      {total > 0 ? (
        <StatPanel label={text.countersLabel}>
          <StatCell
            icon={<Sparkles />}
            label={t.review.counters.new}
            value={counters.new.toLocaleString('es-MX')}
          />
          <StatCell
            icon={<RotateCw />}
            label={t.review.counters.learning}
            value={counters.learning.toLocaleString('es-MX')}
          />
          <StatCell
            icon={<CalendarCheck />}
            label={t.review.counters.review}
            value={counters.review.toLocaleString('es-MX')}
          />
        </StatPanel>
      ) : null}
      <Card aria-labelledby="que-repasar">
        <CardHeader className="mb-3 flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle id="que-repasar" className="text-base sm:text-lg">
            {text.title}
          </CardTitle>
          {addDeck}
        </CardHeader>
        <div className="flex flex-col gap-3">
          {/* En el teléfono los modos ocupan dos renglones y cada uno se estira para llenar el suyo */}
          <SegmentedControl
            label={text.mode}
            options={MODES.map((mode) => ({ value: mode, label: text.modes[mode] }))}
            value={selection.mode}
            onChange={(mode) => {
              setSelection({ ...selection, mode });
            }}
            itemClassName="grow"
          />

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
          {leechCount > 0 ? (
            <p className="text-sm text-fg-muted">
              {text.leeches(leechCount)}{' '}
              <Link
                to={`${screenPath('explore')}?estado=sanguijuelas`}
                className="font-semibold text-primary-ink underline underline-offset-2"
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
              <legend className="eyebrow mb-1 text-fg-muted">{text.decks}</legend>
              <ul className="flex flex-col divide-y divide-line">
                {deckIds.map((deckId) => (
                  <li key={deckId} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
                    <CheckboxField
                      label={deckNames.get(deckId) ?? deckId}
                      checked={selection.decks.has(deckId)}
                      onChange={(event) => {
                        const decks = new Set(selection.decks);
                        if (event.target.checked) decks.add(deckId);
                        else decks.delete(deckId);
                        setSelection({ ...selection, decks });
                      }}
                    />
                    <DeckTopics
                      deckName={deckNames.get(deckId) ?? deckId}
                      outline={deckTopics.get(deckId)}
                      className="pl-8"
                    />
                  </li>
                ))}
              </ul>
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

          <p className="text-sm text-fg-muted">
            {limits.unlimitedNewCards
              ? panelText.limitsUnlimited(limits.reviewsPerDay)
              : panelText.limits(limits.newCardsPerDay, limits.reviewsPerDay)}{' '}
            <button
              type="button"
              onClick={onOpenSettings}
              className="font-semibold text-primary-ink underline underline-offset-2"
            >
              {panelText.changeLimits}
            </button>
          </p>
        </div>
      </Card>
    </>
  );
}
