// Registra el service worker y avisa cuando hay versión nueva o cuando la app ya sirve sin conexión.
// Con registerType prompt la versión nueva no se aplica sola, para no recargar a mitad de un repaso.
import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error: unknown) {
      console.warn('No se pudo registrar el service worker', error);
    },
  });

  if (!needRefresh && !offlineReady) return null;

  const close = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
  };

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(var(--spacing-nav)+env(safe-area-inset-bottom)+0.75rem)] z-30 mx-auto flex max-w-reading items-center gap-3 rounded-lg border border-line bg-surface p-3 shadow-card lg:bottom-6 lg:left-[calc(var(--spacing-rail)+1rem)]"
    >
      <p className="flex-1 text-sm text-fg">
        {needRefresh ? t.pwa.updateAvailable : t.pwa.offlineReady}
      </p>
      {needRefresh ? (
        <Button size="sm" onClick={() => void updateServiceWorker(true)}>
          <RefreshCw aria-hidden />
          {t.pwa.reload}
        </Button>
      ) : null}
      <Button size="icon" variant="ghost" onClick={close} aria-label={t.pwa.dismiss}>
        <X aria-hidden />
      </Button>
    </div>
  );
}
