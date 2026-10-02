// Foto de perfil. Muestra la foto si existe y si no, las iniciales sobre un color estable por
// alumno. Las fotos subidas y los avatares generados llegan con el bloque P2 (D-060).
import { cn } from '@/ui/cn';

const TONES = ['bg-mi', 'bg-ped', 'bg-gyo', 'bg-cir', 'bg-urg', 'bg-primary'];

function hash(text: string): number {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : name.slice(0, 2);
  return letters.toUpperCase();
}

export function Avatar({
  name,
  seed,
  src,
  className,
}: {
  name: string;
  /** Algo estable del alumno, como su ID, para que el color no cambie */
  seed: string;
  src?: string | null;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn('size-9 rounded-full object-cover ring-2 ring-surface', className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 items-center justify-center rounded-full text-sm font-bold text-white ring-2 ring-surface',
        TONES[hash(seed) % TONES.length],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
