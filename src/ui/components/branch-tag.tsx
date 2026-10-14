// Color de cada rama en la interfaz (D-128). La etiqueta lleva el fondo suave y la tinta de su rama y
// la marca es una línea delgada del tono lleno junto al nombre, en las listas por rama. Las dos van
// siempre con el nombre de la rama, así el color nunca es la única señal. Una rama que no se conoce
// queda en neutro
import type { ReactNode } from 'react';
import { branchTone, TONE_CLASSES } from '@/ui/branches';
import { cn } from '@/ui/cn';
import { Badge } from './badge';

/** Etiqueta con el nombre de la rama, o de la rama y el tema, en el color de la rama */
export function BranchBadge({
  branch,
  className,
  children,
}: {
  /** Clave de la rama, como internal_medicine, o de un mazo de Paco */
  branch: string | null | undefined;
  className?: string;
  children: ReactNode;
}) {
  const tone = branchTone(branch);
  return (
    <Badge
      className={cn(
        tone !== 'neutral' && ['border-transparent', TONE_CLASSES[tone].chip],
        className,
      )}
    >
      {children}
    </Badge>
  );
}

/** Línea delgada del color de la rama, a la izquierda de su nombre en una lista. Es decorativa */
export function BranchMark({
  branch,
  className,
}: {
  branch: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn('h-6 w-1 shrink-0 rounded-sm', TONE_CLASSES[branchTone(branch)].bar, className)}
    />
  );
}
