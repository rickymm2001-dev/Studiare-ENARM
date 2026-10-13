// Aviso al salir con cambios sin guardar (B3 del plan del cambio, comentarios 4 y 16). Dentro de la
// app, el bloqueador del router pregunta antes de salir y deja seguir editando o salir sin guardar.
// Editar perfil avisa al cambiar de pantalla y Ajustes del repaso al cerrar el panel con Escape, la X,
// el fondo o el botón de atrás. Al cerrar o recargar la pestaña, el navegador muestra su propio aviso
// si se pide. Solo se monta mientras se edita, porque el router admite un solo bloqueador a la vez.
import { AlertDialog } from 'radix-ui';
import { useCallback, useRef } from 'react';
import { useBeforeUnload, useBlocker, type BlockerFunction, type Location } from 'react-router';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { useReturnFocus } from '@/ui/hooks/use-return-focus';

/** Los textos del aviso. Por defecto, los de Editar perfil */
export interface UnsavedChangesText {
  title: string;
  body: string;
  stay: string;
  leave: string;
}

/** Salir es cambiar de pantalla. Cambiar el ancla o la búsqueda de la misma página no lo es */
const leavesScreen = (current: Location, next: Location) => current.pathname !== next.pathname;

export function UnsavedChangesGuard({
  dirty,
  leaves = leavesScreen,
  text = t.settingsPage.unsaved,
  warnOnUnload = true,
}: {
  dirty: boolean;
  /** Qué cambio de dirección cuenta como salir. Conviene una función fija, fuera del componente */
  leaves?: (current: Location, next: Location) => boolean;
  text?: UnsavedChangesText;
  /** Pide también el aviso del navegador al cerrar o recargar la pestaña */
  warnOnUnload?: boolean;
}) {
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) => dirty && leaves(currentLocation, nextLocation),
    [dirty, leaves],
  );
  const blocker = useBlocker(shouldBlock);
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (dirty && warnOnUnload) event.preventDefault();
      },
      [dirty, warnOnUnload],
    ),
  );
  // Al seguir editando, el foco vuelve a lo que lo tenía, como el enlace o el botón que intentó salir.
  // Al salir sin guardar lo pone el destino, como el título de la pantalla nueva (4.8)
  const leaving = useRef(false);
  const returnFocus = useReturnFocus();
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
        {/* Arriba de cualquier otro diálogo, porque también avisa con el panel de ajustes abierto */}
        <AlertDialog.Overlay className="fixed inset-0 z-60 bg-black/50 backdrop-blur-sm" />
        <AlertDialog.Content
          onOpenAutoFocus={returnFocus.onOpenAutoFocus}
          onCloseAutoFocus={(event) => {
            returnFocus.onCloseAutoFocus(event, leaving.current);
            leaving.current = false;
          }}
          className="animate-rise fixed top-1/2 left-1/2 z-70 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-raised"
        >
          <div className="flex flex-col gap-1">
            <AlertDialog.Title className="text-lg font-bold">{text.title}</AlertDialog.Title>
            <AlertDialog.Description className="text-fg-muted">{text.body}</AlertDialog.Description>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {/* Seguir editando es lo seguro, así que recibe el foco al abrir. Cerrar el aviso es
                seguir editando */}
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">{text.stay}</Button>
            </AlertDialog.Cancel>
            <Button
              variant="danger"
              onClick={() => {
                leaving.current = true;
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
