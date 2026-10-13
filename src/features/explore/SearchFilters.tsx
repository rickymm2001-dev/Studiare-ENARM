// Filtros de Buscar tarjetas (B4 del plan del cambio). En la computadora son chips con su conteo,
// mazo, tema, estado, vencidas, sanguijuelas y marcadas por la IA, y Más filtros para lo que se usa
// poco, el tipo, el origen, el orden y las etiquetas. Los chips de mazo, tema, estado y Más filtros
// abren sus opciones debajo, una a la vez, y Escape las cierra. En el teléfono todo vive en una hoja
// de filtros que se abre con un botón y que es un diálogo de Radix, así atrapa el foco, se cierra
// con Escape y se nombra con su título.
import { SlidersHorizontal, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  CARD_STATES,
  type CardSearchFacets,
  type CardSortKey,
  type CardState,
} from '@/engines/cardSearch';
import { deckIndent } from '@/engines/deckTree';
import type { TagNode } from '@/engines/tagPath';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Disclosure } from '@/ui/components/disclosure';
import { SelectField } from '@/ui/components/field';
import { FilterChip, FilterMenuChip } from '@/ui/components/filter-chip';
import type { DeckOption, TopicOption } from './filterOptions';
import { activeFilterCount, hasActiveFilters, type SearchView } from './searchView';
import { TagTree } from './TagTree';

const SORT_KEYS: readonly CardSortKey[] = [
  'created',
  'updated',
  'front',
  'deck',
  'topic',
  'status',
  'due',
  'interval',
  'lapses',
];

const count = (n: number) => n.toLocaleString('es-MX');

export interface FiltersProps {
  view: SearchView;
  onChange: (patch: Partial<SearchView>) => void;
  onClear: () => void;
  deckChoices: readonly DeckOption[];
  topicChoices: readonly TopicOption[];
  facets: CardSearchFacets;
  /** Tipos de nota que existen en las tarjetas */
  kinds: readonly string[];
  /** Árbol de etiquetas con su conteo. Se arma solo al abrir Más filtros */
  tagNodes: () => readonly TagNode[];
  /** Cuántas tarjetas dan los filtros de ahora */
  results: number;
}

type Panel = 'deck' | 'topic' | 'status' | 'more';

/** El texto y el conteo de cada chip que abre opciones, con lo que ya está elegido */
function chipLabels(props: FiltersProps) {
  const { view, deckChoices, facets } = props;
  const text = t.cardSearch;
  const deck = deckChoices.find((option) => option.id === view.deckId);
  const states = CARD_STATES.filter((state) => view.states.has(state));
  const [onlyState] = states;
  return {
    deck: deck ? text.chipValue(text.deck, deck.name) : text.deck,
    deckCount: deck ? count(deck.count) : undefined,
    topic: view.topic ? text.chipValue(text.topic, view.topic.path.at(-1) ?? '') : text.topic,
    topicCount: view.topic ? count(facets.topics.get(view.topic.key) ?? 0) : undefined,
    status:
      states.length === 0
        ? text.status
        : text.chipValue(
            text.status,
            text.someStatuses(states.map((state) => text.statuses[state])),
          ),
    statusCount:
      states.length === 1 && onlyState !== undefined ? count(facets.states[onlyState]) : undefined,
  };
}

/** Los mazos, cada uno con su sangría de árbol y su conteo. Elegir uno cierra las opciones */
function DeckChoices({
  view,
  choices,
  onPick,
}: {
  view: SearchView;
  choices: readonly DeckOption[];
  onPick: (deckId: string) => void;
}) {
  return (
    <ul className="flex max-h-80 flex-col overflow-y-auto">
      <li>
        <ChoiceButton
          pressed={view.deckId === ''}
          onClick={() => {
            onPick('');
          }}
        >
          {t.cardSearch.allDecks}
        </ChoiceButton>
      </li>
      {choices.map((option) => (
        <li key={option.id}>
          <ChoiceButton
            pressed={view.deckId === option.id}
            depth={option.depth}
            count={option.count}
            onClick={() => {
              onPick(option.id);
            }}
          >
            {option.name}
          </ChoiceButton>
        </li>
      ))}
    </ul>
  );
}

/** Los temas de la rama al más fino, con su conteo. Elegir uno cierra las opciones */
function TopicChoices({
  view,
  choices,
  onPick,
}: {
  view: SearchView;
  choices: readonly TopicOption[];
  onPick: (option: TopicOption | null) => void;
}) {
  if (choices.length === 0) return <p className="text-sm text-fg-muted">{t.cardSearch.noTopics}</p>;
  return (
    <ul className="flex max-h-80 flex-col overflow-y-auto">
      <li>
        <ChoiceButton
          pressed={view.topic === null}
          onClick={() => {
            onPick(null);
          }}
        >
          {t.cardSearch.allTopics}
        </ChoiceButton>
      </li>
      {choices.map((option) => (
        <li key={option.key}>
          <ChoiceButton
            pressed={view.topic?.key === option.key}
            depth={option.depth}
            count={option.count}
            onClick={() => {
              onPick(option);
            }}
          >
            {option.path.at(-1)}
          </ChoiceButton>
        </li>
      ))}
    </ul>
  );
}

function ChoiceButton({
  pressed,
  depth = 0,
  count: total,
  onClick,
  children,
}: {
  pressed: boolean;
  depth?: number;
  count?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      style={{ paddingLeft: `${String(0.5 + depth)}rem` }}
      className={cn(
        'flex min-h-9 w-full items-center justify-between gap-3 rounded-md pr-2 text-left text-sm hover:bg-muted',
        pressed && 'bg-primary-soft font-semibold text-primary-ink',
      )}
    >
      <span className="min-w-0 break-words">{children}</span>
      {total === undefined ? null : (
        <span className="shrink-0 text-xs text-fg-muted tabular-nums">{count(total)}</span>
      )}
    </button>
  );
}

/** Los estados, que se combinan con O, y los chips que se prenden y se apagan */
function StatusChoices({
  view,
  facets,
  onChange,
}: Pick<FiltersProps, 'view' | 'facets' | 'onChange'>) {
  const setState = (state: CardState, on: boolean) => {
    const next = new Set(view.states);
    if (on) next.add(state);
    else next.delete(state);
    onChange({ states: next });
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {CARD_STATES.map((state) => (
        <FilterChip
          key={state}
          pressed={view.states.has(state)}
          count={count(facets.states[state])}
          onPressedChange={(on) => {
            setState(state, on);
          }}
        >
          {t.cardSearch.statuses[state]}
        </FilterChip>
      ))}
    </div>
  );
}

function ToggleChips({
  view,
  facets,
  onChange,
}: Pick<FiltersProps, 'view' | 'facets' | 'onChange'>) {
  const text = t.cardSearch;
  return (
    <>
      <FilterChip
        pressed={view.due}
        count={count(facets.due)}
        onPressedChange={(due) => {
          onChange({ due });
        }}
      >
        {text.due}
      </FilterChip>
      <FilterChip
        pressed={view.leech}
        count={count(facets.leech)}
        onPressedChange={(leech) => {
          onChange({ leech });
        }}
      >
        {text.leech}
      </FilterChip>
      <FilterChip
        pressed={view.flagged}
        count={count(facets.flagged)}
        onPressedChange={(flagged) => {
          onChange({ flagged });
        }}
      >
        {text.flagged}
      </FilterChip>
    </>
  );
}

/** Lo que se usa poco. Tipo, origen, orden y etiquetas */
function MoreChoices({
  view,
  onChange,
  kinds,
  tagNodes,
}: Pick<FiltersProps, 'view' | 'onChange' | 'kinds' | 'tagNodes'>) {
  const text = t.cardSearch;
  const nodes = useMemo(() => tagNodes(), [tagNodes]);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          label={text.kind}
          value={view.kind}
          options={[
            { value: '', label: text.allKinds },
            ...kinds.map((kind) => ({ value: kind, label: text.kinds[kind] ?? kind })),
          ]}
          onChange={(event) => {
            onChange({ kind: event.target.value });
          }}
        />
        <SelectField
          label={text.origin}
          value={view.origin}
          options={(['all', 'preloaded', 'own'] as const).map((value) => ({
            value,
            label: text.origins[value],
          }))}
          onChange={(event) => {
            onChange({ origin: event.target.value as SearchView['origin'] });
          }}
        />
        <SelectField
          label={text.sort}
          value={view.sort.key}
          options={SORT_KEYS.map((value) => ({ value, label: text.sorts[value] }))}
          onChange={(event) => {
            onChange({ sort: { ...view.sort, key: event.target.value as CardSortKey } });
          }}
        />
        <SelectField
          label={text.direction}
          value={view.sort.direction}
          options={(['asc', 'desc'] as const).map((value) => ({
            value,
            label: text.directions[value],
          }))}
          onChange={(event) => {
            onChange({ sort: { ...view.sort, direction: event.target.value as 'asc' | 'desc' } });
          }}
        />
      </div>
      <Disclosure
        title={text.tags}
        summary={text.tagsSummary(view.tag)}
        bodyClassName="max-h-72 overflow-y-auto"
      >
        {nodes.length === 0 ? (
          <p className="text-sm text-fg-muted">{text.noTags}</p>
        ) : (
          <TagTree
            nodes={nodes}
            selected={view.tag}
            onSelect={(tag) => {
              onChange({ tag });
            }}
          />
        )}
      </Disclosure>
    </div>
  );
}

/** Los chips de la computadora, con las opciones del que está abierto debajo */
export function DesktopFilters(props: FiltersProps) {
  const { view, onChange, onClear, deckChoices, topicChoices, facets } = props;
  const text = t.cardSearch;
  const labels = chipLabels(props);
  const baseId = useId();
  const [open, setOpen] = useState<Panel | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Partial<Record<Panel, HTMLButtonElement | null>>>({});

  // Al abrir unas opciones el foco entra a ellas, en la que ya está elegida, para elegir con el
  // teclado sin recorrer los chips
  useEffect(() => {
    const panel = panelRef.current;
    if (open === null || !panel) return;
    (
      panel.querySelector<HTMLElement>('button[aria-pressed="true"]') ??
      panel.querySelector<HTMLElement>('button, select, input')
    )?.focus();
  }, [open]);

  const close = (focusChip = true) => {
    const chip = open ? chipRefs.current[open] : null;
    setOpen(null);
    if (focusChip) chip?.focus();
  };
  const toggle = (panel: Panel) => {
    setOpen(open === panel ? null : panel);
  };
  const chip = (panel: Panel, label: string, active: boolean, total?: string) => (
    <FilterMenuChip
      ref={(node) => {
        chipRefs.current[panel] = node;
      }}
      active={active}
      expanded={open === panel}
      aria-controls={open === panel ? `${baseId}-${panel}` : undefined}
      count={total}
      onClick={() => {
        toggle(panel);
      }}
    >
      {label}
    </FilterMenuChip>
  );
  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    close();
  };
  const moreActive = view.kind !== '' || view.origin !== 'all' || view.tag !== null;

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label={text.filtersLabel}
        className="flex flex-wrap items-center gap-2"
      >
        {chip('deck', labels.deck, view.deckId !== '', labels.deckCount)}
        {chip('topic', labels.topic, view.topic !== null, labels.topicCount)}
        {chip('status', labels.status, view.states.size > 0, labels.statusCount)}
        <ToggleChips view={view} facets={facets} onChange={onChange} />
        {chip('more', text.more, moreActive)}
        {hasActiveFilters(view) ? (
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setOpen(null);
              onClear();
            }}
          >
            {text.clear}
          </Button>
        ) : null}
      </div>
      {open === null ? null : (
        <div
          ref={panelRef}
          id={`${baseId}-${open}`}
          role="group"
          aria-label={
            open === 'deck'
              ? text.deck
              : open === 'topic'
                ? text.topic
                : open === 'status'
                  ? text.status
                  : text.more
          }
          onKeyDown={onPanelKeyDown}
          className="rounded-lg border border-line bg-surface p-3"
        >
          {open === 'deck' ? (
            <DeckChoices
              view={view}
              choices={deckChoices}
              onPick={(deckId) => {
                onChange({ deckId });
                close();
              }}
            />
          ) : null}
          {open === 'topic' ? (
            <TopicChoices
              view={view}
              choices={topicChoices}
              onPick={(option) => {
                onChange({ topic: option ? { key: option.key, path: option.path } : null });
                close();
              }}
            />
          ) : null}
          {open === 'status' ? (
            <StatusChoices view={view} facets={facets} onChange={onChange} />
          ) : null}
          {open === 'more' ? <MoreChoices {...props} /> : null}
        </div>
      )}
    </div>
  );
}

/** El botón de filtros del teléfono y su hoja con todos los filtros */
export function PhoneFilters(props: FiltersProps) {
  const { view, onChange, onClear, deckChoices, topicChoices, facets, results } = props;
  const text = t.cardSearch;
  const [open, setOpen] = useState(false);
  const active = activeFilterCount(view);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <Button variant="secondary" size="sm">
            <SlidersHorizontal aria-hidden />
            {text.openFilters(active)}
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content
            aria-describedby={undefined}
            className="animate-rise fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col gap-4 overflow-y-auto rounded-t-xl border-t border-line bg-surface px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-raised"
          >
            <div className="flex items-center justify-between gap-3">
              <Dialog.Title className="text-lg font-semibold text-fg">
                {text.filtersLabel}
              </Dialog.Title>
              <Dialog.Close
                aria-label={text.closeFilters}
                className="flex size-touch shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-muted hover:text-fg"
              >
                <X aria-hidden className="size-5" />
              </Dialog.Close>
            </div>
            <SelectField
              label={text.deck}
              value={view.deckId}
              options={[
                { value: '', label: text.allDecks },
                ...deckChoices.map((option) => ({
                  value: option.id,
                  label: `${deckIndent(option.depth)}${option.name} (${count(option.count)})`,
                })),
              ]}
              onChange={(event) => {
                onChange({ deckId: event.target.value });
              }}
            />
            <SelectField
              label={text.topic}
              value={view.topic?.key ?? ''}
              options={[
                { value: '', label: text.allTopics },
                ...topicChoices.map((option) => ({
                  value: option.key,
                  label: `${deckIndent(option.depth)}${option.path.at(-1) ?? ''} (${count(option.count)})`,
                })),
              ]}
              onChange={(event) => {
                const option = topicChoices.find((entry) => entry.key === event.target.value);
                onChange({ topic: option ? { key: option.key, path: option.path } : null });
              }}
            />
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 font-medium">{text.status}</legend>
              <StatusChoices view={view} facets={facets} onChange={onChange} />
              <div className="flex flex-wrap gap-1.5">
                <ToggleChips view={view} facets={facets} onChange={onChange} />
              </div>
            </fieldset>
            <MoreChoices {...props} />
            <div className="flex flex-wrap items-center gap-2">
              <Dialog.Close asChild>
                <Button>{text.showResults(results)}</Button>
              </Dialog.Close>
              {hasActiveFilters(view) ? (
                <Button variant="secondary" onClick={onClear}>
                  {text.clear}
                </Button>
              ) : null}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {hasActiveFilters(view) ? (
        <Button variant="link" size="sm" onClick={onClear}>
          {text.clear}
        </Button>
      ) : null}
    </div>
  );
}
