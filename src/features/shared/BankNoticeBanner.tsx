// El aviso de una sesión que empezó con menos preguntas (B11, 5.4). El marco de la app guarda arriba
// del contenido una región que el lector de pantalla anuncia sin mover el foco, y carga este contenido
// solo cuando hay aviso, para no pesar en el JavaScript inicial.
import { Info } from 'lucide-react';
import { cloudBankScreensText as bankText } from '@/i18n/cloudBankScreens';
import { Button } from '@/ui/components/button';
import { useBankNotice } from './bankNotice';

export function BankNoticeBanner() {
  const notice = useBankNotice((state) => state.notice);
  const clear = useBankNotice((state) => state.clear);
  if (!notice) return null;
  const text = bankText.shortfall;
  // Sin conexión y con todo lo pedido, solo se dice que salió de lo ya bajado
  const complete = notice.granted >= notice.requested;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-line bg-warning-soft px-4 py-2 text-sm text-fg">
      <Info aria-hidden className="size-4 shrink-0" />
      {complete ? (
        <span>{text.fromStored}</span>
      ) : (
        <>
          <span className="font-semibold">{text.started(notice.granted, notice.requested)}</span>
          <span>
            {notice.reason === 'brake' && notice.retryAt
              ? bankText.brake(notice.retryAt)
              : text.reasons[notice.reason]}
          </span>
        </>
      )}
      <Button size="sm" variant="ghost" onClick={clear}>
        {text.dismiss}
      </Button>
    </div>
  );
}
