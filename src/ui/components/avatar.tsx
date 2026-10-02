// Foto de perfil (D-068). Foto propia, avatar médico generado o iniciales sobre un color estable.
import type { Account } from '@/data/schemas/people';
import { cn } from '@/ui/cn';
import { GeneratedAvatar } from './generated-avatar';

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
