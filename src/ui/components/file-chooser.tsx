// Selector de archivo en español con la forma de los botones de la app (H07 de la revisión de diseño
// de B2). El input nativo queda oculto porque su botón y su texto salen en el idioma del navegador.
// La etiqueta con forma de botón lo abre y el foco del input se dibuja en ella. El nombre accesible
// es la etiqueta visible del campo seguida del texto del botón, así incluye lo que se ve (WCAG
// 2.5.3) y getByLabel con la etiqueta del campo sigue funcionando, igual que setInputFiles.
import { FolderOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/ui/components/button';

export function FileChooser({
  id,
  labelledBy,
  describedBy,
  accept,
  disabled = false,
  fileName,
  chooseText,
  emptyText,
  icon = <FolderOpen aria-hidden />,
  onChoose,
}: {
  id: string;
  /** Id de la etiqueta visible del campo, que va primero en su nombre */
  labelledBy: string;
  /** Id de la ayuda del campo, si la hay */
  describedBy?: string;
  accept: string;
  disabled?: boolean;
  /** Último archivo elegido. null si todavía no hay ninguno */
  fileName: string | null;
  chooseText: string;
  emptyText: string;
  icon?: ReactNode;
  onChoose: (file: File | undefined) => void | Promise<void>;
}) {
  const nameId = `${id}-elegido`;
  const chooseId = `${id}-boton`;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        aria-labelledby={`${labelledBy} ${chooseId}`}
        aria-describedby={describedBy ? `${describedBy} ${nameId}` : nameId}
        className="peer sr-only"
        onChange={(event) => {
          const input = event.target;
          void Promise.resolve(onChoose(input.files?.[0])).finally(() => {
            // Así se puede elegir el mismo archivo otra vez
            input.value = '';
          });
        }}
      />
      {/* La etiqueta con forma de botón queda fuera del árbol de accesibilidad para no leerse dos
          veces. Su texto entra al nombre del input por aria-labelledby */}
      <Button
        asChild
        variant="secondary"
        size="sm"
        className="cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus peer-disabled:pointer-events-none peer-disabled:opacity-50"
      >
        <label id={chooseId} htmlFor={id} aria-hidden>
          {icon}
          {chooseText}
        </label>
      </Button>
      <span id={nameId} className="min-w-0 text-sm break-all text-fg-muted">
        {fileName ?? emptyText}
      </span>
    </div>
  );
}
