import { Progress } from 'radix-ui';
import { cn } from '@/ui/cn';

interface ProgressBarProps {
  value: number;
  max: number;
  /** Texto que lee el lector de pantalla, por ejemplo 12 de 40 errores etiquetados */
  label: string;
  className?: string;
  /** Color de la barra. gold para XP y metas */
  tone?: 'primary' | 'gold' | 'flame' | 'light';
  /** Pista translúcida para usarla sobre la tarjeta oscura (D-079) */
  onDark?: boolean;
}

export function ProgressBar({
  value,
  max,
  label,
  className,
  tone = 'primary',
  onDark = false,
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const percent = (clamped / safeMax) * 100;
  return (
    <Progress.Root
      value={clamped}
      max={safeMax}
      aria-label={label}
      getValueLabel={() => label}
      className={cn(
        'relative h-2.5 w-full overflow-hidden rounded-full',
        onDark ? 'bg-white/20' : 'bg-muted',
        className,
      )}
    >
      <Progress.Indicator
        className={cn(
          'h-full rounded-full transition-[width] duration-700',
          tone === 'primary' && 'bg-primary',
          tone === 'gold' && 'bg-gold',
          tone === 'flame' && 'bg-flame',
          tone === 'light' && 'bg-white',
        )}
        style={{ width: `${percent}%` }}
      />
    </Progress.Root>
  );
}
