// Clases de las pestañas y filtros excluyentes. Píldora gris con la opción activa en marino y texto
// blanco, como las de la portada (D-150). Viven aparte del componente para que las pestañas que son
// enlaces o usan role tab tomen la misma forma.
import { cn } from '@/ui/cn';

export const segmentedList = 'inline-flex max-w-full flex-wrap gap-1 rounded-full bg-muted p-1';

const item =
  'flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors';

const active = 'bg-primary text-primary-fg';
const inactive = 'text-fg hover:bg-surface';

export function segmentedItem(isActive: boolean, className?: string) {
  return cn(item, isActive ? active : inactive, className);
}

/** Para las pestañas de Radix, que marcan la activa con data-state en lugar de una prop */
export const segmentedTabItem = cn(
  item,
  'text-fg',
  'data-[state=inactive]:hover:bg-surface',
  'data-[state=active]:bg-primary data-[state=active]:text-primary-fg',
);
