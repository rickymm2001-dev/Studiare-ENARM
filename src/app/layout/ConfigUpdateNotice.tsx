// Aviso de que el servidor trae una configuración nueva (Fase G, G3). Los motores leen los umbrales y
// los pesos al abrir la app, así que para aplicarlos hay que recargar. No obliga, porque el alumno
// puede estar a la mitad de una sesión, y se descarta con Después.
import { RefreshCw } from 'lucide-react';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { useConfigUpdate } from '../configUpdate';

export function ConfigUpdateNotice({ className = '' }: { className?: string }) {
  const pending = useConfigUpdate((store) => store.pending);
  const set = useConfigUpdate((store) => store.set);
  if (!pending) return null;
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-muted px-4 py-3 text-sm text-fg ${className}`}
    >
      <RefreshCw aria-hidden className="size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 basis-60">
        <p className="font-semibold">{t.configUpdate.title}</p>
        <p>{t.configUpdate.body}</p>
      </div>
      <Button
        size="sm"
        onClick={() => {
          window.location.reload();
        }}
      >
        {t.configUpdate.reload}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          set(false);
        }}
      >
        {t.configUpdate.later}
      </Button>
    </div>
  );
}
