// Foto de perfil (D-068). Foto propia, avatar médico generado o iniciales sobre un color estable.
import type { Account } from '@/data/schemas/people';
import { cn } from '@/ui/cn';
import { GeneratedAvatar } from './generated-avatar';

// Colores fijos y no los de las ramas. Las iniciales son blancas y los colores de las ramas en modo
// oscuro son pasteles, así que no alcanzaban el contraste de 4.5 a 1. Estos van de 4.9 a 7.8 en
// los dos temas
const TONES = [
  'bg-[#0e5a6b]',
  'bg-[#b92b74]',
  'bg-[#6a4bc4]',
  'bg-[#c2410c]',
  'bg-[#0f766e]',
  'bg-[#15803d]',
];

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
  avatar,
  className,
}: {
  name: string;
  /** Algo estable del alumno, como su ID, para que el color no cambie */
  seed: string;
  src?: string | null;
  /** Lo que eligió el alumno. Si falta, se usan src o las iniciales */
  avatar?: Account['avatar'] | null;
  className?: string;
}) {
  if (avatar?.kind === 'generated')
    return <GeneratedAvatar seed={avatar.seed} className={className} />;
  if (avatar?.kind === 'photo') src = avatar.dataUrl;
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
