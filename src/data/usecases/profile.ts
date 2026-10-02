// Perfiles locales del alumno. Crear un perfil guarda el usuario y la aceptación del aviso de
// privacidad. Un solo aviso cubre todas las finalidades, por decisión de Ricardo (D-059), y se
// guarda como aceptación de cada finalidad con la versión del aviso. Sin contraseña, porque el inicio de sesión del prototipo es
// simulado (3.2). En producción lo reemplaza la cuenta real con la misma interfaz.
import type { DataApi } from '../context';
import { createEvent } from '../events/createEvent';
import { newId } from '../ids';
import type { ConsentPurposeSchema } from '../schemas/common';
import { DEFAULT_TIME_ZONE } from '../schemas/common';
import {
  ConsentSchema,
  UserSchema,
  UserSettingsSchema,
  type User,
  type UserSettings,
} from '../schemas/people';
import type { z } from 'zod';

type ConsentPurpose = z.infer<typeof ConsentPurposeSchema>;

/** Versión del aviso de privacidad simulado que acepta el alumno */
export const PRIVACY_NOTICE_VERSION = '2026-10-01';

export interface NewProfile {
  alias: string;
  dailyGoal: UserSettings['dailyGoal'];
}

const PURPOSES: ConsentPurpose[] = ['party', 'ai_analysis', 'anonymized_improvement'];

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
    const status = 'granted';
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
): Promise<void> {
  const status = granted ? 'granted' : 'revoked';
  await api.repos.consents.put(
    ConsentSchema.parse({
      id: newId(),
      userId: user.id,
      purpose,
      noticeVersion: PRIVACY_NOTICE_VERSION,
      status,
      decidedAt: new Date().toISOString(),
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
