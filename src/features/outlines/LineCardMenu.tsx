// Los tipos de tarjeta para la línea del cursor (B6 del plan del cambio, respuesta 74). Se abre con el
// botón de la línea o con el de la barra, debajo de la línea. Cada opción dice su marca, así el
// alumno la aprende sin tener que memorizarla. Con el ratón o el dedo el editor no pierde el foco,
// así el teclado del teléfono no se cierra. Con el teclado el foco entra a la primera opción y Esc
// regresa al editor.
import { X } from 'lucide-react';
import { useEffect, useRef, type CSSProperties } from 'react';
import type { LineCardKind, LineKind } from '@/engines/outlineLine';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';

const KINDS: readonly LineCardKind[] = ['forward', 'both', 'cloze', 'multiline'];

/** Que el botón no le quite el foco al editor al tocarlo */
const keepFocus = (event: { preventDefault: () => void }) => {
  event.preventDefault();
};

export function LineCardMenu({
  id,
  kind,
  empty,
  focusFirst,
  style,
  onChoose,
  onClose,
}: {
  id: string;
  /** Lo que la línea es hoy */
  kind: LineKind;
  /** La línea no tiene texto todavía */
  empty: boolean;
  /** Se abrió con el teclado, así que el foco entra a la primera opción */
  focusFirst: boolean;
  style?: CSSProperties;
  onChoose: (kind: LineCardKind | 'none') => void;
  onClose: (returnFocus: boolean) => void;
}) {
  const text = t.outlines.editor.lineCard;
  const panel = useRef<HTMLDivElement | null>(null);
  const first = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    // Con el teclado del teléfono abierto queda poco espacio, así que el menú se trae a la vista.
    // jsdom no implementa scrollIntoView, por eso se revisa que exista
    const element = panel.current;
    if (element && 'scrollIntoView' in element) element.scrollIntoView({ block: 'nearest' });
  }, []);
  useEffect(() => {
    if (focusFirst) first.current?.focus();
  }, [focusFirst]);

  return (
    <div
      ref={panel}
      id={id}
      role="group"
      aria-label={text.title}
      style={style}
      className="absolute inset-x-2 z-20 flex flex-col gap-2 rounded-lg border border-line-strong bg-surface p-2 shadow-card"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose(true);
      }}
      // Con el teclado, salir del menú hacia otro lugar lo cierra
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        if (next instanceof HTMLElement && next.closest('.outline-editor')) return;
        onClose(false);
      }}
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 px-1 pt-1 text-sm text-fg-muted">
          {empty ? text.emptyLine : text.hint}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={text.close}
          title={text.close}
          onMouseDown={keepFocus}
          onClick={() => {
            onClose(true);
          }}
        >
          <X aria-hidden />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-1 sm:flex sm:flex-wrap">
        {KINDS.map((option, index) => (
          <Button
            key={option}
            ref={index === 0 ? first : undefined}
            type="button"
            variant="secondary"
            aria-pressed={kind === option}
            disabled={empty}
            className="h-auto justify-between gap-2 px-3 py-1.5 text-left text-sm whitespace-normal aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary-ink"
            onMouseDown={keepFocus}
            onClick={() => {
              onChoose(option);
            }}
          >
            <span>{text.kinds[option]}</span>
            <span aria-hidden className="font-mono text-xs text-fg-muted">
              {text.marks[option]}
            </span>
          </Button>
        ))}
        {kind !== 'none' ? (
          <Button
            type="button"
            variant="ghost"
            className="col-span-2 h-auto justify-start px-3 py-1.5 text-sm whitespace-normal"
            onMouseDown={keepFocus}
            onClick={() => {
              onChoose('none');
            }}
          >
            {text.kinds.none}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
