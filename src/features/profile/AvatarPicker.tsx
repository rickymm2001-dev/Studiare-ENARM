// Foto de perfil (D-068). Iniciales, uno de los avatares médicos generados o una foto propia que se
// reduce a 256 px, se comprime en el navegador y se muestra recortada al centro.
import { ImagePlus } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Account } from '@/data/schemas/people';
import { t } from '@/i18n/es-MX';
import { AVATAR_GALLERY } from '@/ui/avatarArt';
import { compressImage } from '@/ui/backgroundImage';
import { cn } from '@/ui/cn';
import { Avatar } from '@/ui/components/avatar';
import { Button } from '@/ui/components/button';

type AvatarChoice = Account['avatar'];

export function AvatarPicker({
  name,
  seed,
  value,
  onChange,
}: {
  name: string;
  seed: string;
  value: AvatarChoice;
  onChange: (next: AvatarChoice) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const isSelected = (choice: AvatarChoice) => JSON.stringify(choice) === JSON.stringify(value);
  const option = (choice: AvatarChoice, label: string) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      aria-pressed={isSelected(choice)}
      onClick={() => {
        onChange(choice);
      }}
      className={cn(
        'rounded-full p-0.5 ring-2 transition-all',
        isSelected(choice) ? 'ring-primary' : 'ring-transparent hover:ring-line-strong',
      )}
    >
      <Avatar name={name} seed={seed} avatar={choice} className="size-12" />
    </button>
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {option({ kind: 'initials' }, t.account.avatarInitials)}
        {AVATAR_GALLERY.map((gallerySeed, index) =>
          option({ kind: 'generated', seed: gallerySeed }, t.account.avatarGenerated(index + 1)),
        )}
        {value.kind === 'photo' ? option(value, t.account.avatarPhoto) : null}
      </div>
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
          void compressImage(file, 256, 0.8)
            .then((dataUrl) => {
              setError('');
              onChange({ kind: 'photo', dataUrl });
            })
            .catch(() => {
              setError(t.appearance.imageError);
            });
        }}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => {
          input.current?.click();
        }}
      >
        <ImagePlus aria-hidden />
        {t.account.uploadPhoto}
      </Button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
