// Filtros de Explorar. Búsqueda de texto, mazo en árbol, ruta de etiqueta, estado con conteos, tipo
// y origen, más el orden. Cada opción muestra cuántas tarjetas daría con los demás filtros puestos.
import { useState } from 'react';
import { Search } from 'lucide-react';
import { deckIndent, flattenDeckTree } from '@/engines/deckTree';
import type { ExploreStatus } from '@/engines/explore';
import type { TagNode } from '@/engines/tagPath';
import type { Deck } from '@/data/schemas/decks';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Disclosure } from '@/ui/components/disclosure';
import { SelectField, TextField } from '@/ui/components/field';
import { FilterChip } from '@/ui/components/filter-chip';
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
  markedCount = 0,
  onlyMarked = false,
  onToggleMarked,
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
  markedCount?: number;
  onlyMarked?: boolean;
  onToggleMarked?: (on: boolean) => void;
}) {
  const [showMore, setShowMore] = useState(false);

  const deckOptions = [
    { value: '', label: t.explore.allDecks },
    ...flattenDeckTree(decks).map(({ deck, depth }) => ({
      value: deck.id,
      label: t.explore.deckOption(deckIndent(depth), deck.name, deckCounts.get(deck.id) ?? 0),
    })),
  ];
  const setStatus = (status: ExploreStatus, on: boolean) => {
    const next = new Set(view.status);
    if (on) next.add(status);
    else next.delete(status);
    onChange({ status: next });
  };

  const selectedDeckName = decks.find((d) => d.id === view.deckId)?.name;

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

      {/* Fila de chips con sus conteos (B4 del plan del cambio) */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
          {t.explore.filtersTitle}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Mazo chip */}
          {view.deckId ? (
            <FilterChip pressed={true} onPressedChange={() => { onChange({ deckId: '' }); }}>
              {t.explore.filterChips.deck}: {selectedDeckName ?? view.deckId}
            </FilterChip>
          ) : null}

          {/* Tema chip */}
          {view.tag ? (
            <FilterChip pressed={true} onPressedChange={() => { onChange({ tag: null }); }}>
              {t.explore.filterChips.topic}: {view.tag}
            </FilterChip>
          ) : null}

          {/* Chips de estado individuales con sus conteos */}
          {STATUS_ORDER.map((status) => (
            <FilterChip
              key={status}
              pressed={view.status.has(status)}
              onPressedChange={(on) => {
                setStatus(status, on);
              }}
              count={statusCounts[status].toLocaleString('es-MX')}
            >
              {t.explore.statuses[status]}
            </FilterChip>
          ))}

          {/* Marcadas chip */}
          {onToggleMarked && markedCount > 0 ? (
            <FilterChip
              pressed={onlyMarked}
              onPressedChange={onToggleMarked}
              count={markedCount.toLocaleString('es-MX')}
            >
              {t.explore.filterChips.marked}
            </FilterChip>
          ) : null}

          {/* Botón Más filtros */}
          <Button
            variant={showMore ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => { setShowMore((v) => !v); }}
            className="text-xs font-semibold"
          >
            {t.explore.moreFilters}
          </Button>

          {hasActiveFilters(view) || onlyMarked ? (
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                onChange({ ...INITIAL_VIEW, sort: view.sort });
                if (onToggleMarked && onlyMarked) onToggleMarked(false);
              }}
            >
              {t.explore.clear}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Sección desplegable Más filtros para lo raro */}
      <div className={showMore ? 'flex flex-col gap-3 pt-2 border-t border-line' : 'hidden'}>
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
              options={([
                'created',
                'updated',
                'front',
                'deck',
                'topic',
                'status',
                'due',
                'interval',
                'lapses',
              ] as const).map((value) => ({
                value,
                label: t.explore.sorts[value],
              }))}
              onChange={(event) => {
                onChange({
                  sort: { ...view.sort, key: event.target.value as typeof view.sort.key },
                });
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
      </div>
    </div>
  );
}
