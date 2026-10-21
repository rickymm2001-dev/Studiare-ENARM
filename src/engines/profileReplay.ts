/**
 * Rearmado del perfil desde la bitácora (B14, 2.2 del plan de B14, respuesta 93 y hallazgo H06).
 *
 * Qué hace. Con los eventos settings_changed, consent_changed y official_score_submitted de un alumno
 * dice cómo debe quedar su perfil en cualquier dispositivo, con sus ajustes, sus permisos y si su
 * puntaje oficial sigue vigente. Todos los dispositivos de una cuenta terminan con la misma bitácora,
 * así que llegan al mismo resultado sin importar el orden en que sincronicen. Los ajustes no viajan en
 * sync_records. Viajan como los eventos que ya subían, sin un tipo nuevo.
 * Entradas. Los eventos del alumno, en cualquier orden y con repetidos, y lo que hay hoy en este
 * dispositivo (ajustes, fecha del ENARM, minutos al día, filas de permisos y la fecha de su puntaje).
 * Salidas. replayProfile dice qué afirma la bitácora, el último valor válido de cada clave con su
 * evento, una decisión por cada cambio de permiso y si el puntaje oficial sigue vigente. planProfile
 * compara eso con lo local y dice qué cambiar. planBaseline dice qué ajustes de este dispositivo nacieron
 * sin evento.
 * Método
 *   - Por cada clave gana el evento con at más reciente y, si empatan, el de id mayor. Un valor que no
 *     cumple el campo de su esquema se ignora y gana el anterior que sí lo cumple
 *   - Viajan todas las claves de UserSettingsSchema (settings.x), examDate y dailyMinutes. El alias no,
 *     porque ya viaja con la cuenta de la nube, y una clave que esta versión no conoce se ignora
 *   - Permisos. Una decisión por evento, con el id del evento. currentConsents no cambia. Una fila local
 *     de antes, con otro id, que ya cuenta la misma decisión no se duplica
 *   - Puntaje oficial. El número no entra a la bitácora (D-101) y no viaja. Aquí solo se decide si el
 *     que sigue vigente es posterior al último retiro del permiso de mejora, que es lo que lo borra
 *     donde esté guardado
 * Umbrales. Una fila local cuenta la misma decisión si la hora difiere 5 segundos o menos (J).
 */
import type { z } from 'zod';
import { CalendarDateSchema, type ConsentPurposeSchema, type Id } from '@/data/schemas/common';
import type { AppEvent, EventType } from '@/data/schemas/events';
import { UserSchema, UserSettingsSchema, type UserSettings } from '@/data/schemas/people';
import { canonical } from './sync';

type ConsentPurpose = z.infer<typeof ConsentPurposeSchema>;
type ConsentStatus = 'granted' | 'revoked';

/** Los tipos de evento que rearman el perfil. El reconciliador solo pide estos a la bitácora */
export const PROFILE_EVENT_TYPES = [
  'settings_changed',
  'consent_changed',
  'official_score_submitted',
] as const satisfies readonly EventType[];
export type ProfileEventType = (typeof PROFILE_EVENT_TYPES)[number];

export function isProfileEventType(type: string): type is ProfileEventType {
  return (PROFILE_EVENT_TYPES as readonly string[]).includes(type);
}

/** Cuánto pueden diferir la hora de una fila local y la de su evento para ser la misma decisión (J) */
export const CONSENT_MATCH_WINDOW_MS = 5000;

// ---------------------------------------------------------------------------------------------
// Claves que viajan

/** El campo de esquema de cada clave de settings_changed que viaja entre dispositivos */
const FIELD_SCHEMAS: Readonly<Record<string, z.ZodType>> = {
  examDate: CalendarDateSchema.nullable(),
  dailyMinutes: UserSchema.shape.dailyMinutes,
  ...Object.fromEntries(
    Object.entries(UserSettingsSchema.shape).map(([name, schema]) => [`settings.${name}`, schema]),
  ),
};

export const SYNCED_SETTING_KEYS: readonly string[] = Object.keys(FIELD_SCHEMAS);

export function isSyncedSettingKey(key: string): boolean {
  return Object.hasOwn(FIELD_SCHEMAS, key);
}

/** Los ajustes de fábrica, para saber cuáles nacieron distintos */
const FACTORY_SETTINGS: UserSettings = UserSettingsSchema.parse({});

// ---------------------------------------------------------------------------------------------
// Lo que dice la bitácora

export interface SettingWinner {
  key: string;
  /** Ya validado con el campo de su esquema */
  value: unknown;
  eventId: Id;
  at: string;
}

/** Un cambio de permiso tal como lo cuenta un evento */
export interface ConsentDecision {
  /** El id del evento, que es también el id de la fila de consents */
  id: Id;
  purpose: ConsentPurpose;
  status: ConsentStatus;
  noticeVersion: string;
  /** La hora del evento */
  decidedAt: string;
}

export interface ProfileReplay {
  /** El valor vigente de cada clave que tiene algún valor válido */
  settings: Readonly<Record<string, SettingWinner>>;
  /** Claves con algún settings_changed, sea válido su valor o no */
  keysWithEvents: readonly string[];
  /** Una decisión por evento, de la más antigua a la más reciente */
  decisions: readonly ConsentDecision[];
  /** Cada permiso según su última decisión. Sin decisión, apagado */
  current: Readonly<Record<ConsentPurpose, boolean>>;
  /** Cuándo se retiró por última vez el permiso de mejora anónima. null si nunca */
  lastScoreRevocationAt: string | null;
  /** La captura de puntaje posterior al último retiro. Solo su año, el puntaje no viaja */
  officialScore: { year: number; eventId: Id; at: string } | null;
}

interface Stamped {
  id: string;
  at: string;
}

/** Orden total y estable. Primero la hora y, si empatan, el id */
function compareStamps(a: Stamped, b: Stamped): number {
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export function replayProfile(events: readonly AppEvent[]): ProfileReplay {
  // El mismo evento puede llegar dos veces, por ejemplo uno propio que vuelve en la bajada
  const unique = [...new Map(events.map((event) => [event.id, event])).values()].sort(
    compareStamps,
  );

  // Ajustes. De la más reciente hacia atrás, el primer valor válido de cada clave
  const settings: Record<string, SettingWinner> = {};
  const withEvents = new Set<string>();
  for (const event of [...unique].reverse()) {
    if (event.type !== 'settings_changed') continue;
    const { key, value } = event.payload;
    const field = Object.hasOwn(FIELD_SCHEMAS, key) ? FIELD_SCHEMAS[key] : undefined;
    if (!field) continue;
    withEvents.add(key);
    if (Object.hasOwn(settings, key)) continue;
    const parsed = field.safeParse(value);
    if (parsed.success) {
      settings[key] = { key, value: parsed.data, eventId: event.id, at: event.at };
    }
  }

  // Permisos
  const decisions: ConsentDecision[] = [];
  const current: Record<ConsentPurpose, boolean> = {
    party: false,
    ai_analysis: false,
    anonymized_improvement: false,
  };
  let lastScoreRevocationAt: string | null = null;
  for (const event of unique) {
    if (event.type !== 'consent_changed') continue;
    const { purpose, status, noticeVersion } = event.payload;
    decisions.push({ id: event.id, purpose, status, noticeVersion, decidedAt: event.at });
    current[purpose] = status === 'granted';
    if (purpose === 'anonymized_improvement' && status === 'revoked') {
      lastScoreRevocationAt = event.at;
    }
  }

  // Puntaje oficial. Vale la última captura posterior al último retiro del permiso de mejora
  let officialScore: ProfileReplay['officialScore'] = null;
  for (const event of unique) {
    if (event.type !== 'official_score_submitted') continue;
    if (lastScoreRevocationAt !== null && event.at <= lastScoreRevocationAt) continue;
    officialScore = { year: event.payload.year, eventId: event.id, at: event.at };
  }

  return {
    settings,
    keysWithEvents: [...withEvents].sort(),
    decisions,
    current,
    lastScoreRevocationAt,
    officialScore,
  };
}

// ---------------------------------------------------------------------------------------------
// Lo local

/** Lo del perfil que viaja como ajuste. El mismo cuerpo de User, sin lo demás */
export interface SettingsSide {
  settings: UserSettings;
  examDate: string | null;
  dailyMinutes: number | null;
}

/** El valor que tiene hoy este dispositivo para una clave de settings_changed */
export function localValueOf(side: SettingsSide, key: string): unknown {
  if (key === 'examDate') return side.examDate;
  if (key === 'dailyMinutes') return side.dailyMinutes;
  if (key.startsWith('settings.')) {
    return (side.settings as Record<string, unknown>)[key.slice('settings.'.length)];
  }
  return undefined;
}

/** Pone los valores en su lugar. Un conjunto de ajustes que ya no cumple el esquema no se aplica */
export function applySettingValues(
  side: SettingsSide,
  values: readonly { key: string; value: unknown }[],
): SettingsSide {
  let examDate = side.examDate;
  let dailyMinutes = side.dailyMinutes;
  const patch: Record<string, unknown> = {};
  for (const { key, value } of values) {
    if (key === 'examDate') examDate = value as string | null;
    else if (key === 'dailyMinutes') dailyMinutes = value as number | null;
    else if (key.startsWith('settings.')) patch[key.slice('settings.'.length)] = value;
  }
  const merged = UserSettingsSchema.safeParse({ ...side.settings, ...patch });
  return {
    settings: merged.success ? merged.data : side.settings,
    examDate,
    dailyMinutes,
  };
}

export interface ConsentRow {
  id: string;
  purpose: ConsentPurpose;
  status: ConsentStatus;
  noticeVersion: string;
  decidedAt: string;
}

export interface LocalProfile extends SettingsSide {
  consents: readonly ConsentRow[];
  /** Cuándo se capturó el puntaje oficial que hay aquí. null si no hay */
  officialScoreSubmittedAt: string | null;
}

export interface SettingChange {
  key: string;
  /** Lo que había aquí cuando se planeó el cambio */
  from: unknown;
  to: unknown;
}

export interface ProfilePlan {
  settingChanges: SettingChange[];
  /** Filas de consents por agregar, con el id de su evento */
  consentRows: ConsentDecision[];
  /** El puntaje oficial de este dispositivo es anterior al último retiro del permiso */
  removeOfficialScore: boolean;
}

/** Si dos valores de ajustes son iguales, sin que importe el orden de las llaves de un objeto */
export const sameSettingValue = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/**
 * Qué cambiar en este dispositivo para que quede como dice la bitácora. No toca lo que ya coincide. Lo
 * que no tiene ningún evento se queda como está, porque la bitácora no dice nada de eso
 */
export function planProfile(replay: ProfileReplay, local: LocalProfile): ProfilePlan {
  const settingChanges: SettingChange[] = [];
  for (const winner of Object.values(replay.settings)) {
    const from = localValueOf(local, winner.key);
    if (!sameSettingValue(from, winner.value)) {
      settingChanges.push({ key: winner.key, from, to: winner.value });
    }
  }
  settingChanges.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // Las filas de antes del evento, con otro id, que ya cuentan la misma decisión se reconocen una vez
  const known = new Set(local.consents.map((row) => row.id));
  const eventIds = new Set(replay.decisions.map((decision) => decision.id));
  const unclaimed = local.consents.filter((row) => !eventIds.has(row.id));
  const consentRows: ConsentDecision[] = [];
  for (const decision of replay.decisions) {
    if (known.has(decision.id)) continue;
    const time = Date.parse(decision.decidedAt);
    let best = -1;
    let bestGap = Number.POSITIVE_INFINITY;
    unclaimed.forEach((row, index) => {
      if (
        row.purpose !== decision.purpose ||
        row.status !== decision.status ||
        row.noticeVersion !== decision.noticeVersion
      ) {
        return;
      }
      const gap = Math.abs(Date.parse(row.decidedAt) - time);
      if (gap <= CONSENT_MATCH_WINDOW_MS && gap < bestGap) {
        best = index;
        bestGap = gap;
      }
    });
    if (best >= 0) unclaimed.splice(best, 1);
    else consentRows.push(decision);
  }

  const removeOfficialScore =
    local.officialScoreSubmittedAt !== null &&
    replay.lastScoreRevocationAt !== null &&
    replay.lastScoreRevocationAt >= local.officialScoreSubmittedAt;

  return { settingChanges, consentRows, removeOfficialScore };
}

/**
 * Los ajustes de este dispositivo que nacieron distintos del de fábrica y no tienen ningún evento, uno
 * por clave (2.3 del plan). Se registran una vez, después de bajar toda la bitácora, así nunca pisan un
 * cambio que otro dispositivo ya registró
 */
export function planBaseline(
  replay: ProfileReplay,
  local: SettingsSide,
): { key: string; value: unknown }[] {
  const factory: SettingsSide = { settings: FACTORY_SETTINGS, examDate: null, dailyMinutes: null };
  const have = new Set(replay.keysWithEvents);
  const created: { key: string; value: unknown }[] = [];
  for (const key of SYNCED_SETTING_KEYS) {
    if (have.has(key)) continue;
    const value = localValueOf(local, key);
    if (value !== undefined && !sameSettingValue(value, localValueOf(factory, key))) {
      created.push({ key, value });
    }
  }
  return created;
}
