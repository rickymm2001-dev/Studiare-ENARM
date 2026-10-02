// Datos opcionales de la cuenta (D-068). Se usan al registrarse y en Perfil.
import type { AccountDetails } from '@/data/usecases/account';
import { MEXICAN_STATES } from '@/config/mexico';
import { SPECIALTIES } from '@/config/specialties';
import { t } from '@/i18n/es-MX';
import { SelectField } from '@/ui/components/field';

const YEARS = Array.from({ length: 2004 - 1960 + 1 }, (_, index) => 2004 - index);
const NONE = '';

export function AccountDetailsFields({
  value,
  onChange,
}: {
  value: AccountDetails;
  onChange: (next: AccountDetails) => void;
}) {
  const text = t.account;
  const set = (patch: Partial<AccountDetails>) => {
    onChange({ ...value, ...patch });
  };
  const optional = (options: { value: string; label: string }[]) => [
    { value: NONE, label: text.preferNot },
    ...options,
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField
        label={text.birthYear}
        value={value.birthYear === null ? NONE : String(value.birthYear)}
        options={optional(YEARS.map((year) => ({ value: String(year), label: String(year) })))}
        onChange={(event) => {
          set({ birthYear: event.target.value ? Number(event.target.value) : null });
        }}
      />
      <SelectField
        label={text.sex}
        value={value.sex ?? NONE}
        options={optional(
          (['female', 'male', 'other', 'undisclosed'] as const).map((sex) => ({
            value: sex,
            label: text.sexes[sex],
          })),
        )}
        onChange={(event) => {
          set({ sex: (event.target.value || null) as AccountDetails['sex'] });
        }}
      />
      <SelectField
        label={text.state}
        value={value.state ?? NONE}
        options={optional(MEXICAN_STATES.map(([key, name]) => ({ value: key, label: name })))}
        onChange={(event) => {
          set({ state: event.target.value || null });
        }}
      />
      <SelectField
        label={text.situation}
        value={value.situation ?? NONE}
        options={optional(
          (['internship', 'social_service', 'graduated', 'working', 'other'] as const).map(
            (situation) => ({ value: situation, label: text.situations[situation] }),
          ),
        )}
        onChange={(event) => {
          set({ situation: (event.target.value || null) as AccountDetails['situation'] });
        }}
      />
      <SelectField
        label={text.attempt}
        value={value.attempt === null ? NONE : String(value.attempt)}
        options={optional(
          [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: text.attempts(n) })),
        )}
        onChange={(event) => {
          set({ attempt: event.target.value ? Number(event.target.value) : null });
        }}
      />
      <SelectField
        label={text.targetSpecialty}
        value={value.targetSpecialty ?? NONE}
        options={optional(SPECIALTIES.map(([key, name]) => ({ value: key, label: name })))}
        onChange={(event) => {
          set({ targetSpecialty: event.target.value || null });
        }}
      />
    </div>
  );
}
