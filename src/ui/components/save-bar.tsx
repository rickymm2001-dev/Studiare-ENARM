import { RotateCcw, Save } from 'lucide-react';
import { t } from '@/i18n/es-MX';
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
}: {
  dirty: boolean;
  /** Mensaje después de guardar o descartar, por ejemplo Guardado */
  status: string;
  onDiscard?: () => void;
  /** Sin onSave el botón es de tipo submit y guarda el formulario que lo contiene */
  onSave?: () => void;
}) {
  return (
    <>
      {dirty ? (
        <div className="sticky bottom-[calc(var(--spacing-nav)+env(safe-area-inset-bottom)+0.5rem)] z-10 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface/95 p-2.5 shadow-raised backdrop-blur lg:bottom-4">
          <p className="mr-auto pl-1 text-sm font-semibold text-warning">{t.settings.unsaved}</p>
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
