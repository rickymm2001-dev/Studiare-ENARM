// Clases de las pestañas y filtros excluyentes (H01 de la revisión de diseño de B2). Viven aparte del
// componente para que las pestañas que son enlaces o usan role tab tomen la misma forma.
import { cn } from '@/ui/cn';

export const segmentedList =
  'inline-flex max-w-full flex-wrap gap-1 rounded-md border border-line bg-muted p-1';

const item =
  'flex min-h-9 items-center justify-center rounded-sm border px-3 text-sm font-semibold transition-colors';

// La opción elegida se ve como un filtro prendido (FilterChip), con borde del indicador y el tono
// suave del color de acción, así se distingue en claro y en oscuro. Blanco sobre el gris del
// contenedor apenas daba 1.1 a 1
const active = 'border-indicator bg-primary-soft text-primary-ink';
const inactive = 'border-transparent text-fg-muted hover:bg-surface/60 hover:text-fg';

export function segmentedItem(isActive: boolean, className?: string) {
  return cn(item, isActive ? active : inactive, className);
}

/** Para las pestañas de Radix, que marcan la activa con data-state en lugar de una prop */
export const segmentedTabItem = cn(
  item,
  'border-transparent text-fg-muted',
  'data-[state=inactive]:hover:bg-surface/60 data-[state=inactive]:hover:text-fg',
  'data-[state=active]:border-indicator data-[state=active]:bg-primary-soft data-[state=active]:text-primary-ink',
);
