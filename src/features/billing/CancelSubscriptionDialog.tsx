// Confirmación antes de cancelar una suscripción (V5-B0, defecto importante 2 de
// docs/DIAGNOSTICO_BETA.md). Un diálogo modal, con el foco dentro, que dice lo que el alumno pierde al
// volver a Gratis, con las palabras de la tabla de planes, y hasta qué fecha sigue su plan. Solo cancela
// al confirmar. Conservarla es lo seguro, así que recibe el foco al abrir y Escape también conserva. Lo
// usan la cancelación de Mercado Pago, que no tiene portal, y la del pago simulado.
import { Minus } from 'lucide-react';
import { AlertDialog } from 'radix-ui';
import type { PlanKey } from '@/config/billing';
import { billingCloudText } from '@/i18n/billingCloud';
import { Button } from '@/ui/components/button';
import { useReturnFocus } from '@/ui/hooks/use-return-focus';
import { lostOnCancel } from './planLines';

const text = billingCloudText.cancelDialog;

export function CancelSubscriptionDialog({
  open,
  plan,
  description,
  onKeep,
  onConfirm,
}: {
  open: boolean;
  /** El plan que se cancela, para listar lo que se pierde */
  plan: PlanKey;
  /** Hasta cuándo sigue el plan y qué pasa después, con las palabras de cada forma de pago */
  description: string;
  /** Conservarla, también con Escape o el fondo */
  onKeep: () => void;
  onConfirm: () => void;
}) {
  // Se abre con el botón de la tarjeta, sin un Trigger de Radix. Al cerrar, el foco vuelve ahí
  const returnFocus = useReturnFocus();
  const lost = lostOnCancel(plan);
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onKeep();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <AlertDialog.Content
          onOpenAutoFocus={returnFocus.onOpenAutoFocus}
          onCloseAutoFocus={(event) => {
            returnFocus.onCloseAutoFocus(event);
          }}
          className="animate-rise fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-raised"
        >
          <div className="flex flex-col gap-1">
            <AlertDialog.Title className="text-lg font-bold">{text.title}</AlertDialog.Title>
            <AlertDialog.Description className="text-fg-muted">
              {description}
            </AlertDialog.Description>
          </div>
          {lost.length > 0 ? (
            <div className="flex flex-col gap-1 text-sm">
              <p className="font-semibold">{text.loses}</p>
              <ul className="flex flex-col gap-1">
                {lost.map((line) => (
                  <li key={line} className="flex items-center gap-2">
                    <Minus aria-hidden className="size-4 shrink-0 text-fg-muted" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">{text.keep}</Button>
            </AlertDialog.Cancel>
            <Button variant="danger" onClick={onConfirm}>
              {text.confirm}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
