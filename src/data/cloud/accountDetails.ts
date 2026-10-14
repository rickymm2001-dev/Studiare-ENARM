// Datos opcionales de la cuenta entre dispositivos (hallazgo H29, B9 del plan del cambio). Año de
// nacimiento, sexo, estado, situación, intento y especialidad viajan juntos con la fecha en que el
// alumno los guardó en Tus datos (details_changed_at), igual que la foto con avatar_changed_at (B2).
// Gana la versión más reciente. Un dispositivo que nunca los guardó no tiene fecha y nunca manda
// vacíos, así que no puede borrar en la nube lo que el alumno guardó en otro dispositivo. Lo que llenó
// en el registro tampoco lleva fecha y entra campo por campo. Funciones puras, sin red.
import {
  ACCOUNT_DETAIL_KEYS,
  AccountSchema,
  type Account,
  type AccountDetailKey,
} from '../schemas/people';

export type DetailValues = Pick<Account, AccountDetailKey>;

/** Columna de private_accounts de cada dato */
export const DETAIL_COLUMNS = {
  birthYear: 'birth_year',
  sex: 'sex',
  state: 'state',
  situation: 'situation',
  attempt: 'attempt',
  targetSpecialty: 'target_specialty',
} as const satisfies Record<AccountDetailKey, string>;

/** Lo que se pide a private_accounts para decidir */
export const DETAIL_SELECT = [...Object.values(DETAIL_COLUMNS), 'details_changed_at'].join(', ');

/** Los datos de un lado y cuándo se guardaron. changedAt es null si no se sabe */
export interface DetailsSide {
  values: DetailValues;
  changedAt: string | null;
  /**
   * Solo del lado de este navegador. Los datos sin fecha vienen del registro y todavía no se juntan con
   * la nube, así que entran campo por campo aunque la nube tenga fecha
   */
  fromSignup?: boolean;
}

/** Lo que va a la fila. Solo columnas de datos y su fecha */
export type DetailColumns = Partial<Record<(typeof DETAIL_COLUMNS)[AccountDetailKey], unknown>> & {
  details_changed_at?: string | null;
};

export const EMPTY_DETAIL_VALUES: DetailValues = {
  birthYear: null,
  sex: null,
  state: null,
  situation: null,
  attempt: null,
  targetSpecialty: null,
};

export const detailValuesOf = (account: Account): DetailValues => ({
  birthYear: account.birthYear,
  sex: account.sex,
  state: account.state,
  situation: account.situation,
  attempt: account.attempt,
  targetSpecialty: account.targetSpecialty,
});

/** Fecha válida en el formato de la cuenta local, o null */
export function utcOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/**
 * Los datos que trae la fila, validados con el esquema de la cuenta. Un valor que no se reconoce cuenta
 * como sin dato, así nunca se copia algo raro a este navegador
 */
export function parseRemoteDetails(row: Record<string, unknown> | null): DetailsSide {
  const values = { ...EMPTY_DETAIL_VALUES } as Record<AccountDetailKey, unknown>;
  for (const key of ACCOUNT_DETAIL_KEYS) {
    const parsed = AccountSchema.shape[key].safeParse(row?.[DETAIL_COLUMNS[key]] ?? null);
    values[key] = parsed.success ? parsed.data : null;
  }
  return { values: values as DetailValues, changedAt: utcOrNull(row?.details_changed_at) };
}

/** Las columnas de la fila con los datos dados */
export function detailColumns(values: Partial<DetailValues>): DetailColumns {
  const columns: DetailColumns = {};
  for (const key of ACCOUNT_DETAIL_KEYS) {
    if (key in values) columns[DETAIL_COLUMNS[key]] = values[key] ?? null;
  }
  return columns;
}

export interface DetailsPlan {
  /** Columnas para la fila, o null para no tocar los datos de la nube */
  push: DetailColumns | null;
  /** Datos de la nube para este navegador y la fecha que se copia, o null para no tocarlos */
  pull: { values: Partial<DetailValues>; changedAt: string | null } | null;
}

const timeOf = (value: string | null): number | null => {
  if (value === null) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
};

const sameValues = (a: DetailValues, b: DetailValues) =>
  ACCOUNT_DETAIL_KEYS.every((key) => a[key] === b[key]);

/**
 * Qué hacer con los datos. Con fecha en los dos lados gana la más reciente, completa, incluso si el
 * alumno borró algo a propósito. Con la misma fecha y datos distintos manda este navegador, que es el
 * dispositivo activo. Una fecha conocida gana a una desconocida, salvo con lo que llenó en el registro.
 * Sin fecha en ningún lado, como en cuentas de antes de B9, y con lo del registro, se juntan campo por
 * campo. Lo que falta de un lado se llena con el otro y, si los dos tienen algo distinto, gana la nube
 * para que todos los dispositivos terminen igual. Al juntar, este navegador toma la fecha de la nube.
 * Nunca se manda un vacío sin fecha
 */
export function planDetailsSync(local: DetailsSide, remote: DetailsSide): DetailsPlan {
  const localTime = timeOf(local.changedAt);
  const remoteTime = timeOf(remote.changedAt);
  if (localTime !== null && (remoteTime === null || localTime > remoteTime)) {
    return {
      push: { ...detailColumns(local.values), details_changed_at: local.changedAt },
      pull: null,
    };
  }
  if (localTime === null && (local.fromSignup === true || remoteTime === null)) {
    return mergeFieldByField(local.values, remote);
  }
  if (remoteTime !== null && (localTime === null || remoteTime > localTime)) {
    return { push: null, pull: { values: { ...remote.values }, changedAt: remote.changedAt } };
  }
  // Misma fecha en los dos lados
  return sameValues(local.values, remote.values)
    ? { push: null, pull: null }
    : {
        push: { ...detailColumns(local.values), details_changed_at: local.changedAt },
        pull: null,
      };
}

/** Junta los datos campo por campo. Gana la nube en un choque y solo sube lo que la nube no tiene */
function mergeFieldByField(values: DetailValues, remote: DetailsSide): DetailsPlan {
  const push: Partial<DetailValues> = {};
  const pull: Partial<DetailValues> = {};
  for (const key of ACCOUNT_DETAIL_KEYS) {
    const mine = values[key];
    const theirs = remote.values[key];
    if (theirs !== null && theirs !== mine) Object.assign(pull, { [key]: theirs });
    else if (theirs === null && mine !== null) Object.assign(push, { [key]: mine });
  }
  const pulls = Object.keys(pull).length > 0;
  return {
    push: Object.keys(push).length > 0 ? detailColumns(push) : null,
    pull: pulls || remote.changedAt !== null ? { values: pull, changedAt: remote.changedAt } : null,
  };
}
