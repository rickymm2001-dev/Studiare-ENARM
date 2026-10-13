// Pestañas y filtros excluyentes con una sola forma en toda la app (H01 de la revisión de diseño de
// B2). Contenedor gris con radio chico y la opción activa en superficie con borde, sin píldoras.
// Las pestañas que son enlaces o que usan role tab toman las mismas clases con segmentedList y
// segmentedItem, para conservar su semántica.
import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { segmentedItem, segmentedList } from './segmented-classes';

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
