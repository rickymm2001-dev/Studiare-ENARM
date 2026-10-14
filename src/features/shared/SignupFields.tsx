// Campos del registro que comparten Crear cuenta y Completa tu registro (B9 del plan del cambio). La
// especialidad que busca, bien a la vista porque la usa la comparación por especialidad (B14), cómo
// nos conoció con su código de influencer (respuesta 22), los permisos opcionales, cada uno aparte y
// apagado (4.27), y la casilla de la edad mínima (pregunta 45).
import { HEARD_FROM_CHANNELS, MINIMUM_AGE, type HeardFromChannel } from '@/config/signup';
import { SPECIALTIES } from '@/config/specialties';
import type { ConsentPurposeSchema } from '@/data/schemas/common';
import { t } from '@/i18n/es-MX';
import { CheckboxField, SelectField, TextField } from '@/ui/components/field';
import type { z } from 'zod';
import { CONSENT_PURPOSES, heardFromOf, type HeardFromDraft } from './signupDraft';

type ConsentPurpose = z.infer<typeof ConsentPurposeSchema>;
const NONE = '';

/** Especialidad que busca, con su ayuda. La comparación por especialidad la usa (B14) */
export function TargetSpecialtyField({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  className?: string;
}) {
  return (
    <SelectField
      label={t.account.targetSpecialty}
      hint={t.accounts.signup.specialtyHint}
      className={className}
      value={value ?? NONE}
      options={[
        { value: NONE, label: t.account.preferNot },
        ...SPECIALTIES.map(([key, name]) => ({ value: key, label: name })),
      ]}
      onChange={(event) => {
        onChange(event.target.value || null);
      }}
    />
  );
}

/** Cómo nos conoció, opcional, con el código del influencer si lo trae */
export function HeardFromFields({
  value,
  onChange,
  showErrors,
}: {
  value: HeardFromDraft;
  onChange: (next: HeardFromDraft) => void;
  showErrors: boolean;
}) {
  const text = t.accounts.signup.heardFrom;
  const invalid = showErrors && heardFromOf(value) === 'invalid';
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField
        label={text.label}
        hint={text.hint}
        value={value.channel}
        options={[
          { value: NONE, label: text.none },
          ...HEARD_FROM_CHANNELS.map((channel) => ({
            value: channel,
            label: text.channels[channel],
          })),
        ]}
        onChange={(event) => {
          onChange({ ...value, channel: event.target.value as HeardFromChannel | '' });
        }}
      />
      <TextField
        label={text.code}
        hint={text.codeHint}
        value={value.code}
        maxLength={32}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        error={invalid ? text.codeError : null}
        onChange={(event) => {
          onChange({ ...value, code: event.target.value });
        }}
      />
    </div>
  );
}

/** Los permisos opcionales, cada uno por separado y apagado hasta que el alumno lo prenda (4.27) */
export function OptionalConsentsFields({
  value,
  onChange,
}: {
  value: Record<ConsentPurpose, boolean>;
  onChange: (next: Record<ConsentPurpose, boolean>) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="font-semibold">{t.accounts.signup.consentsTitle}</legend>
      <p className="text-sm text-fg-muted">{t.accounts.signup.consentsDescription}</p>
      {CONSENT_PURPOSES.map((purpose) => {
        const [label, hint] = t.onboarding.consents[purpose];
        return (
          <CheckboxField
            key={purpose}
            label={label}
            hint={hint}
            checked={value[purpose]}
            onChange={(event) => {
              onChange({ ...value, [purpose]: event.target.checked });
            }}
          />
        );
      })}
    </fieldset>
  );
}

/** La casilla de la edad mínima, obligatoria (pregunta 45) */
export function AdultConfirmField({
  checked,
  onChange,
  showError,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  showError: boolean;
}) {
  return (
    <>
      <CheckboxField
        label={t.accounts.signup.adultAccept(MINIMUM_AGE)}
        checked={checked}
        required
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      {showError && !checked ? (
        <p className="text-sm text-danger" role="alert">
          {t.accounts.signup.adultError(MINIMUM_AGE)}
        </p>
      ) : null}
    </>
  );
}
