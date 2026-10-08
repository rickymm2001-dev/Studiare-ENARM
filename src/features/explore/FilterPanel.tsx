// Filtros de Explorar. Búsqueda de texto, mazo en árbol, ruta de etiqueta, estado con conteos, tipo
// y origen, más el orden. Cada opción muestra cuántas tarjetas daría con los demás filtros puestos.
import { Search } from 'lucide-react';
import { deckIndent, flattenDeckTree } from '@/engines/deckTree';
import type { ExploreStatus } from '@/engines/explore';
import type { TagNode } from '@/engines/tagPath';
import type { Deck } from '@/data/schemas/decks';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Disclosure } from '@/ui/components/disclosure';
import { SelectField, TextField } from '@/ui/components/field';
import { cn } from '@/ui/cn';
import { TagTree } from './TagTree';
import { hasActiveFilters, INITIAL_VIEW, type ExploreView } from './view';

const STATUS_ORDER: readonly ExploreStatus[] = [
  'due',
  'new',
  'learning',
  'review',
  'relearning',
  'suspended',
  'leech',
];

export function FilterPanel({
  view,
  onChange,
  decks,
  deckCounts,
  tagNodes,
  statusCounts,
  kinds,
}: {
  view: ExploreView;
  onChange: (patch: Partial<ExploreView>) => void;
  decks: readonly Deck[];
  /** Tarjetas por mazo, con las de los mazos de abajo, según los demás filtros */
  deckCounts: ReadonlyMap<string, number>;
  tagNodes: readonly TagNode[];
  statusCounts: Readonly<Record<ExploreStatus, number>>;
  /** Tipos de nota que existen en las tarjetas */
  kinds: readonly string[];
}) {
  const deckOptions = [
    { value: '', label: t.explore.allDecks },
    ...flattenDeckTree(decks).map(({ deck, depth }) => ({
      value: deck.id,
      label: t.explore.deckOption(deckIndent(depth), deck.name, deckCounts.get(deck.id) ?? 0),
    })),
  ];
  const toggleStatus = (status: ExploreStatus) => {
    const next = new Set(view.status);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    onChange({ status: next });
  };
  return (
    <div role="search" aria-label={t.explore.filtersTitle} className="flex flex-col gap-3">
      <div className="relative">
        <TextField
          label={t.explore.search}
          hint={t.explore.searchHint}
          type="search"
          value={view.text}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            onChange({ text: event.target.value });
          }}
        />
        <Search
          aria-hidden
          className="pointer-events-none absolute top-9 right-3 size-5 text-fg-muted"
        />
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 font-medium">{t.explore.status}</legend>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_ORDER.map((status) => {
            const on = view.status.has(status);
            return (
              <button
                key={status}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  toggleStatus(status);
                }}
                className={cn(
                  'min-h-9 rounded-full border px-3 text-sm font-semibold transition-colors',
                  on
                    ? 'border-transparent bg-primary text-primary-fg'
                    : 'border-line bg-surface text-fg hover:bg-muted',
                )}
              >
                {t.explore.statuses[status]}
                <span className={cn('ml-1.5 font-normal', on ? 'opacity-90' : 'text-fg-muted')}>
                  {statusCounts[status].toLocaleString('es-MX')}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          label={t.explore.deck}
          value={view.deckId}
          options={deckOptions}
          onChange={(event) => {
            onChange({ deckId: event.target.value });
          }}
        />
        <SelectField
          label={t.explore.kind}
          value={view.kind}
          options={[
            { value: '', label: t.explore.allKinds },
            ...kinds.map((kind) => ({ value: kind, label: t.explore.kinds[kind] ?? kind })),
          ]}
          onChange={(event) => {
            onChange({ kind: event.target.value });
          }}
        />
        <SelectField
          label={t.explore.origin}
          value={view.origin}
          options={(['all', 'preloaded', 'own'] as const).map((value) => ({
            value,
            label: t.explore.origins[value],
          }))}
          onChange={(event) => {
            onChange({ origin: event.target.value as ExploreView['origin'] });
          }}
        />
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label={t.explore.sort}
            value={view.sort.key}
            options={(['created', 'updated', 'front', 'due', 'lapses'] as const).map((value) => ({
              value,
              label: t.explore.sorts[value],
            }))}
            onChange={(event) => {
              onChange({ sort: { ...view.sort, key: event.target.value as typeof view.sort.key } });
            }}
          />
          <SelectField
            label={t.explore.direction}
            value={view.sort.direction}
            options={(['asc', 'desc'] as const).map((value) => ({
              value,
              label: t.explore.directions[value],
            }))}
            onChange={(event) => {
              onChange({
                sort: { ...view.sort, direction: event.target.value as 'asc' | 'desc' },
              });
            }}
          />
        </div>
      </div>
      <Disclosure
        title={t.explore.tagsTitle}
        summary={t.explore.tagsSummary(view.tag)}
        bodyClassName="max-h-72 overflow-y-auto"
      >
        {tagNodes.length === 0 ? (
          <p className="text-sm text-fg-muted">{t.explore.noTags}</p>
        ) : (
          <TagTree
            nodes={tagNodes}
            selected={view.tag}
            onSelect={(tag) => {
              onChange({ tag });
            }}
          />
        )}
      </Disclosure>
      {hasActiveFilters(view) ? (
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              onChange({ ...INITIAL_VIEW, sort: view.sort });
            }}
          >
            {t.explore.clear}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
