// Una opción de una pregunta de opción múltiple que se puede elegir y descartar. La comparten la
// práctica y el examen, así tachar una opción se ve y se lee igual en los dos. Descartar no cambia
// la respuesta, solo ayuda a pensar, y queda registrado para medir cómo descarta (D-080).
import { Ban, RotateCcw } from 'lucide-react';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';

export function OptionChoice({
  name,
  letter,
  text,
  selected,
  discarded,
  onChoose,
  onToggleDiscard,
}: {
  /** Nombre del grupo de opciones, para que las de una pregunta formen un solo grupo */
  name: string;
  letter: string;
  text: string;
  selected: boolean;
  discarded: boolean;
  onChoose: () => void;
  onToggleDiscard: () => void;
}) {
  return (
    <li
      className={cn(
        'flex items-stretch rounded-md border border-line',
        selected && 'border-primary bg-primary-soft',
        discarded && 'bg-muted',
      )}
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 p-3 hover:bg-muted/60">
        <input type="radio" name={name} className="mt-1" checked={selected} onChange={onChoose} />
        <span className={cn(discarded && 'text-fg-muted line-through')}>
          <span className="mr-1 font-semibold">{letter}.</span>
          {text}
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
          'flex w-11 shrink-0 items-center justify-center rounded-r-md border-l border-line text-fg-muted hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40',
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
