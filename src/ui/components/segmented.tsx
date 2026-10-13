// Pestañas y filtros excluyentes con una sola forma en toda la app (H01 de la revisión de diseño de
// B2). Contenedor gris con radio chico y la opción activa en superficie con borde, sin píldoras.
// Las pestañas que son enlaces o que usan role tab toman las mismas clases con segmentedList y
// segmentedItem, para conservar su semántica.
import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';

export const segmentedList =
  'inline-flex max-w-full flex-wrap gap-1 rounded-md border border-line bg-muted p-1';

export function segmentedItem(active: boolean, className?: string) {
  return cn(
    'flex min-h-9 items-center justify-center rounded-sm border px-3 text-sm font-semibold transition-colors',
    active
      ? 'border-line bg-surface text-fg'
      : 'border-transparent text-fg-muted hover:bg-surface/60 hover:text-fg',
    className,
  );
}

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
}

/**
 * Grupo de botones donde solo uno queda presionado. Es un fieldset con su leyenda para el lector
 * de pantalla, como los filtros que reemplaza, y cada botón dice aria-pressed
 */
export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
  className,
  itemClassName,
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{label}</legend>
      <div className={cn(segmentedList, className)}>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => {
              onChange(option.value);
            }}
            className={segmentedItem(value === option.value, itemClassName)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
