// Apariencia (D-060, D-061, D-065, D-078, D-150). Tema, fuente de lectura, tamaño del texto, y
// animaciones, confeti y sonidos. Los cambios se ven al instante como vista previa y se quedan solo al
// guardar, con una sola barra de guardar que aparece al haber cambios. Al salir sin guardar vuelve lo
// guardado. Los fondos con degradados, color o foto se quitaron en B2 del plan del cambio (comentario
// 10). El modo enfoque (respuesta 82, B7) también vive aquí y se aplica al guardar. Desde D-150 los
// interruptores son píldoras marinas cuando están prendidos y el tema y el tamaño del texto van como
// segmentados en píldora, como en el diseño de Configuración. Al salir de la pantalla con cambios sin
// guardar avisa igual que Editar perfil, con el mismo bloqueador del router, que solo se monta mientras
// hay cambios porque el router admite un solo bloqueador a la vez.
import { Monitor, Moon, PartyPopper, Sun } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
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
import { SegmentedControl } from '@/ui/components/segmented';
import { SaveBar } from '@/ui/components/save-bar';
import { applyTheme, resolveTheme, useApplyTheme, type ThemePreference } from '@/ui/theme';
import { UnsavedChangesGuard } from '../shared/UnsavedChangesGuard';

const THEME_OPTIONS = [
  { value: 'system', label: t.theme.system, icon: <Monitor aria-hidden className="size-4" /> },
  { value: 'light', label: t.theme.light, icon: <Sun aria-hidden className="size-4" /> },
  { value: 'dark', label: t.theme.dark, icon: <Moon aria-hidden className="size-4" /> },
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
        // Tarjetas con esquinas grandes y borde de 2 px, en marino cuando están elegidas (D-150)
        'card-lift flex min-h-touch flex-col items-start gap-1 rounded-lg border-2 p-3 text-left',
        selected ? 'border-primary bg-surface' : 'border-line bg-surface',
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Interruptor en píldora, marino cuando está prendido y con la perilla blanca (D-150). Es un botón
 * con role switch, su etiqueta visible y su ayuda, como el CheckboxField que reemplaza
 */
function SwitchField({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  const hintId = hint ? `${id}-ayuda` : undefined;
  return (
    <div className="flex min-h-touch items-center justify-between gap-4">
      <span className={cn('flex min-w-0 flex-col gap-0.5', disabled && 'opacity-50')}>
        <span id={id} className="font-semibold text-fg">
          {label}
        </span>
        {hint ? (
          <span id={hintId} className="text-sm text-fg-muted">
            {hint}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        aria-describedby={hintId}
        disabled={disabled}
        onClick={() => {
          onChange(!checked);
        }}
        className={cn(
          'inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.75 transition-colors disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-line-strong',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'size-5.5 rounded-full bg-primary-fg shadow-card transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
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
    <Card lift={false}>
      <div className="flex flex-col gap-6">
        {/* El tema como segmentado en píldora. La app también tiene el modo claro a propósito, así que
            no cabe en un solo interruptor de modo oscuro */}
        <div className="flex flex-col gap-2">
          <p aria-hidden className="font-semibold text-fg">
            {t.theme.legend}
          </p>
          <SegmentedControl
            label={t.theme.legend}
            value={theme}
            options={THEME_OPTIONS.map((option) => ({
              value: option.value,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  {option.icon}
                  {option.label}
                </span>
              ),
            }))}
            onChange={(value) => {
              setThemeDraft(value);
              setStatus('');
            }}
          />
        </div>

        {/* min-w-0 porque un fieldset no se angosta por debajo de su contenido y con el texto Muy
            grande desbordaría la página en la computadora */}
        <fieldset className="min-w-0">
          <legend className="mb-2 font-semibold text-fg">{text.font}</legend>
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

        <div className="flex flex-col gap-2">
          <p aria-hidden className="font-semibold text-fg">
            {text.size}
          </p>
          <SegmentedControl
            label={text.size}
            value={draft.size}
            options={SIZE_CHOICES.map((size) => ({ value: size, label: text.sizes[size] }))}
            onChange={(size) => {
              change({ size });
            }}
          />
        </div>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1 font-semibold text-fg">{text.motion}</legend>
          <SwitchField
            label={text.animations}
            hint={text.animationsHint}
            checked={draft.animations}
            onChange={(animations) => {
              change({ animations });
            }}
          />
          <SwitchField
            label={text.confetti}
            checked={draft.confetti}
            disabled={!draft.animations}
            onChange={(confetti) => {
              change({ confetti });
            }}
          />
          <SwitchField
            label={text.sounds}
            checked={draft.sounds}
            onChange={(sounds) => {
              change({ sounds });
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

        {/* Modo enfoque (respuesta 82 del plan del cambio). Un interruptor que oculta tablas, XP,
            nivel, racha y retos en toda la app. Se guarda con la barra, como lo demás */}
        <SwitchField
          label={t.b7.focusMode.label}
          hint={t.b7.focusMode.hint}
          checked={draft.focusMode}
          onChange={(focusMode) => {
            change({ focusMode });
          }}
        />

        <SaveBar dirty={dirty} status={status} onSave={save} onDiscard={discard} />
        {dirty ? <UnsavedChangesGuard dirty text={text.leaveWarning} /> : null}
      </div>
    </Card>
  );
}
