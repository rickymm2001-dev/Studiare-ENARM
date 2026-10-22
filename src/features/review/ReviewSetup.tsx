// Qué quieres repasar (D-072, D-078). Arriba el modo y el botón de empezar con cuántas tarjetas
// tocan. Mazos y ramas quedan plegados con un resumen, porque se cambian poco, y al abrirlos cada
// mazo dice sus ramas y todos sus temas ya abiertos, sin un segundo pliegue (B4 del plan del cambio,
// comentario 8). La última selección se recuerda en este dispositivo. Aquí solo se elige lo de esta
// sesión. Los límites de cada día se leen aquí y se cambian en Ajustes del repaso, el único lugar de
// cada ajuste (B3 del plan).
import { CalendarCheck, Play, RotateCw, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import type { DailyCounters } from '@/engines/counters';
import { useMemo, useState, type ReactNode } from 'react';
import type { Card as CardEntity } from '@/data/schemas/decks';
import type { TopicOutline } from '@/engines/deckTopics';
import { t } from '@/i18n/es-MX';
import { DESKTOP_QUERY, useMediaQuery } from '@/ui/hooks/use-media-query';
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

const MODES: readonly ReviewMode[] = ['today', 'due', 'new', 'topic'];

export function ReviewSetup({
  addDeck,
  plan,
  overdue,
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
  /** Plan de hoy en chico. Va en la columna de empezar, después de los contadores */
  plan?: ReactNode;
  /** Herramientas de atrasos. Van al final de la columna del botón de empezar */
  overdue?: ReactNode;
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
  const desktop = useMediaQuery(DESKTOP_QUERY);

  // Mazos, ramas y temas. En computadora van siempre a la vista en su propia columna, porque ahí sobra
  // el ancho, y en el teléfono quedan plegados con un resumen (V4-B1)
  const filtersBody = (
    <>
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
                collapsible={false}
                className="pl-8"
              />
            </li>
          ))}
        </ul>
      </fieldset>
      {/* Repasar sí muestra Inglés médico, porque ahí vive el mazo de vocabulario (B13, 2.8) */}
      <BranchTopicPicker
        selected={selection.topics}
        counts={counts}
        countLabel={text.cards}
        showCount={false}
        scope="all"
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
    </>
  );
  const filtersSummary = text.filtersSummary(
    selection.decks.size,
    selection.topics.size,
    ALL_TOPICS.length,
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
      <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-24">
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
        {plan}
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
            {selection.mode === 'topic' ? (
              <p className="text-sm text-fg-muted">{text.topicHint}</p>
            ) : null}

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
            <p className="text-sm text-fg-muted">
              {limits.unlimitedNewCards
                ? panelText.limitsUnlimited(limits.reviewsPerDay)
                : panelText.limits(limits.newCardsPerDay, limits.reviewsPerDay)}{' '}
              <button
                type="button"
                onClick={onOpenSettings}
                className="font-semibold text-primary-ink underline underline-offset-2"
              >
                {panelText.change}
              </button>
            </p>
          </div>
        </Card>
        {overdue}
      </div>

      {desktop ? (
        <Card aria-labelledby="mazos-y-temas" className="flex min-w-0 flex-col">
          <CardHeader className="mb-3 flex-row flex-wrap items-baseline justify-between gap-2">
            <CardTitle id="mazos-y-temas" className="text-base sm:text-lg">
              {text.filters}
            </CardTitle>
            <span className="text-sm text-fg-muted">{filtersSummary}</span>
          </CardHeader>
          {/* La lista completa de temas es larga. Se desplaza dentro de la tarjeta para que el botón de
              empezar y los modos no se vayan de la pantalla. Solo la tarjeta lleva el nombre, porque dos
              regiones anidadas con el mismo nombre confunden al lector de pantalla */}
          <div
            tabIndex={0}
            className="flex max-h-[calc(100dvh-15rem)] min-h-64 flex-col gap-3 overflow-y-auto pr-2"
          >
            {filtersBody}
          </div>
        </Card>
      ) : (
        <Disclosure title={text.filters} summary={filtersSummary} defaultOpen={total === 0}>
          {filtersBody}
        </Disclosure>
      )}
    </div>
  );
}
