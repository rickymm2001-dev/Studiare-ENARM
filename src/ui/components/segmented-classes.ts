// Clases de las pestañas y filtros excluyentes (H01 de la revisión de diseño de B2). Viven aparte del
// componente para que las pestañas que son enlaces o usan role tab tomen la misma forma.
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
