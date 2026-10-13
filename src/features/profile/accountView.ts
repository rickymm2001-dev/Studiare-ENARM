// Lo que se lee en Perfil en modo de solo lectura (B3 del plan del cambio, comentario 16). Cada dato
// de la cuenta con su texto, y la fecha del ENARM. Funciones puras para poder probarlas solas.
import { ENARM_EXAM } from '@/config/exam';
import { MEXICAN_STATES } from '@/config/mexico';
import { SPECIALTIES } from '@/config/specialties';
import type { Account, User } from '@/data/schemas/people';
import { EMPTY_DETAILS, type AccountDetails } from '@/data/usecases/account';
import { t } from '@/i18n/es-MX';

/** Los datos opcionales de una cuenta, o los vacíos si el perfil no tiene cuenta */
export function detailsOf(account: Account | null): AccountDetails {
  if (!account) return EMPTY_DETAILS;
  return {
    birthYear: account.birthYear,
    sex: account.sex,
    state: account.state,
    situation: account.situation,
    attempt: account.attempt,
    targetSpecialty: account.targetSpecialty,
    avatar: account.avatar,
  };
}

/** Si dos juegos de datos dicen lo mismo, foto incluida */
export const sameDetails = (a: AccountDetails, b: AccountDetails): boolean =>
  (Object.keys(EMPTY_DETAILS) as (keyof AccountDetails)[]).every(
    (key) => JSON.stringify(a[key]) === JSON.stringify(b[key]),
  );

const nameIn = (list: readonly (readonly [string, string])[], key: string | null) =>
  key === null ? null : (list.find(([value]) => value === key)?.[1] ?? null);

/** Las filas de datos de la cuenta, con su etiqueta y su valor ya en texto. null es sin dato */
export function accountRows(details: AccountDetails): { label: string; value: string | null }[] {
  const text = t.account;
  return [
    { label: text.sex, value: details.sex === null ? null : text.sexes[details.sex] },
    {
      label: text.birthYear,
      value: details.birthYear === null ? null : String(details.birthYear),
    },
    { label: text.state, value: nameIn(MEXICAN_STATES, details.state) },
    {
      label: text.situation,
      value: details.situation === null ? null : text.situations[details.situation],
    },
    {
      label: text.attempt,
      value: details.attempt === null ? null : text.attempts(details.attempt),
    },
    { label: text.targetSpecialty, value: nameIn(SPECIALTIES, details.targetSpecialty) },
  ];
}

/**
 * La fecha del ENARM en palabras. Es la de la plataforma (D-059), que sigue provisional hasta que la
 * CIFRHS publique la convocatoria. Solo el alumno de la demostración trae una propia
 */
export function examDateLabel(user: Pick<User, 'examDate'>): string {
  const date = user.examDate ?? ENARM_EXAM.date;
  const words = new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return t.settingsPage.profile.examDateValue(
    words,
    user.examDate === null && ENARM_EXAM.provisional,
  );
}
