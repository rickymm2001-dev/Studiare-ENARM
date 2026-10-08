// Apariencia (D-060, D-061, D-065, D-078). Tema, fuente de lectura, tamaño del texto, fondo
// (incluido uno personalizado con color o foto), y animaciones, confeti y sonidos. Los cambios se
// ven al instante como vista previa y se quedan solo al guardar, con una sola barra de guardar que
// aparece al haber cambios. Al salir sin guardar vuelve lo guardado.
import { ImagePlus, Monitor, Moon, PartyPopper, Sun, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePreferences } from '@/app/preferences';
import { t } from '@/i18n/es-MX';
import {
  applyAppearance,
  BACKGROUND_CHOICES,
  FONT_CHOICES,
  FONT_FAMILIES,
  SIZE_CHOICES,
  type Appearance,
  type BackgroundChoice,
} from '@/ui/appearance';
import { compressImage, loadBackgroundImage, saveBackgroundImage } from '@/ui/backgroundImage';
import { celebrate } from '@/ui/celebrate';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { CheckboxField } from '@/ui/components/field';
import { RadioCards } from '@/ui/components/radio-cards';
import { SaveBar } from '@/ui/components/save-bar';
import { applyTheme, resolveTheme, useApplyTheme, type ThemePreference } from '@/ui/theme';

const SWATCH: Record<Exclude<BackgroundChoice, 'custom'>, string> = {
  plain: 'bg-canvas',
  glow: 'bg-[radial-gradient(circle_at_80%_0%,var(--color-primary-soft),transparent_70%),radial-gradient(circle_at_0%_30%,var(--color-accent-soft),transparent_70%)] bg-canvas',
  mesh: 'bg-[radial-gradient(circle_at_0%_0%,var(--color-ped-soft),transparent_65%),radial-gradient(circle_at_100%_0%,var(--color-gyo-soft),transparent_65%),radial-gradient(circle_at_50%_110%,var(--color-cir-soft),transparent_65%)] bg-canvas',
  dots: 'bg-canvas bg-[radial-gradient(var(--color-line)_1px,transparent_1px)] bg-[length:10px_10px]',
};

const THEME_OPTIONS = [
  { value: 'system', label: t.theme.system, icon: <Monitor /> },
  { value: 'light', label: t.theme.light, icon: <Sun /> },
  { value: 'dark', label: t.theme.dark, icon: <Moon /> },
] as const satisfies readonly { value: ThemePreference; label: string; icon: ReactNode }[];

const PRESET_COLORS = ['#0e5a6b', '#3a2a7a', '#b92b74', '#d94f2b', '#1f8a57', '#c27c0e', '#14202b'];

function ChoiceButton({
  selected,
  onClick,
  children,
  className,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex min-h-touch flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition-all',
        selected
          ? 'border-primary bg-primary-soft shadow-raised'
          : 'border-line bg-surface hover:border-line-strong',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function AppearanceSettings() {
  const saved = usePreferences((state) => state.appearance);
  const setAppearance = usePreferences((state) => state.setAppearance);
  const savedTheme = usePreferences((state) => state.theme);
  const setTheme = usePreferences((state) => state.setTheme);
  const [draft, setDraft] = useState<Appearance>(saved);
  const [theme, setThemeDraft] = useState<ThemePreference>(savedTheme);
  const [image, setImage] = useState<string | null>(() => loadBackgroundImage());
  const [status, setStatus] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const text = t.appearance;
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(saved) ||
    image !== loadBackgroundImage() ||
    theme !== savedTheme;

  // Vista previa del tema. Al salir sin guardar vuelve el tema guardado
  useApplyTheme(theme);
  useEffect(
    () => () => {
      const dark =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(document.documentElement, resolveTheme(usePreferences.getState().theme, dark));
    },
    [],
  );

  // Vista previa en vivo de lo que el alumno va eligiendo
  useEffect(() => {
    applyAppearance(document.documentElement, draft, image);
  }, [draft, image]);
  // Al salir de la pantalla vuelve lo guardado
  useEffect(
    () => () => {
      applyAppearance(
        document.documentElement,
        usePreferences.getState().appearance,
        loadBackgroundImage(),
      );
    },
    [],
  );

  const change = (patch: Partial<Appearance>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setStatus('');
  };

  const save = () => {
    if (!saveBackgroundImage(image)) {
      setStatus(text.imageTooBig);
      return;
    }
    setAppearance(draft);
    setTheme(theme);
    setStatus(text.saved);
  };

  const discard = () => {
    setDraft(saved);
    setImage(loadBackgroundImage());
    setThemeDraft(savedTheme);
    setStatus(text.discarded);
  };

  return (
    <Card aria-label={text.title}>
      <div className="flex flex-col gap-5">
        <RadioCards
          legend={t.theme.legend}
          value={theme}
          options={THEME_OPTIONS}
          layout="row"
          onValueChange={(value) => {
            setThemeDraft(value);
            setStatus('');
          }}
        />

        <fieldset>
          <legend className="eyebrow mb-2 text-fg-muted">{text.font}</legend>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {FONT_CHOICES.map((font) => (
              <ChoiceButton
                key={font}
                label={text.fonts[font][0]}
                selected={draft.font === font}
                onClick={() => {
                  change({ font });
                }}
              >
                <span
                  className="text-base leading-snug sm:text-xl"
                  style={{ fontFamily: FONT_FAMILIES[font] }}
                >
                  {text.sample}
                </span>
                <span className="text-sm font-semibold">{text.fonts[font][0]}</span>
                <span className="hidden text-xs text-fg-muted sm:block">{text.fonts[font][1]}</span>
              </ChoiceButton>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="eyebrow mb-2 text-fg-muted">{text.size}</legend>
          <div className="grid grid-cols-4 overflow-hidden rounded-lg border-2 border-line">
            {SIZE_CHOICES.map((size, index) => (
              <button
                key={size}
                type="button"
                aria-pressed={draft.size === size}
                onClick={() => {
                  change({ size });
                }}
                className={cn(
                  'flex min-h-touch flex-col items-center justify-center gap-0.5 border-line px-1 py-1.5 transition-colors not-first:border-l-2',
                  draft.size === size
                    ? 'bg-primary-soft text-primary'
                    : 'bg-surface hover:bg-muted',
                )}
              >
                <span
                  aria-hidden
                  style={{ fontSize: `${0.85 + index * 0.15}rem` }}
                  className="leading-none font-bold"
                >
                  Aa
                </span>
                <span className="text-xs">{text.sizes[size]}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="eyebrow mb-2 text-fg-muted">{text.background}</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {BACKGROUND_CHOICES.map((background) => (
              <ChoiceButton
                key={background}
                label={text.backgrounds[background]}
                selected={draft.background === background}
                onClick={() => {
                  change({ background });
                }}
              >
                <span
                  aria-hidden
                  className={cn(
                    'h-9 w-full rounded-md border border-line bg-cover bg-center sm:h-12',
                    background === 'custom' ? '' : SWATCH[background],
                  )}
                  style={
                    background === 'custom'
                      ? image
                        ? { backgroundImage: `url("${image}")` }
                        : { backgroundColor: draft.customColor }
                      : undefined
                  }
                />
                <span className="text-xs sm:text-sm">{text.backgrounds[background]}</span>
              </ChoiceButton>
            ))}
          </div>

          {draft.background === 'custom' ? (
            <div className="mt-3 flex flex-col gap-3 rounded-lg bg-muted p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{text.customColor}</span>
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={text.pickColor(color)}
                    aria-pressed={draft.customColor === color}
                    onClick={() => {
                      change({ customColor: color });
                    }}
                    className={cn(
                      'size-8 rounded-full border-2',
                      draft.customColor === color ? 'border-fg' : 'border-transparent',
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="color"
                    value={draft.customColor}
                    onChange={(event) => {
                      change({ customColor: event.target.value });
                    }}
                    className="size-8 cursor-pointer rounded-full border border-line bg-transparent"
                  />
                  {text.otherColor}
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label={text.uploadPhoto}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    void compressImage(file)
                      .then((dataUrl) => {
                        setImage(dataUrl);
                        setStatus('');
                      })
                      .catch(() => {
                        setStatus(text.imageError);
                      });
                  }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    fileInput.current?.click();
                  }}
                >
                  <ImagePlus aria-hidden />
                  {image ? text.changePhoto : text.uploadPhoto}
                </Button>
                {image ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setImage(null);
                    }}
                  >
                    <Trash2 aria-hidden />
                    {text.removePhoto}
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-fg-muted">{text.photoNote}</p>
            </div>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="eyebrow mb-1 text-fg-muted">{text.motion}</legend>
          <CheckboxField
            label={text.animations}
            hint={text.animationsHint}
            checked={draft.animations}
            onChange={(event) => {
              change({ animations: event.target.checked });
            }}
          />
          <CheckboxField
            label={text.confetti}
            checked={draft.confetti}
            disabled={!draft.animations}
            onChange={(event) => {
              change({ confetti: event.target.checked });
            }}
          />
          <CheckboxField
            label={text.sounds}
            checked={draft.sounds}
            onChange={(event) => {
              change({ sounds: event.target.checked });
            }}
          />
          <Button
            variant="gold"
            size="sm"
            className="mt-1 self-start"
            onClick={() => {
              celebrate('goal');
            }}
          >
            <PartyPopper aria-hidden />
            {text.tryIt}
          </Button>
        </fieldset>

        <SaveBar dirty={dirty} status={status} onSave={save} onDiscard={discard} />
      </div>
    </Card>
  );
}
