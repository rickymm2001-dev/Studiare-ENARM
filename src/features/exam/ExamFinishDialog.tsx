// Confirmación para terminar el examen. Dice cuántas llevas contestadas, cuántas dejarías en blanco
// y cuántas marcaste, y ofrece saltar a la primera en blanco o marcada para aprovechar el tiempo.
import { Flag, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useRef } from 'react';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { useReturnFocus } from '@/ui/hooks/use-return-focus';

export function ExamFinishDialog({
  open,
  onOpenChange,
  answered,
  blank,
  marked,
  onConfirm,
  onGoBlank,
  onGoMarked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  answered: number;
  blank: number;
  marked: number;
  onConfirm: () => void;
  onGoBlank: () => void;
  onGoMarked: () => void;
}) {
  const returnFocus = useReturnFocus();
  // Al seguir con el examen el foco regresa al botón Terminar examen. Terminar lleva a los
  // resultados, donde el shell lo pasa al título, e ir a una pregunta lo pasa a su enunciado, así
  // que ahí no regresa
  const focusMoves = useRef(false);
  const movingFocus = (action: () => void) => () => {
    focusMoves.current = true;
    action();
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className="animate-rise fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-raised"
          onOpenAutoFocus={returnFocus.onOpenAutoFocus}
          onCloseAutoFocus={(event) => {
            returnFocus.onCloseAutoFocus(event, focusMoves.current);
            focusMoves.current = false;
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Dialog.Title className="flex items-center gap-2 text-xl font-extrabold">
                <Flag aria-hidden className="size-5 text-accent" />
                {t.exam.finishTitle}
              </Dialog.Title>
              <Dialog.Description className="text-fg-muted">
                {t.exam.finishBody(answered, blank, marked)}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="flex size-touch shrink-0 items-center justify-center rounded-full hover:bg-muted"
              aria-label={t.exam.close}
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>
          <div className="flex flex-col gap-2">
            <Button onClick={movingFocus(onConfirm)}>{t.exam.finishConfirm}</Button>
            <Button
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t.exam.finishKeep}
            </Button>
            {blank > 0 ? (
              <Button variant="ghost" onClick={movingFocus(onGoBlank)}>
                {t.exam.goFirstBlank}
              </Button>
            ) : null}
            {marked > 0 ? (
              <Button variant="ghost" onClick={movingFocus(onGoMarked)}>
                {t.exam.goFirstMarked}
              </Button>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
