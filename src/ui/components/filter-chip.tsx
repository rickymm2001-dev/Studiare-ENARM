// Filtro que se prende y se apaga, con su conteo opcional (H01 de la revisión de diseño de B2).
// Radio chico como el resto de los controles. Prendido toma el tono suave del color de acción.
// FilterMenuChip tiene la misma forma y abre las opciones de un filtro, como el mazo o el tema de
// Buscar tarjetas (B4), así que dice si está abierto en lugar de si está prendido.
import { ChevronDown } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/ui/cn';

type FilterChipProps = Omit<ComponentProps<'button'>, 'onClick' | 'type'> & {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  /** Cuántos elementos quedan con este filtro, en números tabulares */
  count?: ReactNode;
};

function chipClasses(active: boolean, className?: string) {
  return cn(
    'inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold transition-colors',
    active
      ? 'border-indicator bg-primary-soft text-primary-ink'
      : 'border-line bg-surface text-fg hover:bg-muted',
    className,
  );
}

function ChipCount({ active, count }: { active: boolean; count: ReactNode }) {
  return (
    <span className={cn('font-normal tabular-nums', active ? 'text-primary-ink' : 'text-fg-muted')}>
      {count}
    </span>
  );
}

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
      className={chipClasses(pressed, className)}
      {...props}
    >
      {children}
      {count === undefined ? null : <ChipCount active={pressed} count={count} />}
    </button>
  );
}

type FilterMenuChipProps = Omit<ComponentProps<'button'>, 'type'> & {
  /** Hay algo elegido en este filtro */
  active: boolean;
  /** Sus opciones están a la vista */
  expanded: boolean;
  count?: ReactNode;
};

/** Chip que abre las opciones de un filtro. Lleva aria-expanded y una flecha */
export function FilterMenuChip({
  active,
  expanded,
  count,
  className,
  children,
  ...props
}: FilterMenuChipProps) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      className={chipClasses(active, cn('max-w-full', className))}
      {...props}
    >
      <span className="min-w-0 truncate">{children}</span>
      {count === undefined ? null : <ChipCount active={active} count={count} />}
      <ChevronDown
        aria-hidden
        className={cn('size-4 shrink-0 transition-transform', expanded && 'rotate-180')}
      />
    </button>
  );
}
