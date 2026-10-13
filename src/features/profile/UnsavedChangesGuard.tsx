// Aviso al salir con cambios del perfil sin guardar (B3 del plan del cambio, comentario 16). Dentro
// de la app, el bloqueador del router pregunta antes de cambiar de pantalla y deja seguir editando o
// salir sin guardar. Al cerrar o recargar la pestaña, el navegador muestra su propio aviso. Solo se
// monta mientras se edita, porque el router admite un solo bloqueador a la vez.
import { AlertDialog } from 'radix-ui';
import { useCallback } from 'react';
import { useBeforeUnload, useBlocker, type BlockerFunction } from 'react-router';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';

export function UnsavedChangesGuard({ dirty }: { dirty: boolean }) {
  // Cambiar el ancla o la búsqueda de la misma página no es salir
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
    [dirty],
  );
  const blocker = useBlocker(shouldBlock);
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (dirty) event.preventDefault();
      },
      [dirty],
    ),
  );
  const text = t.settingsPage.unsaved;
  const blocked = blocker.state === 'blocked';
  return (
    <AlertDialog.Root
      open={blocked}
      onOpenChange={(open) => {
        // Escape es seguir editando
        if (!open) blocker.reset?.();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <AlertDialog.Content className="animate-rise fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-raised">
          <div className="flex flex-col gap-1">
            <AlertDialog.Title className="text-lg font-bold">{text.title}</AlertDialog.Title>
            <AlertDialog.Description className="text-fg-muted">{text.body}</AlertDialog.Description>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                blocker.reset?.();
              }}
            >
              {text.stay}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                blocker.proceed?.();
              }}
            >
              {text.leave}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
