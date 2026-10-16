// El texto de un caso de lectura en inglés con su fuente (B13, 2.3 y 2.5 del plan de B13). Lo comparten la
// pregunta de la práctica, la del examen, la retroalimentación y la revisión de resultados, así el texto y
// su fuente se ven y se leen igual en todas. El texto va dentro de un elemento con lang="en", así el
// lector de pantalla lo pronuncia en inglés, y la interfaz sigue en español. Bajo el texto, en letra
// chica, va la línea de la fuente con su licencia y su enlace, que abre en otra pestaña.
// Plegado. En el teléfono el texto va arriba y se pliega desde la segunda pregunta del caso, con Ver el
// texto para abrirlo otra vez. En computadora el texto queda fijo a la izquierda y no se pliega. En la
// retroalimentación va plegado siempre, para no ocupar la pantalla. La fuente se ve aunque el texto esté
// plegado, porque es la atribución de la licencia.
import { AlarmClock } from 'lucide-react';
import { useId, useState, type Ref } from 'react';
import { LICENSE_LABELS, parsePassageSource } from '@/data/content/passageSource';
import { englishText } from '@/i18n/english';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { DESKTOP_QUERY, useMediaQuery } from '@/ui/hooks/use-media-query';

/** Cuándo se pliega el texto. never, nunca. phone, solo en el teléfono. always, en cualquier pantalla */
export type PassageFold = 'never' | 'phone' | 'always';

/**
 * La línea de la fuente del texto. Sale de la primera referencia de la pregunta, con la forma fija de
 * passageSource.ts. Sin una fuente válida no pone nada, porque una pregunta en inglés sin fuente no se
 * aprueba. Solo abre enlaces https
 */
export function PassageSourceLine({
  refs,
  className,
}: {
  refs: readonly { title: string }[];
  className?: string;
}) {
  const parsed = parsePassageSource(refs);
  if (!parsed.ok) return null;
  const { title, license, url } = parsed.source;
  const text = englishText.reading;
  return (
    <p className={cn('text-xs text-fg-muted', className)}>
      {text.sourceLabel}. {title === '' ? null : `${title}. `}
      {LICENSE_LABELS[license]}.
      {url === null ? null : (
        <>
          {' '}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all underline underline-offset-4"
          >
            {url}
            <span className="sr-only"> ({text.newTab})</span>
          </a>
        </>
      )}
    </p>
  );
}

export function ReadingPassage({
  text,
  refs,
  fold,
  scrollable = false,
  regionRef,
  describedBy,
  className,
}: {
  /** El texto en inglés, que es la viñeta del caso */
  text: string;
  /** Las referencias de la pregunta. La primera es la fuente del texto */
  refs: readonly { title: string }[];
  fold: PassageFold;
  /**
   * En computadora el texto largo se desplaza dentro de su recuadro, para que la pregunta y las opciones
   * sigan a la vista. Entonces se puede enfocar con el teclado para recorrerlo
   */
  scrollable?: boolean;
  /**
   * La región del texto, para pasarle el foco. El texto va antes que el enunciado, así que al empezar un
   * texto nuevo el foco va aquí y no al enunciado. Solo hay región con scrollable (hallazgo 10 de la revisión)
   */
  regionRef?: Ref<HTMLDivElement>;
  /** Un elemento que describe la región al enfocarla, como el lugar de la pregunta en el examen */
  describedBy?: string;
  className?: string;
}) {
  const id = useId();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [open, setOpen] = useState(fold === 'never');
  const copy = englishText.reading;
  const folds = fold === 'always' || (fold === 'phone' && !desktop);
  const labelId = `${id}-etiqueta`;
  const bodyId = `${id}-texto`;
  return (
    <div className={cn('rounded-md bg-muted p-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={labelId} className="eyebrow text-fg-muted">
          {copy.label}
        </p>
        {folds ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => {
              setOpen((value) => !value);
            }}
          >
            {open ? copy.hide : copy.show}
          </Button>
        ) : null}
      </div>
      <div
        id={bodyId}
        ref={regionRef}
        hidden={folds && !open}
        {...(scrollable
          ? {
              role: 'region',
              'aria-labelledby': labelId,
              'aria-describedby': describedBy,
              tabIndex: 0,
            }
          : {})}
        className={cn(
          'mt-1',
          scrollable &&
            'rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus lg:max-h-[calc(100dvh-14rem)] lg:overflow-y-auto',
        )}
      >
        <p lang="en" className="whitespace-pre-line">
          {text}
        </p>
      </div>
      <PassageSourceLine refs={refs} className="mt-2" />
    </div>
  );
}

/**
 * El tiempo sugerido del texto y, si el alumno se pasó, la línea de aviso con su ícono. No detiene
 * nada. El aviso se anuncia una sola vez al pasarse, en una región aparte, para que el lector de
 * pantalla no repita el contador cada segundo
 */
export function PassageTimeAdvice({
  position,
  size,
  suggestedSeconds,
  onTextSeconds,
  overSeconds,
}: {
  /** Lugar de la pregunta en el texto, desde 0 */
  position: number;
  /** Preguntas que trae el texto en esta práctica */
  size: number;
  suggestedSeconds: number;
  onTextSeconds: number;
  /** Segundos de más sobre el tiempo sugerido. 0 mientras no se pasa */
  overSeconds: number;
}) {
  const copy = englishText.reading;
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-fg-muted">
        {size > 1 ? <span>{copy.position(position + 1, size)}</span> : null}
        <span>
          {copy.suggested(suggestedSeconds)} · {copy.onText(onTextSeconds)}
        </span>
      </p>
      {overSeconds > 0 ? (
        <p className="flex items-center gap-1.5 rounded-md border border-warning bg-warning-soft px-2 py-1 font-medium text-fg">
          <AlarmClock aria-hidden className="size-4 shrink-0" />
          {copy.over(overSeconds)}
        </p>
      ) : null}
      <span role="status" className="sr-only">
        {overSeconds > 0 ? copy.overAnnounce : ''}
      </span>
    </div>
  );
}
