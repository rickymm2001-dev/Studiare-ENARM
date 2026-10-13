// Esqueletos de carga en lugar de ruedas que giran (H04 de la revisión de diseño de B2). Las líneas
// tienen la altura del contenido que va a llegar y el texto de carga solo lo oye el lector de
// pantalla. Sin animación cuando el alumno pide reducir movimiento.
import { cn } from '@/ui/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'block h-4 animate-pulse rounded-sm bg-muted motion-reduce:animate-none',
        className,
      )}
    />
  );
}

/** Varias líneas de esqueleto con su aviso de carga para el lector de pantalla */
export function SkeletonRows({
  label,
  rows = 3,
  className,
  rowClassName,
}: {
  label: string;
  rows?: number;
  className?: string;
  rowClassName?: string;
}) {
  const widths = ['w-full', 'w-5/6', 'w-2/3', 'w-3/4', 'w-1/2'];
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col gap-2', className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={cn(widths[index % widths.length], rowClassName)} />
      ))}
    </div>
  );
}
