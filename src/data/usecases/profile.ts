// Perfiles locales del alumno. Crear un perfil guarda el usuario y la aceptación del aviso de
// privacidad. Un solo aviso explica todas las finalidades (D-059), pero las opcionales empiezan
// apagadas y el alumno las prende cuando quiera en Configuración, Privacidad (4.27 del plan del
// cambio, D-119). Cada una se registra bajo la versión del aviso que aceptó, así queda constancia de
// qué texto vio. Sin contraseña; con la nube, la cuenta real usa la misma interfaz.
import { PRIVACY_NOTICE_VERSION } from '@/config/legal';
import type { DataApi } from '../context';
import { createEvent } from '../events/createEvent';
import { newId } from '../ids';
import type { ConsentPurposeSchema } from '../schemas/common';
import { DEFAULT_TIME_ZONE } from '../schemas/common';
import {
  ConsentSchema,
  type Consent,
  UserSchema,
  UserSettingsSchema,
  type User,
  type UserSettings,
} from '../schemas/people';
import type { z } from 'zod';

type ConsentPurpose = z.infer<typeof ConsentPurposeSchema>;

export { PRIVACY_NOTICE_VERSION };

export interface NewProfile {
  alias: string;
  dailyGoal: UserSettings['dailyGoal'];
}

const PURPOSES: ConsentPurpose[] = ['party', 'ai_analysis', 'anonymized_improvement'];

/**
 * Estado inicial de cada finalidad opcional. Apagada, porque usar los datos para algo opcional pide
 * un permiso aparte que empieza en no (4.27). Antes se daban todas al crear el perfil
 */
const INITIAL_CONSENT_STATUS = 'revoked' as const;

export async function createProfile(
  api: Pick<DataApi, 'repos' | 'recordEvent'>,
  input: NewProfile,
): Promise<User> {
  const now = new Date().toISOString();
  const user = UserSchema.parse({
    id: newId(),
    alias: input.alias,
    role: 'student',
    examDate: null,
    dailyMinutes: null,
    timeZone: DEFAULT_TIME_ZONE,
    settings: UserSettingsSchema.parse({ dailyGoal: input.dailyGoal }),
    createdAt: now,
  });
  await api.repos.users.put(user);
  for (const purpose of PURPOSES) {
    const status = INITIAL_CONSENT_STATUS;
    await api.repos.consents.put(
      ConsentSchema.parse({
        id: newId(),
        userId: user.id,
        purpose,
        noticeVersion: PRIVACY_NOTICE_VERSION,
        status,
        decidedAt: now,
      }),
    );
    await api.recordEvent(
      createEvent(
        'consent_changed',
        { purpose, status, noticeVersion: PRIVACY_NOTICE_VERSION },
        { userId: user.id, tz: user.timeZone },
      ),
    );
  }
  return user;
}

/** Guarda cambios del perfil y de sus ajustes, con un evento por ajuste que cambió */
export async function updateProfile(
  api: Pick<DataApi, 'repos' | 'recordEvent'>,
  user: User,
  patch: Partial<Pick<User, 'alias' | 'examDate' | 'dailyMinutes'>> & {
    settings?: Partial<UserSettings>;
  },
): Promise<User> {
  const settings = UserSettingsSchema.parse({ ...user.settings, ...patch.settings });
  const next = UserSchema.parse({ ...user, ...patch, settings });
  await api.repos.users.put(next);
  const changes: [string, unknown][] = [];
  for (const key of ['alias', 'examDate', 'dailyMinutes'] as const) {
    if (key in patch && patch[key] !== user[key]) changes.push([key, patch[key] ?? null]);
  }
  for (const [key, value] of Object.entries(patch.settings ?? {})) {
    if (JSON.stringify(value) !== JSON.stringify((user.settings as Record<string, unknown>)[key])) {
      changes.push([`settings.${key}`, value]);
    }
  }
  for (const [key, value] of changes) {
    await api.recordEvent(
      createEvent(
        'settings_changed',
        { key, value: value as never },
        { userId: user.id, tz: user.timeZone },
      ),
    );
  }
  return next;
}

/**
 * La versión más reciente del aviso de privacidad bajo la que este alumno decidió algo en este
 * dispositivo, o null si todavía no decidió nada. Es la que de verdad vio y aceptó, y no la que trae
 * la app ahora, que puede ser más nueva (D-104)
 */
export async function acceptedNoticeVersion(
  api: Pick<DataApi, 'repos'>,
  userId: string,
): Promise<string | null> {
  const versions = (await api.repos.consents.list())
    .filter((consent) => consent.userId === userId)
    .map((consent) => consent.noticeVersion)
    .sort();
  return versions.at(-1) ?? null;
}

/** Si el alumno decidió bajo una versión del aviso anterior a la que trae la app ahora */
export async function noticeNeedsAcceptance(
  api: Pick<DataApi, 'repos'>,
  userId: string,
): Promise<boolean> {
  const accepted = await acceptedNoticeVersion(api, userId);
  // Sin ninguna decisión todavía, el aviso se acepta al crear el perfil, no aquí
  return accepted !== null && accepted < PRIVACY_NOTICE_VERSION;
}

/**
 * Acepta la versión actual del aviso. Vuelve a registrar la decisión de cada finalidad tal como está,
 * ahora bajo la versión nueva, así queda constancia de bajo qué texto se tomó. No cambia ninguna
 * decisión. Una finalidad sin decisión previa queda como retirada
 */
export async function acceptCurrentNotice(
  api: Pick<DataApi, 'repos' | 'recordEvent'>,
  user: User,
): Promise<void> {
  const current = await currentConsents(api, user.id);
  for (const purpose of Object.keys(current) as ConsentPurpose[]) {
    await setConsent(api, user, purpose, current[purpose]);
  }
}

/** Estado actual de cada finalidad, con la decisión más reciente */
export async function currentConsents(
  api: Pick<DataApi, 'repos'>,
  userId: string,
): Promise<Record<ConsentPurpose, boolean>> {
  const list = (await api.repos.consents.list())
    .filter((consent) => consent.userId === userId)
    .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt));
  const result: Record<ConsentPurpose, boolean> = {
    party: false,
    ai_analysis: false,
    anonymized_improvement: false,
  };
  for (const consent of list) result[consent.purpose] = consent.status === 'granted';
  return result;
}

/** Da o retira el consentimiento de una finalidad, con su evento (4.5) */
export async function setConsent(
  api: Pick<DataApi, 'repos' | 'recordEvent'>,
  user: User,
  purpose: ConsentPurpose,
  granted: boolean,
): Promise<Consent> {
  const status = granted ? 'granted' : 'revoked';
  const consent = ConsentSchema.parse({
    id: newId(),
    userId: user.id,
    purpose,
    noticeVersion: PRIVACY_NOTICE_VERSION,
    status,
    decidedAt: new Date().toISOString(),
  });
  await api.repos.consents.put(consent);
  await api.recordEvent(
    createEvent(
      'consent_changed',
      { purpose, status, noticeVersion: PRIVACY_NOTICE_VERSION },
      { userId: user.id, tz: user.timeZone },
    ),
  );
  return consent;
}
