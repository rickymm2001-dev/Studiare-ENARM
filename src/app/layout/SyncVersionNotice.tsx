// Aviso discreto de que la sincronización de la bitácora está en pausa porque hay eventos de una versión más
// nueva que esta app (D-146). Sale arriba, bajo el aviso de versión nueva de la PWA, y se puede cerrar. El
// botón activa la versión nueva y recarga. Quien arma la pantalla lo monta junto a PwaUpdatePrompt.
import { RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { syncVersionText as text } from '@/i18n/syncVersion';
import { Button } from '@/ui/components/button';
import { applyLatestVersion } from '../applyLatestVersion';
import { useSyncStatus } from '../syncState';

export function SyncVersionNotice() {
  const blocked = useSyncStatus((store) => store.state.blockedByNewerVersion === true);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);
  if (!blocked || dismissed) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 mx-auto flex max-w-reading items-start gap-3 rounded-lg border border-line bg-surface p-3 shadow-raised lg:top-[calc(var(--spacing-topbar)+4.5rem)] lg:right-6 lg:left-auto lg:mx-0 lg:w-auto lg:max-w-md"
    >
      <div className="flex flex-1 flex-col gap-2">
        <p className="text-sm font-semibold text-fg">{text.title}</p>
        <p className="text-sm text-fg-muted">{text.body}</p>
        <Button
          size="sm"
          className="self-start"
          disabled={updating}
          onClick={() => {
            setUpdating(true);
            void applyLatestVersion();
          }}
        >
          <RefreshCw aria-hidden />
          {updating ? text.updating : text.update}
        </Button>
      </div>
      <Button
        size="icon"
        variant="ghost"
        aria-label={text.dismiss}
        onClick={() => {
          setDismissed(true);
        }}
      >
        <X aria-hidden />
      </Button>
    </div>
  );
}
