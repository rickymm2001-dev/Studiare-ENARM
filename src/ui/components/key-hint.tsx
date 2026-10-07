import type { ReactNode } from 'react';
import { cn } from '../cn';

/** Una tecla dentro de un texto de ayuda */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-muted px-1 py-px font-sans text-[0.7rem] font-semibold text-fg">
      {children}
    </kbd>
  );
}

/**
 * Recordatorio de los atajos de teclado (D-087). Solo se ve donde hay ratón y teclado. En un
 * teléfono, donde no hay teclas, no ocupa lugar
 */
export function KeyHint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'hidden text-xs text-fg-muted [@media(hover:hover)_and_(pointer:fine)]:block',
        className,
      )}
    >
      {children}
    </p>
  );
}
