// Barra del tiempo sugerido de la tarjeta. Es un aviso visual y un texto, nunca un castigo. Al
// acabarse dice una vez que ya pasó el tiempo, sin sonido y sin quitar la tarjeta.
import { Timer } from 'lucide-react';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';

export function CardTimerBar({
  remainingMs,
  totalSeconds,
  expired,
}: {
  remainingMs: number;
  totalSeconds: number;
  expired: boolean;
}) {
  const seconds = Math.ceil(remainingMs / 1000);
  const share = Math.max(0, Math.min(1, remainingMs / (totalSeconds * 1000)));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm text-fg-muted">
        <Timer aria-hidden className="size-4" />
        <span id="tiempo-sugerido">{t.review.timer.label}</span>
        {/* role timer no anuncia cada segundo, así que el lector de pantalla no se llena de números */}
        <span role="timer" aria-labelledby="tiempo-sugerido" className="font-semibold tabular-nums">
          {t.review.timer.left(seconds)}
        </span>
      </div>
      <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', expired ? 'bg-warning' : 'bg-primary')}
          style={{ width: `${(share * 100).toFixed(1)}%` }}
        />
      </div>
      <p role="status" className={cn('text-sm font-medium text-warning', !expired && 'sr-only')}>
        {expired ? t.review.timer.expired : ''}
      </p>
    </div>
  );
}
