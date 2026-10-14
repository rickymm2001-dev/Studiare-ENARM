// El aviso de una sesión que empezó con menos preguntas (B11, 5.4). Va en el marco de la app, arriba
// del contenido, y se anuncia al lector de pantalla sin mover el foco.
import { Info } from 'lucide-react';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { useBankNotice } from './bankNotice';

export function BankNoticeBanner({ className }: { className?: string }) {
  const notice = useBankNotice((state) => state.notice);
  const clear = useBankNotice((state) => state.clear);
  const text = t.cloudBank.shortfall;
  return (
    <div
      role="status"
      className={cn(notice ? 'border-b border-line bg-warning-soft' : '', className)}
    >
      {notice ? (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-sm text-fg">
          <Info aria-hidden className="size-4 shrink-0" />
          <span className="font-semibold">{text.started(notice.granted, notice.requested)}</span>
          <span>
            {notice.reason === 'brake' && notice.retryAt
              ? t.cloudBank.brake(notice.retryAt)
              : text.reasons[notice.reason]}
          </span>
          <Button size="sm" variant="ghost" onClick={clear}>
            {text.dismiss}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
