// Los tres contadores del repaso (D-085, fila 8). Nuevas, Aprendizaje y Programadas, con la que
// cuenta la tarjeta de ahora subrayada. Cada uno lleva su nombre escrito, nunca solo el color.
import type { CounterKind, DailyCounters } from '@/engines/counters';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';

const KINDS: readonly CounterKind[] = ['new', 'learning', 'review'];

const TONE: Record<CounterKind, string> = {
  new: 'text-primary',
  learning: 'text-danger',
  review: 'text-success',
};

export function ReviewCounters({
  counters,
  current,
  label = t.review.counters.label,
  className,
}: {
  counters: DailyCounters;
  /** A cuál cuenta la tarjeta que se está viendo. null si no hay ninguna */
  current: CounterKind | null;
  /** Qué cuentan los números, para el lector de pantalla */
  label?: string;
  className?: string;
}) {
  return (
    <ul aria-label={label} className={cn('flex flex-wrap gap-x-3 gap-y-0.5', className)}>
      {KINDS.map((kind) => (
        <li
          key={kind}
          aria-current={current === kind ? 'true' : undefined}
          className={cn(
            'flex items-baseline gap-1 text-sm',
            current === kind && 'underline decoration-2 underline-offset-4',
          )}
        >
          <span className="text-fg-muted">{t.review.counters[kind]}</span>
          <strong className={cn('font-bold tabular-nums', TONE[kind])}>
            {counters[kind].toLocaleString('es-MX')}
          </strong>
        </li>
      ))}
    </ul>
  );
}
