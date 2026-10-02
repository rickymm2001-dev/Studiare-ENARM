// Avatar médico generado (D-068). SVG propio, sin librerías externas ni imágenes de terceros.
import { avatarParts } from '@/ui/avatarArt';
import { cn } from '@/ui/cn';

export function GeneratedAvatar({ seed, className }: { seed: string; className?: string }) {
  const p = avatarParts(seed);
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden
      className={cn('size-9 rounded-full ring-2 ring-surface', className)}
    >
      <rect width="64" height="64" fill={p.background} />
      {/* Bata */}
      <path d="M10 64c2-13 11-19 22-19s20 6 22 19z" fill="#ffffff" />
      <path d="M24 46l8 10 8-10" fill={p.scrubs} stroke="#e5e7eb" strokeWidth="1" />
      {p.hairStyle === 'long' ? (
        <path d="M16 30c0-12 7-19 16-19s16 7 16 19v14H16z" fill={p.hair} />
      ) : null}
      {/* Cuello y cara */}
      <rect x="27" y="36" width="10" height="9" rx="3" fill={p.skin} />
      <circle cx="32" cy="27" r="12" fill={p.skin} />
      <circle cx="27.5" cy="27" r="1.4" fill="#1d2125" />
      <circle cx="36.5" cy="27" r="1.4" fill="#1d2125" />
      <path
        d="M28 32c2 2 6 2 8 0"
        stroke="#1d2125"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
      {p.hairStyle === 'short' ? (
        <path d="M20 25c0-8 5-13 12-13s12 5 12 13c-3-4-7-6-12-6s-9 2-12 6z" fill={p.hair} />
      ) : null}
      {p.hairStyle === 'long' ? (
        <path d="M20 26c0-8 5-13 12-13s12 5 12 13c-4-5-8-7-12-7s-8 2-12 7z" fill={p.hair} />
      ) : null}
      {p.hairStyle === 'bun' ? (
        <>
          <circle cx="32" cy="12" r="5" fill={p.hair} />
          <path d="M20 25c0-8 5-12 12-12s12 4 12 12c-3-3-7-5-12-5s-9 2-12 5z" fill={p.hair} />
        </>
      ) : null}
      {p.hairStyle === 'curly' ? (
        <g fill={p.hair}>
          {[20, 25, 30, 35, 40, 44].map((x) => (
            <circle key={x} cx={x} cy={x === 20 || x === 44 ? 22 : 17} r="4.5" />
          ))}
        </g>
      ) : null}
      {p.accessory === 'cap' ? <path d="M19 22c0-7 6-11 13-11s13 4 13 11z" fill="#2a9d8f" /> : null}
      {p.accessory === 'glasses' ? (
        <g stroke="#1d2125" strokeWidth="1.3" fill="none">
          <circle cx="27.5" cy="27" r="3.6" />
          <circle cx="36.5" cy="27" r="3.6" />
          <path d="M31 27h2" />
        </g>
      ) : null}
      {p.accessory === 'mirror' ? (
        <>
          <path d="M20 19c4-4 20-4 24 0" stroke="#4b5563" strokeWidth="1.5" fill="none" />
          <circle cx="32" cy="17" r="3" fill="#d1d5db" stroke="#6b7280" />
        </>
      ) : null}
      {p.accessory === 'stethoscope' ? (
        <g stroke="#374151" strokeWidth="1.6" fill="none">
          <path d="M25 46c0 8 14 8 14 0" />
          <circle cx="32" cy="55" r="2.2" fill="#9ca3af" />
          <path d="M32 52v1" />
        </g>
      ) : null}
    </svg>
  );
}
