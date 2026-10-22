// Hoja de respuestas del examen (V4-B5). Al estilo de las hojas de lectura óptica que usa el examen real,
// una fila por pregunta y una burbuja por opción. Con ella el alumno marca su respuesta aquí y no tocando
// la opción de la pregunta, para entrenar el llenado y el error de renglón. Una burbuja solo se puede
// llenar si la pregunta ya se vio, porque el orden de sus opciones se fija al verla por primera vez.
//
// Teclado (V4-B10). Con 280 preguntas la hoja tiene más de mil burbujas, así que toda la hoja es una sola
// parada de Tab y las flechas hacen el resto, como en una cuadrícula. Izquierda y derecha mueven entre las
// burbujas de la fila, arriba y abajo entre las filas que ya se pueden llenar, e Inicio y Fin van a la
// primera y a la última de la fila. Las flechas solo mueven el foco y no llenan, a diferencia de un grupo
// de radios común, porque cada cambio de burbuja queda registrado como cambio de respuesta. Llenar es con
// Espacio o Enter. La parada de Tab es la burbuja llena de la pregunta que se está viendo o su primera.
import { Flag } from 'lucide-react';
import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { KeyHint } from '@/ui/components/key-hint';
import { optionLetter } from './optionLetter';

export interface SheetRow {
  /** Número de la pregunta en el examen, desde 1 */
  number: number;
  /** Opciones en el orden en que se le mostraron. null si todavía no ve la pregunta */
  optionIds: readonly string[] | null;
  /** La opción que tiene llenada */
  chosenId: string | null;
  marked: boolean;
}

/** Una burbuja de la hoja, por la posición de su fila y de su opción, desde 0 */
interface Bubble {
  row: number;
  col: number;
}

/** Cuántas burbujas muestra una fila que todavía no se ve, todas cerradas */
const UNSEEN_BUBBLES = 4;

const bubbleCount = (row: SheetRow | undefined): number =>
  row ? (row.optionIds?.length ?? UNSEEN_BUBBLES) : 0;

export function AnswerSheet({
  rows,
  current,
  disabled,
  onChoose,
  onGo,
}: {
  rows: readonly SheetRow[];
  /** Posición de la pregunta que está viendo, desde 0 */
  current: number;
  disabled: boolean;
  onChoose: (index: number, optionId: string) => void;
  onGo: (index: number) => void;
}) {
  const text = t.answerSheet;
  const listRef = useRef<HTMLOListElement>(null);
  // La última burbuja con el foco, válida mientras el alumno siga en la misma pregunta
  const [cursor, setCursor] = useState<(Bubble & { current: number }) | null>(null);

  const canFill = (row: number, col: number): boolean => {
    const options = rows[row]?.optionIds ?? null;
    return !disabled && options !== null && col >= 0 && col < options.length;
  };

  /** La burbuja de una fila donde cae el foco al entrar. La llena o la primera */
  const entryOf = (row: number): Bubble | null => {
    const sheetRow = rows[row];
    if (!sheetRow?.optionIds || !canFill(row, 0)) return null;
    const chosen = sheetRow.chosenId === null ? -1 : sheetRow.optionIds.indexOf(sheetRow.chosenId);
    return { row, col: Math.max(chosen, 0) };
  };

  /** La única burbuja que entra en el orden de Tab. Null si ninguna se puede llenar */
  const tabStop = (): Bubble | null => {
    if (cursor?.current === current && canFill(cursor.row, cursor.col)) return cursor;
    const inCurrent = entryOf(current);
    if (inCurrent) return inCurrent;
    for (let row = 0; row < rows.length; row += 1) {
      const entry = entryOf(row);
      if (entry) return entry;
    }
    return null;
  };
  const stop = tabStop();

  /** La fila más cercana en esa dirección que ya se puede llenar, con la misma opción o la última */
  const rowFrom = (from: Bubble, step: 1 | -1): Bubble | null => {
    for (let row = from.row + step; row >= 0 && row < rows.length; row += step) {
      if (canFill(row, 0)) return { row, col: Math.min(from.col, bubbleCount(rows[row]) - 1) };
    }
    return null;
  };

  const move = (from: Bubble, key: string): Bubble | null => {
    switch (key) {
      case 'ArrowRight':
        return canFill(from.row, from.col + 1) ? { row: from.row, col: from.col + 1 } : from;
      case 'ArrowLeft':
        return canFill(from.row, from.col - 1) ? { row: from.row, col: from.col - 1 } : from;
      case 'ArrowDown':
        return rowFrom(from, 1) ?? from;
      case 'ArrowUp':
        return rowFrom(from, -1) ?? from;
      case 'Home':
        return { row: from.row, col: 0 };
      case 'End':
        return { row: from.row, col: bubbleCount(rows[from.row]) - 1 };
      default:
        return null;
    }
  };

  const bubbleOf = (target: EventTarget): Bubble | null => {
    if (!(target instanceof HTMLElement)) return null;
    const [row, col] = (target.closest<HTMLElement>('[data-bubble]')?.dataset.bubble ?? '')
      .split('-')
      .map(Number);
    return row === undefined || col === undefined || Number.isNaN(row) || Number.isNaN(col)
      ? null
      : { row, col };
  };

  const onKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const from = bubbleOf(event.target);
    if (!from) return;
    const to = move(from, event.key);
    if (!to) return;
    // Las flechas son de la hoja y no pasan al examen, que con ellas cambia de pregunta
    event.preventDefault();
    listRef.current?.querySelector<HTMLElement>(`[data-bubble="${to.row}-${to.col}"]`)?.focus();
  };

  const onFocus = (event: FocusEvent<HTMLOListElement>) => {
    const bubble = bubbleOf(event.target);
    if (bubble) setCursor({ ...bubble, current });
  };

  return (
    <section aria-labelledby="hoja-titulo" className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <h2 id="hoja-titulo" className="text-base font-semibold">
          {text.title}
        </h2>
        <p className="text-sm text-fg-muted">{text.hint}</p>
        <KeyHint>{text.keyboardHint}</KeyHint>
      </div>
      <ol
        ref={listRef}
        // Sin una burbuja que se pueda llenar la lista no tiene nada enfocable y su desplazamiento
        // quedaría fuera del teclado
        tabIndex={stop ? undefined : 0}
        aria-label={text.listLabel}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        className="grid max-h-[60dvh] grid-cols-1 content-start gap-x-3 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2 xl:grid-cols-1"
      >
        {rows.map((row, index) => (
          <li
            key={row.number}
            className={cn(
              'flex items-center gap-2 rounded-md px-1 py-0.5',
              index === current && 'bg-muted',
            )}
          >
            {/* Con el teclado se llega a una pregunta con las flechas del examen o con su cuadrícula,
                así que el número no suma una parada más a la hoja */}
            <button
              type="button"
              tabIndex={-1}
              aria-label={text.goTo(row.number)}
              aria-current={index === current ? 'true' : undefined}
              onClick={() => {
                onGo(index);
              }}
              className="h-11 w-11 shrink-0 rounded-sm text-right text-sm font-semibold tabular-nums hover:underline sm:h-7 sm:w-9"
            >
              {row.number}
            </button>
            <div
              role="radiogroup"
              aria-label={text.rowLabel(row.number)}
              className="flex min-w-0 flex-wrap gap-1.5"
            >
              {(row.optionIds ?? Array.from({ length: UNSEEN_BUBBLES }, () => null)).map(
                (optionId, optionIndex) => {
                  const letter = optionLetter(optionIndex);
                  const filled = optionId !== null && row.chosenId === optionId;
                  return (
                    <button
                      key={optionIndex}
                      type="button"
                      role="radio"
                      data-bubble={`${index}-${optionIndex}`}
                      tabIndex={stop?.row === index && stop.col === optionIndex ? 0 : -1}
                      aria-checked={filled}
                      aria-label={text.bubble(row.number, letter)}
                      disabled={disabled || optionId === null}
                      onClick={() => {
                        if (optionId !== null) onChoose(index, optionId);
                      }}
                      className={cn(
                        'flex size-11 items-center justify-center rounded-full border text-sm leading-none font-semibold sm:size-7 sm:text-xs',
                        filled
                          ? 'border-fg bg-fg text-surface'
                          : 'border-line-strong bg-surface text-fg-muted enabled:hover:border-fg',
                        optionId === null && 'opacity-50',
                      )}
                    >
                      {letter}
                    </button>
                  );
                },
              )}
            </div>
            {row.marked ? (
              <span title={text.marked} className="flex shrink-0 items-center text-accent-ink">
                <Flag aria-hidden className="size-4 fill-current" />
                <span className="sr-only">{text.marked}</span>
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
