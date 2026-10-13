import { Progress } from 'radix-ui';
import { cn } from '@/ui/cn';

interface ProgressBarProps {
  value: number;
  max: number;
  /** Texto que lee el lector de pantalla, por ejemplo 12 de 40 errores etiquetados */
  label: string;
  className?: string;
  /** Color de la barra. neutral para XP, nivel y metas, que ya no llevan color (4.7 del plan del cambio) */
  tone?: 'primary' | 'neutral';
}

export function ProgressBar({ value, max, label, className, tone = 'primary' }: ProgressBarProps) {
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const percent = (clamped / safeMax) * 100;
  return (
    <Progress.Root
      value={clamped}
      max={safeMax}
      aria-label={label}
      getValueLabel={() => label}
      className={cn('relative h-2.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <Progress.Indicator
        className={cn(
          'h-full rounded-full transition-[width] duration-700',
          tone === 'primary' ? 'bg-primary' : 'bg-fg-muted',
        )}
        style={{ width: `${percent}%` }}
      />
    </Progress.Root>
  );
}
