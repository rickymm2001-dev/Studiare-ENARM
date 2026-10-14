// Tabla de tarjetas ordenada por columna para computadora (B4, comentario 11).
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ExploreRow, ExploreSort, ExploreSortKey } from '@/engines/explore';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { cn } from '@/ui/cn';

function formatDate(due: string | null, timeZone: string): string {
  if (!due) return '—';
  try {
    return new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone,
    }).format(new Date(due));
  } catch {
    return due.slice(0, 10);
  }
}

export function ExploreTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
  allSelected,
  activeCardId,
  onSelectCard,
  sort,
  onSortChange,
  timeZone,
}: {
  rows: readonly ExploreRow[];
  selected: ReadonlySet<string>;
  onToggle: (cardId: string) => void;
  onToggleAll: (on: boolean) => void;
  allSelected: boolean;
  activeCardId: string | null;
  onSelectCard: (cardId: string) => void;
  sort: ExploreSort;
  onSortChange: (sort: ExploreSort) => void;
  timeZone: string;
}) {
  const handleSort = (key: ExploreSortKey) => {
    if (sort.key === key) {
      onSortChange({
        key,
        direction: sort.direction === 'asc' ? 'desc' : 'asc',
      });
    } else {
      // Por defecto descendente en fechas u olvidos, ascendente en texto
      const defaultDesc = key === 'due' || key === 'lapses' || key === 'created' || key === 'updated';
      onSortChange({
        key,
        direction: defaultDesc ? 'desc' : 'asc',
      });
    }
  };

  const sortIcon = (key: ExploreSortKey) => {
    if (sort.key !== key) {
      return <ArrowUpDown className="size-3.5 opacity-40 group-hover:opacity-100" aria-hidden />;
    }
    return sort.direction === 'asc' ? (
      <ArrowUp className="size-3.5 text-primary-strong" aria-hidden />
    ) : (
      <ArrowDown className="size-3.5 text-primary-strong" aria-hidden />
    );
  };

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="border-b border-line bg-muted/40 text-xs font-semibold uppercase text-fg-muted">
          <tr>
            <th scope="col" className="w-10 px-3 py-3">
              <input
                type="checkbox"
                aria-label={t.explore.selectPage}
                checked={allSelected}
                onChange={(e) => { onToggleAll(e.target.checked); }}
                className="size-4 rounded accent-[var(--color-primary)]"
              />
            </th>
            <th
              scope="col"
              onClick={() => { handleSort('front'); }}
              className="group cursor-pointer px-3 py-3 select-none hover:text-fg"
            >
              <div className="flex items-center gap-1.5">
                <span>{t.explore.table.front}</span>
                {sortIcon('front')}
              </div>
            </th>
            <th
              scope="col"
              onClick={() => { handleSort('deck'); }}
              className="group cursor-pointer px-3 py-3 select-none hover:text-fg"
            >
              <div className="flex items-center gap-1.5">
                <span>{t.explore.table.deck}</span>
                {sortIcon('deck')}
              </div>
            </th>
            <th
              scope="col"
              onClick={() => { handleSort('topic'); }}
              className="group cursor-pointer px-3 py-3 select-none hover:text-fg"
            >
              <div className="flex items-center gap-1.5">
                <span>{t.explore.table.topic}</span>
                {sortIcon('topic')}
              </div>
            </th>
            <th
              scope="col"
              onClick={() => { handleSort('status'); }}
              className="group cursor-pointer px-3 py-3 select-none hover:text-fg"
            >
              <div className="flex items-center gap-1.5">
                <span>{t.explore.table.status}</span>
                {sortIcon('status')}
              </div>
            </th>
            <th
              scope="col"
              onClick={() => { handleSort('due'); }}
              className="group cursor-pointer px-3 py-3 select-none hover:text-fg"
            >
              <div className="flex items-center gap-1.5">
                <span>{t.explore.table.due}</span>
                {sortIcon('due')}
              </div>
            </th>
            <th
              scope="col"
              onClick={() => { handleSort('interval'); }}
              className="group cursor-pointer px-3 py-3 select-none hover:text-fg"
            >
              <div className="flex items-center gap-1.5">
                <span>{t.explore.table.interval}</span>
                {sortIcon('interval')}
              </div>
            </th>
            <th
              scope="col"
              onClick={() => { handleSort('lapses'); }}
              className="group cursor-pointer px-3 py-3 select-none hover:text-fg"
            >
              <div className="flex items-center gap-1.5">
                <span>{t.explore.table.lapses}</span>
                {sortIcon('lapses')}
              </div>
            </th>
          </tr>
        </thead>
        <tbody role="list" aria-label={t.explore.list} className="divide-y divide-line">
          {rows.map((row) => {
            const isSelected = selected.has(row.cardId);
            const isActive = activeCardId === row.cardId;
            const front = row.front || t.explore.emptyFront;

            return (
              <tr
                role="listitem"
                key={row.cardId}
                aria-selected={isActive}
                onClick={() => { onSelectCard(row.cardId); }}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-muted/30',
                  isActive && 'bg-primary-tint/20 font-medium',
                )}
              >
                <td
                  className="px-3 py-2.5"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <input
                    type="checkbox"
                    aria-label={t.explore.selectRow(front.slice(0, 60))}
                    checked={isSelected}
                    onChange={() => { onToggle(row.cardId); }}
                    className="size-4 rounded accent-[var(--color-primary)]"
                  />
                </td>
                <td className="max-w-xs px-3 py-2.5">
                  <span className="line-clamp-2 break-words" title={front}>
                    {front}
                  </span>
                </td>
                <td className="max-w-[140px] px-3 py-2.5 text-xs text-fg-muted">
                  <span className="block truncate" title={row.deckName}>
                    {row.deckName || '—'}
                  </span>
                </td>
                <td className="max-w-[140px] px-3 py-2.5 text-xs text-fg-muted">
                  <span className="block truncate" title={row.topic}>
                    {row.topic || '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs">
                  {row.suspended ? (
                    <Badge variant="warning">{t.explore.statusOne.suspended}</Badge>
                  ) : row.leech ? (
                    <Badge variant="danger">{t.explore.statusOne.leech}</Badge>
                  ) : row.fsrs === 'new' ? (
                    <Badge variant="info">{t.explore.newCard}</Badge>
                  ) : (
                    <Badge variant="neutral">{t.explore.statuses[row.fsrs]}</Badge>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs tabular-nums text-fg-muted whitespace-nowrap">
                  {formatDate(row.due, timeZone)}
                </td>
                <td className="px-3 py-2.5 text-xs tabular-nums text-fg-muted whitespace-nowrap">
                  {row.interval > 0 ? `${row.interval} d` : '—'}
                </td>
                <td className="px-3 py-2.5 text-xs tabular-nums text-fg-muted whitespace-nowrap">
                  {row.lapses}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
