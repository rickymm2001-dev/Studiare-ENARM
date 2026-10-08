// Campos de Configuración para la carga diaria (D-085). El temporizador de tarjeta y los días fáciles
// viven aquí para que el formulario de Estudio no crezca más. Reciben su valor y avisan cada cambio,
// el guardado lo hace el formulario.
import { EASY_DAY_LEVELS, WEEKDAY_KEYS, type WeekdayKey } from '@/engines/easyDays';
import type { UserSettings } from '@/data/schemas/people';
import { t } from '@/i18n/es-MX';
import { CheckboxField, SelectField } from '@/ui/components/field';

const TIMER_SECONDS = [10, 15, 20, 30, 45, 60, 90, 120];

export type CardTimerValue = UserSettings['cardTimer'];
export type EasyDaysValue = UserSettings['easyDays'];

export function CardTimerFields({
  value,
  onChange,
}: {
  value: CardTimerValue;
  onChange: (next: CardTimerValue) => void;
}) {
  const text = t.settings;
  // Si el valor guardado no está en la lista, igual se muestra y se conserva
  const options = TIMER_SECONDS.includes(value.seconds)
    ? TIMER_SECONDS
    : [...TIMER_SECONDS, value.seconds].sort((a, b) => a - b);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-semibold">{text.cardTimerTitle}</legend>
      <CheckboxField
        label={text.cardTimerEnabled}
        hint={text.cardTimerHint}
        checked={value.enabled}
        onChange={(event) => {
          onChange({ ...value, enabled: event.target.checked });
        }}
      />
      {value.enabled ? (
        <>
          <SelectField
            className="max-w-56"
            label={text.cardTimerSeconds}
            value={String(value.seconds)}
            options={options.map((seconds) => ({
              value: String(seconds),
              label: text.cardTimerSecondsOption(seconds),
            }))}
            onChange={(event) => {
              onChange({ ...value, seconds: Number(event.target.value) });
            }}
          />
          <CheckboxField
            label={text.cardTimerAutoReveal}
            checked={value.autoReveal}
            onChange={(event) => {
              onChange({ ...value, autoReveal: event.target.checked });
            }}
          />
        </>
      ) : null}
    </fieldset>
  );
}

export function EasyDaysFields({
  value,
  onChange,
}: {
  value: EasyDaysValue;
  onChange: (next: EasyDaysValue) => void;
}) {
  const text = t.settings;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">{text.easyDaysTitle}</legend>
      <p className="text-sm text-fg-muted">{text.easyDaysHint}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {WEEKDAY_KEYS.map((day: WeekdayKey) => (
          <SelectField
            key={day}
            label={text.weekdays[day]}
            value={value[day]}
            options={EASY_DAY_LEVELS.map((level) => ({
              value: level,
              label: text.easyLevels[level],
            }))}
            onChange={(event) => {
              onChange({ ...value, [day]: event.target.value as EasyDaysValue[WeekdayKey] });
            }}
          />
        ))}
      </div>
    </fieldset>
  );
}
