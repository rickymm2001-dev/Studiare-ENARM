// Registra el service worker y avisa cuando hay versión nueva o cuando la app ya sirve sin conexión.
// Con registerType prompt la versión nueva no se aplica sola, para no recargar a mitad de un repaso.
// El aviso va arriba para no tapar la barra de acciones ni la de guardar de abajo (D-078). El de
// sin conexión se quita solo a los pocos segundos y el de versión nueva espera a que el alumno decida.
import { RefreshCw, X } from 'lucide-react';
import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { t } from '@/i18n/core';
import { Button } from '@/ui/components/button';
import { NOTICE_STACK_ID } from './noticeStack';

/** Cuánto dura el aviso de que la app ya abre sin conexión */
const OFFLINE_NOTICE_MS = 8000;

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

  useEffect(() => {
    if (!offlineReady || needRefresh) return;
    const timer = window.setTimeout(() => {
      setOfflineReady(false);
    }, OFFLINE_NOTICE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [offlineReady, needRefresh, setOfflineReady]);

  const close = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
  };

  // El contenedor y su región viva están siempre. Un aviso que ya llega montado con su texto no lo anuncian
  // de forma fiable los lectores de pantalla, y con la región presente el texto aparece dentro y sí se lee. Los
  // avisos se apilan aquí en flujo vertical (D-146)
  return (
    <div
      id={NOTICE_STACK_ID}
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 mx-auto flex max-w-reading flex-col gap-2 lg:top-[calc(var(--spacing-topbar)+0.75rem)] lg:right-6 lg:left-auto lg:mx-0 lg:w-auto lg:max-w-md"
    >
      {needRefresh || offlineReady ? (
        <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-line bg-surface p-3 shadow-raised">
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
      ) : null}
    </div>
  );
}
