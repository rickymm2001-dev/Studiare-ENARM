// Foto de perfil (D-068, B2 del plan del cambio, comentario 15). Iniciales o una foto propia que el
// alumno encuadra en un círculo antes de guardarla. Los avatares generados se quitaron. Una cuenta
// vieja con uno se trata como iniciales. El recortador se carga aparte, solo al elegir un archivo.
import { ImagePlus } from 'lucide-react';
import { lazy, Suspense, useRef, useState } from 'react';
import type { Account } from '@/data/schemas/people';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Avatar } from '@/ui/components/avatar';
import { Button } from '@/ui/components/button';

const AvatarCropper = lazy(() =>
  import('./AvatarCropper').then((module) => ({ default: module.AvatarCropper })),
);

type AvatarChoice = Account['avatar'];

export function AvatarPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: AvatarChoice;
  onChange: (next: AvatarChoice) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  // Archivo elegido y pendiente de encuadrar. El id cambia por archivo, para montar el recortador de nuevo
  const [pending, setPending] = useState<{ id: number; file: File } | null>(null);
  const [error, setError] = useState('');
  const hasPhoto = value.kind === 'photo';

  const option = (choice: AvatarChoice, label: string, selected: boolean) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={() => {
        onChange(choice);
      }}
      className={cn(
        'rounded-full p-0.5 ring-2 transition-colors',
        selected ? 'ring-primary' : 'ring-transparent hover:ring-line-strong',
      )}
    >
      <Avatar name={name} avatar={choice} className="size-12 text-base" />
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {option({ kind: 'initials' }, t.account.avatarInitials, !hasPhoto)}
        {hasPhoto ? option(value, t.account.avatarPhoto, true) : null}
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label={t.account.uploadPhoto}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            if (!file.type.startsWith('image/')) {
              setError(t.account.avatarOpenError);
              return;
            }
            setError('');
            setPending((current) => ({ id: (current?.id ?? 0) + 1, file }));
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            input.current?.click();
          }}
        >
          <ImagePlus aria-hidden />
          {hasPhoto ? t.account.avatarChangePhoto : t.account.uploadPhoto}
        </Button>
      </div>
      <p className="text-sm text-fg-muted">{t.account.avatarNote}</p>
      {pending ? (
        <Suspense fallback={<p className="text-sm text-fg-muted">{t.account.avatarLoading}</p>}>
          <AvatarCropper
            key={pending.id}
            file={pending.file}
            onConfirm={(dataUrl) => {
              onChange({ kind: 'photo', dataUrl });
              setPending(null);
            }}
            onCancel={() => {
              setPending(null);
            }}
          />
        </Suspense>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
