// Apariencia (D-060, D-061, D-065, D-078). Tema, fuente de lectura, tamaño del texto, y animaciones,
// confeti y sonidos. Los cambios se ven al instante como vista previa y se quedan solo al guardar,
// con una sola barra de guardar que aparece al haber cambios. Al salir sin guardar vuelve lo guardado.
// Los fondos con degradados, color o foto se quitaron en B2 del plan del cambio (comentario 10).
import { Monitor, Moon, PartyPopper, Sun } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { usePreferences } from '@/app/preferences';
import { t } from '@/i18n/es-MX';
import {
  applyAppearance,
  FONT_CHOICES,
  FONT_FAMILIES,
  SIZE_CHOICES,
  type Appearance,
} from '@/ui/appearance';
import { celebrate } from '@/ui/celebrate';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { CheckboxField } from '@/ui/components/field';
import { RadioCards } from '@/ui/components/radio-cards';
import { SaveBar } from '@/ui/components/save-bar';
import { applyTheme, resolveTheme, useApplyTheme, type ThemePreference } from '@/ui/theme';

const THEME_OPTIONS = [
  { value: 'system', label: t.theme.system, icon: <Monitor /> },
  { value: 'light', label: t.theme.light, icon: <Sun /> },
  { value: 'dark', label: t.theme.dark, icon: <Moon /> },
] as const satisfies readonly { value: ThemePreference; label: string; icon: ReactNode }[];

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
        'flex min-h-touch flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors',
        selected
          ? 'border-indicator bg-primary-soft ring-1 ring-indicator'
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
  const [status, setStatus] = useState('');
  const text = t.appearance;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved) || theme !== savedTheme;

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
    applyAppearance(document.documentElement, draft);
  }, [draft]);
  // Al salir de la pantalla vuelve lo guardado
  useEffect(
    () => () => {
      applyAppearance(document.documentElement, usePreferences.getState().appearance);
    },
    [],
  );

  const change = (patch: Partial<Appearance>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setStatus('');
  };

  const save = () => {
    setAppearance(draft);
    setTheme(theme);
    setStatus(text.saved);
  };

  const discard = () => {
    setDraft(saved);
    setThemeDraft(savedTheme);
    setStatus(text.discarded);
  };

  return (
    <Card>
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
          <legend className="eyebrow mb-2">{text.font}</legend>
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
          <legend className="eyebrow mb-2">{text.size}</legend>
          <div className="grid grid-cols-4 overflow-hidden rounded-md border border-line">
            {SIZE_CHOICES.map((size, index) => (
              <button
                key={size}
                type="button"
                aria-pressed={draft.size === size}
                onClick={() => {
                  change({ size });
                }}
                className={cn(
                  'flex min-h-touch flex-col items-center justify-center gap-0.5 border-line px-1 py-1.5 transition-colors not-first:border-l',
                  // El borde interior del indicador marca la elegida, como en el control segmentado
                  draft.size === size
                    ? 'bg-primary-soft text-primary-ink ring-2 ring-indicator ring-inset'
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

        <fieldset className="flex flex-col gap-2">
          <legend className="eyebrow mb-1">{text.motion}</legend>
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
            variant="secondary"
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
