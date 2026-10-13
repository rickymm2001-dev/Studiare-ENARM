// La tabla de Buscar tarjetas en la computadora (B4 del plan del cambio). Se ordena tocando el
// encabezado de cada columna. Cada fila se marca con su casilla y se abre en el panel de al lado
// con su frente, sin perder la lista. Con las flechas se pasa de una fila a otra, Enter la abre y X
// la marca. Solo la fila activa entra en el orden del tabulador, así salir de la tabla es un paso.
// Cada columna tiene un ancho en rem que le alcanza a su encabezado y a sus valores, y el frente se
// queda con lo que sobra. La tabla tiene un ancho mínimo y, si no cabe, se desplaza de lado dentro
// de su caja, así nada se encima. Con el panel abierto se esconden Intervalo y Fallos, que el panel
// ya dice, para dejarle lugar al frente.
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { CardSearchRow, CardSort, CardSortKey } from '@/engines/cardSearch';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { DueText, IntervalText, StatusBadges } from './cardLabels';
import { frontOf, shortFront } from './rowText';

/** Lo que comparten la tabla y la lista del teléfono */
export interface ResultsProps {
  /** Las filas pintadas, que son las primeras de las encontradas */
  rows: readonly CardSearchRow[];
  selected: ReadonlySet<string>;
  onToggle: (cardId: string) => void;
  openId: string | null;
  onOpen: (cardId: string) => void;
  /** La fila que recibe el foco con el tabulador */
  activeIndex: number;
  onActive: (index: number) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  /** ID del panel que abre cada fila */
  panelId: string;
  nowMs: number;
  timeZone: string;
}

/**
 * Las columnas después de la casilla. El frente no lleva ancho y se queda con lo que sobra. detail
 * son las que se esconden con el panel abierto
 */
const COLUMNS: readonly { key: CardSortKey; width?: string; detail?: boolean }[] = [
  { key: 'front' },
  { key: 'deck', width: 'w-[8.5rem]' },
  { key: 'topic', width: 'w-[8.5rem]' },
  { key: 'status', width: 'w-[8rem]' },
  { key: 'due', width: 'w-[7.5rem]' },
  { key: 'interval', width: 'w-[6rem]', detail: true },
  { key: 'lapses', width: 'w-[5rem]', detail: true },
];

/**
 * Ancho mínimo de la tabla. Es la suma de las columnas con ancho, 46 rem con todas y 35 rem sin
 * Intervalo ni Fallos, más 11 rem para el frente
 */
const MIN_WIDTH = { full: 'min-w-[57rem]', compact: 'min-w-[46rem]' } as const;

type ColumnKey = keyof typeof t.cardSearch.columns;

function SortIcon({ active, direction }: { active: boolean; direction: CardSort['direction'] }) {
  if (!active) return <ArrowUpDown aria-hidden className="size-3.5 shrink-0 opacity-60" />;
  return direction === 'asc' ? (
    <ArrowUp aria-hidden className="size-3.5 shrink-0" />
  ) : (
    <ArrowDown aria-hidden className="size-3.5 shrink-0" />
  );
}

export function ResultsTable({
  rows,
  selected,
  onToggle,
  openId,
  onOpen,
  activeIndex,
  onActive,
  onKeyDown,
  panelId,
  nowMs,
  timeZone,
  total,
  sort,
  onSort,
  allSelected,
  someSelected,
  onToggleAll,
  compact,
}: ResultsProps & {
  /** Todas las tarjetas que cumplen la búsqueda, también las que no se han pintado */
  total: number;
  sort: CardSort;
  onSort: (key: CardSortKey) => void;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: (on: boolean) => void;
  /** El panel está abierto al lado, así que van solo las columnas principales */
  compact: boolean;
}) {
  const allRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);
  const columns = compact ? COLUMNS.filter((column) => !column.detail) : COLUMNS;
  return (
    <div className="overflow-x-auto">
      <table
        className={cn(
          'w-full table-fixed border-collapse text-left text-sm',
          compact ? MIN_WIDTH.compact : MIN_WIDTH.full,
        )}
      >
        <caption className="sr-only">{t.cardSearch.resultsLabel}</caption>
        <thead>
          <tr className="border-b border-line-strong text-xs text-fg-muted">
            <th scope="col" className="w-10 py-2 pr-2 align-middle">
              <input
                ref={allRef}
                type="checkbox"
                className="size-4 accent-[var(--color-primary)]"
                aria-label={t.cardSearch.selectAll(total)}
                checked={allSelected}
                onChange={(event) => {
                  onToggleAll(event.target.checked);
                }}
              />
            </th>
            {columns.map((column) => {
              const active = sort.key === column.key;
              const label = t.cardSearch.columns[column.key as ColumnKey];
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                  }
                  className={cn('py-2 pr-3 align-middle font-semibold', column.width)}
                >
                  <button
                    type="button"
                    aria-label={t.cardSearch.sortBy(label)}
                    onClick={() => {
                      onSort(column.key);
                    }}
                    className={cn(
                      'inline-flex min-h-8 items-center gap-1 rounded-sm text-left hover:text-fg',
                      active && 'text-fg',
                    )}
                  >
                    {label}
                    <SortIcon active={active} direction={sort.direction} />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody onKeyDown={onKeyDown}>
          {rows.map((row, index) => {
            const isOpen = openId === row.cardId;
            const isActive = index === activeIndex;
            return (
              <tr
                key={row.cardId}
                data-row-index={index}
                className={cn(
                  'border-b border-line align-top',
                  selected.has(row.cardId) && 'bg-muted/60',
                  isOpen && 'bg-primary-soft',
                )}
              >
                <td className="py-2.5 pr-2">
                  <input
                    type="checkbox"
                    tabIndex={isActive ? 0 : -1}
                    className="mt-0.5 size-4 accent-[var(--color-primary)]"
                    aria-label={t.cardSearch.selectRow(shortFront(row))}
                    checked={selected.has(row.cardId)}
                    onFocus={() => {
                      onActive(index);
                    }}
                    onChange={() => {
                      onToggle(row.cardId);
                    }}
                  />
                </td>
                <td className="py-2 pr-3">
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
                    className="block w-full rounded-sm text-left font-medium text-fg hover:underline"
                  >
                    <span className="line-clamp-2 break-words">{frontOf(row)}</span>
                  </button>
                </td>
                <td className="py-2 pr-3 text-fg-muted">
                  <span className="line-clamp-2 break-words">{row.deckLabel}</span>
                </td>
                <td className="py-2 pr-3">
                  {row.topic === '' ? (
                    <span className="text-fg-muted">{t.cardSearch.noTopic}</span>
                  ) : (
                    <span className="line-clamp-2 break-words">{row.topic}</span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <span className="flex flex-wrap gap-1">
                    <StatusBadges row={row} />
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <DueText row={row} nowMs={nowMs} timeZone={timeZone} />
                </td>
                {compact ? null : (
                  <>
                    <td className="py-2 pr-3">
                      <IntervalText row={row} />
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {row.lapses.toLocaleString('es-MX')}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
