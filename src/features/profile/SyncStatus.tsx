// Estado de la sincronización entre dispositivos, dentro de la tarjeta de la cuenta en la nube
// (D-095). Dice cuándo fue la última, por qué falló si falló, y deja sincronizar al momento.
import { RefreshCw } from 'lucide-react';
import { useSyncStatus } from '@/app/syncState';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { syncMessage } from './syncMessage';

export function SyncStatus() {
  const { state, syncNow } = useSyncStatus();
  const text = t.cloud.sync;
  const message = state.running ? text.running : syncMessage(state.outcome, state.lastSyncAt);
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md bg-muted p-3 text-sm">
      <p className="font-semibold">{text.title}</p>
      <p className="text-fg-muted" role="status" aria-live="polite">
        {message}
      </p>
      {!state.running && state.outcome.status === 'ok' && state.outcome.rejected > 0 ? (
        <p className="text-fg-muted">{text.rejected(state.outcome.rejected)}</p>
      ) : null}
      {!state.running &&
      state.outcome.status === 'ok' &&
      state.outcome.pulled + state.outcome.pushed > 0 ? (
        <p className="text-fg-muted">
          {text.okChanges(state.outcome.pulled, state.outcome.pushed)}
        </p>
      ) : null}
      <Button
        variant="secondary"
        className="self-start"
        disabled={state.running || syncNow === null}
        onClick={() => {
          void syncNow?.();
        }}
      >
        <RefreshCw aria-hidden />
        {text.syncNow}
      </Button>
      <p className="text-xs text-fg-muted">{text.scope}</p>
    </div>
  );
}
