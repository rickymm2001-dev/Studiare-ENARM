// La lista de Buscar tarjetas en el teléfono (B4 del plan del cambio). Cada tarjeta con su casilla,
// su frente, su mazo y tema y sus estados. Tocarla la abre en una hoja con todo lo demás.
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { StatusBadges } from './cardLabels';
import type { ResultsProps } from './ResultsTable';
import { formatDate, frontOf, shortFront } from './rowText';

export function ResultsList({
  rows,
  selected,
  onToggle,
  openId,
  onOpen,
  activeIndex,
  onActive,
  onKeyDown,
  panelId,
  timeZone,
}: ResultsProps) {
  return (
    <ul
      aria-label={t.cardSearch.resultsLabel}
      onKeyDown={onKeyDown}
      className="flex flex-col divide-y divide-line"
    >
      {rows.map((row, index) => {
        const isActive = index === activeIndex;
        const isOpen = openId === row.cardId;
        return (
          <li key={row.cardId} data-row-index={index} className="flex items-start gap-3 py-3">
            <input
              type="checkbox"
              tabIndex={isActive ? 0 : -1}
              className="mt-1 size-5 shrink-0 accent-[var(--color-primary)]"
              aria-label={t.cardSearch.selectRow(shortFront(row))}
              checked={selected.has(row.cardId)}
              onFocus={() => {
                onActive(index);
              }}
              onChange={() => {
                onToggle(row.cardId);
              }}
            />
            <button
              type="button"
              data-row-open={row.cardId}
              tabIndex={isActive ? 0 : -1}
              aria-expanded={isOpen}
              aria-controls={isOpen ? panelId : undefined}
              onFocus={() => {
                onActive(index);
              }}
              onClick={() => {
                onOpen(row.cardId);
              }}
              className="flex min-w-0 flex-1 flex-col items-start gap-1 rounded-sm text-left"
            >
              <span className="line-clamp-2 font-medium break-words text-fg">{frontOf(row)}</span>
              <span className="text-xs break-words text-fg-muted">
                {row.topic === '' ? row.deckLabel : `${row.deckLabel} · ${row.topic}`}
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                <StatusBadges row={row} />
                {row.due === null ? null : (
                  <Badge variant="neutral">{formatDate(row.due, timeZone)}</Badge>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
