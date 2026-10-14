import { Progress } from 'radix-ui';
import { cn } from '@/ui/cn';

interface ProgressBarProps {
  value: number;
  max: number;
  /** Texto que lee el lector de pantalla, por ejemplo 12 de 40 errores etiquetados */
  label: string;
  className?: string;
  /**
   * Color de la barra. accent para el XP y el nivel, en el acento cálido de la paleta (D-128), y
   * neutral para lo que ya terminó, como una misión cumplida
   */
  tone?: 'primary' | 'accent' | 'neutral';
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
          tone === 'primary' ? 'bg-indicator' : tone === 'accent' ? 'bg-accent' : 'bg-fg-muted',
        )}
        style={{ width: `${percent}%` }}
      />
    </Progress.Root>
  );
}
