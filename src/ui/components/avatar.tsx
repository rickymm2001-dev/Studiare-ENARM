// Foto de perfil (D-068, B2 del plan del cambio). Foto propia recortada en círculo o iniciales sobre
// el tono suave del color de acción. Los avatares generados y los colores fijos por alumno se quitaron
// en B2. Una cuenta vieja que todavía guarde un avatar generado se ve como iniciales.
import type { Account } from '@/data/schemas/people';
import { cn } from '@/ui/cn';

/** Una o dos letras del alias. Dos palabras dan dos iniciales y una palabra sus dos primeras letras */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : name.trim().slice(0, 2);
  return letters.toUpperCase();
}

export function Avatar({
  name,
  src,
  avatar,
  className,
}: {
  name: string;
  /** Ya no cambia nada. Los colores fijos por alumno se quitaron en B2 y quien lo pasa puede dejar de hacerlo */
  seed?: string;
  src?: string | null;
  /** Lo que eligió el alumno. Si falta, se usan src o las iniciales */
  avatar?: Account['avatar'] | null;
  className?: string;
}) {
  const photo = avatar?.kind === 'photo' ? avatar.dataUrl : src;
  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        className={cn('size-9 rounded-full object-cover ring-2 ring-surface', className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-ink ring-2 ring-surface',
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
