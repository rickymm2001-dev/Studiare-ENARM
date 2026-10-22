// Hoja de respuestas del examen (V4-B5). Al estilo de las hojas de lectura óptica que usa el examen real,
// una fila por pregunta y un alveolo por opción. Con ella el alumno marca su respuesta aquí y no tocando
// la opción de la pregunta, para entrenar el llenado y el error de renglón. Un alveolo solo se puede
// llenar si la pregunta ya se vio, porque el orden de sus opciones se fija al verla por primera vez.
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';

/** La letra de una opción por su posición, A para la primera */
export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

export interface SheetRow {
  /** Número de la pregunta en el examen, desde 1 */
  number: number;
  /** Opciones en el orden en que se le mostraron. null si todavía no ve la pregunta */
  optionIds: readonly string[] | null;
  /** La opción que tiene llenada */
  chosenId: string | null;
  marked: boolean;
}

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
  return (
    <section aria-labelledby="hoja-titulo" className="flex flex-col gap-2">
      <div>
        <h2 id="hoja-titulo" className="text-base font-semibold">
          {text.title}
        </h2>
        <p className="text-sm text-fg-muted">{text.hint}</p>
      </div>
      <ol
        tabIndex={0}
        aria-label={text.listLabel}
        className="max-h-[60dvh] overflow-y-auto rounded-lg border border-line p-2 sm:columns-2 xl:columns-1 2xl:columns-2"
      >
        {rows.map((row, index) => (
          <li
            key={row.number}
            className={cn(
              'flex break-inside-avoid items-center gap-2 rounded-md px-1 py-0.5',
              index === current && 'bg-muted',
            )}
          >
            <button
              type="button"
              aria-label={text.goTo(row.number)}
              aria-current={index === current ? 'true' : undefined}
              onClick={() => {
                onGo(index);
              }}
              className="w-9 shrink-0 rounded-sm text-right text-sm font-semibold tabular-nums hover:underline"
            >
              {row.number}
            </button>
            <div role="radiogroup" aria-label={text.rowLabel(row.number)} className="flex gap-1.5">
              {(row.optionIds ?? [null, null, null, null]).map((optionId, optionIndex) => {
                const letter = optionLetter(optionIndex);
                const filled = optionId !== null && row.chosenId === optionId;
                return (
                  <button
                    key={optionIndex}
                    type="button"
                    role="radio"
                    aria-checked={filled}
                    aria-label={text.bubble(row.number, letter)}
                    disabled={disabled || optionId === null}
                    onClick={() => {
                      if (optionId !== null) onChoose(index, optionId);
                    }}
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full border text-[0.7rem] leading-none font-semibold',
                      filled
                        ? 'border-fg bg-fg text-surface'
                        : 'border-line-strong bg-surface text-fg-muted enabled:hover:border-fg',
                      optionId === null && 'opacity-50',
                    )}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
            {row.marked ? (
              <span className="text-xs font-semibold text-accent-ink">{text.marked}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
