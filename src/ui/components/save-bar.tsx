import { RotateCcw, Save } from 'lucide-react';
import { t } from '@/i18n/es-MX';
import { cn } from '../cn';
import { Button } from './button';

/**
 * Barra de guardar de un formulario (D-078). Solo aparece cuando hay cambios sin guardar y queda
 * fija abajo mientras el formulario está en pantalla. El aviso de guardado se anuncia aparte
 */
export function SaveBar({
  dirty,
  status,
  onDiscard,
  onSave,
  className,
}: {
  dirty: boolean;
  /** Mensaje después de guardar o descartar, por ejemplo Guardado */
  status: string;
  onDiscard?: () => void;
  /** Sin onSave el botón es de tipo submit y guarda el formulario que lo contiene */
  onSave?: () => void;
  /** Por ejemplo otra distancia al borde dentro de un panel, donde no hay barra de navegación abajo */
  className?: string;
}) {
  return (
    <>
      {dirty ? (
        <div
          className={cn(
            // Píldora panel, como la barra de guardar del diseño (D-150)
            'glass sticky bottom-[calc(var(--spacing-nav)+env(safe-area-inset-bottom)+0.5rem)] z-10 flex flex-wrap items-center gap-2 rounded-full border border-line px-4 py-2.5 shadow-raised lg:bottom-4',
            className,
          )}
        >
          <p className="mr-auto text-sm font-semibold text-fg">{t.settings.unsaved}</p>
          {onDiscard ? (
            <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
              <RotateCcw aria-hidden />
              {t.settings.discard}
            </Button>
          ) : null}
          <Button type={onSave ? 'button' : 'submit'} size="sm" onClick={onSave}>
            <Save aria-hidden />
            {t.settings.saveChanges}
          </Button>
        </div>
      ) : null}
      <p role="status" className={dirty || !status ? 'sr-only' : 'text-sm text-fg-muted'}>
        {dirty ? '' : status}
      </p>
    </>
  );
}
