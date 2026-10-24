// Una opción de una pregunta de opción múltiple que se puede elegir y descartar. La comparten la
// práctica y el examen, así tachar una opción se ve y se lee igual en los dos. Descartar no cambia
// la respuesta, solo ayuda a pensar, y queda registrado para medir cómo descarta (D-080). Un doble
// clic en el texto de la opción la elige y la responde, para no cruzar la pantalla hasta el botón (D-087).
// Desde D-150 es una tarjeta píldora con la letra en un círculo. Gris con la letra en marino, marina
// con la letra en blanco en la elegida, y gris con la letra tachada en la descartada. El radio sigue
// ahí para el teclado y el lector de pantalla, solo que no se ve, y el foco se pinta en la tarjeta.
import { Ban, RotateCcw } from 'lucide-react';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';

export function OptionChoice({
  name,
  letter,
  text,
  lang,
  selected,
  discarded,
  onChoose,
  onToggleDiscard,
  onActivate,
  readOnlyChoice = false,
}: {
  /** Nombre del grupo de opciones, para que las de una pregunta formen un solo grupo */
  name: string;
  letter: string;
  text: string;
  /** Idioma del texto de la opción, cuando no es español, como en Inglés médico (B13) */
  lang?: string | undefined;
  selected: boolean;
  discarded: boolean;
  onChoose: () => void;
  onToggleDiscard: () => void;
  /** Doble clic en la opción. Sin esto el doble clic solo la elige */
  onActivate?: () => void;
  /** La opción solo se lee. La respuesta se llena en otra parte, como en la hoja de respuestas (V4-B5) */
  readOnlyChoice?: boolean;
}) {
  return (
    <li
      className={cn(
        'flex items-stretch rounded-lg border-[1.5px] border-line bg-surface transition-colors',
        'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus',
        !readOnlyChoice && !selected && 'hover:border-indicator',
        selected && 'border-primary bg-primary-soft',
        discarded && !selected && 'bg-muted',
      )}
    >
      <label
        className={cn(
          'flex min-w-0 flex-1 items-center gap-4 py-3 pl-3.5 pr-2',
          readOnlyChoice ? 'cursor-default' : 'cursor-pointer',
        )}
        onDoubleClick={readOnlyChoice ? undefined : onActivate}
      >
        <input
          type="radio"
          name={name}
          className="sr-only"
          checked={selected}
          disabled={readOnlyChoice}
          onChange={onChoose}
        />
        {/* La letra se lee junto con el texto, abajo. El círculo es su versión visible */}
        <span
          aria-hidden
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-extrabold text-heading tabular-nums',
            selected && 'bg-primary text-primary-fg',
            discarded && !selected && 'text-fg-muted line-through',
          )}
        >
          {letter}
        </span>
        <span
          className={cn(
            'text-base leading-relaxed',
            selected && 'font-semibold',
            discarded && 'text-fg-muted line-through',
          )}
        >
          <span className="sr-only">{letter}. </span>
          {lang === undefined ? text : <span lang={lang}>{text}</span>}
          {discarded ? <span className="sr-only"> ({t.choice.discardedLabel})</span> : null}
        </span>
      </label>
      <button
        type="button"
        aria-pressed={discarded}
        aria-label={discarded ? t.choice.restoreOption(letter) : t.choice.discardOption(letter)}
        title={discarded ? t.choice.restore : t.choice.discard}
        disabled={selected}
        onClick={onToggleDiscard}
        className={cn(
          'my-1.5 mr-1.5 flex w-10 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40',
          discarded && 'text-danger',
        )}
      >
        {discarded ? (
          <RotateCcw aria-hidden className="size-4" />
        ) : (
          <Ban aria-hidden className="size-4" />
        )}
      </button>
    </li>
  );
}
