// Filtro que se prende y se apaga, con su conteo opcional (H01 de la revisión de diseño de B2).
// Radio chico como el resto de los controles. Prendido toma el tono suave del color de acción.
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/ui/cn';

type FilterChipProps = Omit<ComponentProps<'button'>, 'onClick' | 'type'> & {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  /** Cuántos elementos quedan con este filtro, en números tabulares */
  count?: ReactNode;
};

export function FilterChip({
  pressed,
  onPressedChange,
  count,
  className,
  children,
  ...props
}: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => {
        onPressedChange(!pressed);
      }}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold transition-colors',
        pressed
          ? 'border-indicator bg-primary-soft text-primary-ink'
          : 'border-line bg-surface text-fg hover:bg-muted',
        className,
      )}
      {...props}
    >
      {children}
      {count === undefined ? null : (
        <span
          className={cn('font-normal tabular-nums', pressed ? 'text-primary-ink' : 'text-fg-muted')}
        >
          {count}
        </span>
      )}
    </button>
  );
}
