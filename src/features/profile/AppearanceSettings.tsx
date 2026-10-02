// Apariencia (D-060, D-061). Fuente de lectura con vista previa, tamaño del texto, fondo, y
// animaciones, confeti y sonidos por separado. Se guarda en este dispositivo y se aplica al instante.
import { Palette, PartyPopper } from 'lucide-react';
import { usePreferences } from '@/app/preferences';
import { t } from '@/i18n/es-MX';
import {
  BACKGROUND_CHOICES,
  FONT_CHOICES,
  FONT_FAMILIES,
  SIZE_CHOICES,
  type BackgroundChoice,
} from '@/ui/appearance';
import { celebrate } from '@/ui/celebrate';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField } from '@/ui/components/field';

const SWATCH: Record<BackgroundChoice, string> = {
  plain: 'bg-canvas',
  glow: 'bg-[radial-gradient(circle_at_80%_0%,var(--color-primary-soft),transparent_70%),radial-gradient(circle_at_0%_30%,var(--color-accent-soft),transparent_70%)] bg-canvas',
  mesh: 'bg-[radial-gradient(circle_at_0%_0%,var(--color-ped-soft),transparent_65%),radial-gradient(circle_at_100%_0%,var(--color-gyo-soft),transparent_65%),radial-gradient(circle_at_50%_110%,var(--color-cir-soft),transparent_65%)] bg-canvas',
  dots: 'bg-canvas bg-[radial-gradient(var(--color-line)_1px,transparent_1px)] bg-[length:10px_10px]',
};

function ChoiceButton({
  selected,
  onClick,
  children,
  className,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
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
  const appearance = usePreferences((state) => state.appearance);
  const setAppearance = usePreferences((state) => state.setAppearance);
  const text = t.appearance;
  return (
    <Card aria-labelledby="apariencia-titulo" className="lg:col-span-2">
      <CardHeader>
        <CardTitle id="apariencia-titulo" className="flex items-center gap-2">
          <Palette aria-hidden className="size-5 text-primary" />
          {text.title}
        </CardTitle>
        <CardDescription>{text.description}</CardDescription>
      </CardHeader>

      <div className="flex flex-col gap-5">
        <fieldset>
          <legend className="mb-2 font-semibold">{text.font}</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {FONT_CHOICES.map((font) => (
              <ChoiceButton
                key={font}
                label={text.fonts[font][0]}
                selected={appearance.font === font}
                onClick={() => {
                  setAppearance({ font });
                }}
              >
                <span className="text-xl" style={{ fontFamily: FONT_FAMILIES[font] }}>
                  {text.sample}
                </span>
                <span className="text-sm font-semibold">{text.fonts[font][0]}</span>
                <span className="text-xs text-fg-muted">{text.fonts[font][1]}</span>
              </ChoiceButton>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 font-semibold">{text.size}</legend>
          <div className="flex flex-wrap gap-2">
            {SIZE_CHOICES.map((size, index) => (
              <ChoiceButton
                key={size}
                label={text.sizes[size]}
                selected={appearance.size === size}
                className="min-w-20 items-center"
                onClick={() => {
                  setAppearance({ size });
                }}
              >
                <span
                  aria-hidden
                  style={{ fontSize: `${0.9 + index * 0.2}rem` }}
                  className="font-bold"
                >
                  Aa
                </span>
                <span className="text-xs">{text.sizes[size]}</span>
              </ChoiceButton>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 font-semibold">{text.background}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BACKGROUND_CHOICES.map((background) => (
              <ChoiceButton
                key={background}
                label={text.backgrounds[background]}
                selected={appearance.background === background}
                onClick={() => {
                  setAppearance({ background });
                }}
              >
                <span
                  aria-hidden
                  className={cn('h-12 w-full rounded-md border border-line', SWATCH[background])}
                />
                <span className="text-sm">{text.backgrounds[background]}</span>
              </ChoiceButton>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">{text.motion}</legend>
          <CheckboxField
            label={text.animations}
            hint={text.animationsHint}
            checked={appearance.animations}
            onChange={(event) => {
              setAppearance({ animations: event.target.checked });
            }}
          />
          <CheckboxField
            label={text.confetti}
            checked={appearance.confetti}
            disabled={!appearance.animations}
            onChange={(event) => {
              setAppearance({ confetti: event.target.checked });
            }}
          />
          <CheckboxField
            label={text.sounds}
            checked={appearance.sounds}
            onChange={(event) => {
              setAppearance({ sounds: event.target.checked });
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
      </div>
    </Card>
  );
}
