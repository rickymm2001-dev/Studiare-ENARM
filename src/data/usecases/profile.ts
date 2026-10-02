// Perfiles locales del alumno. Crear un perfil guarda el usuario, sus consentimientos por finalidad
// y los eventos de consentimiento (4.5). Sin contraseña, porque el inicio de sesión del prototipo es
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
  examDate: string | null;
  dailyMinutes: number | null;
  branches: string[];
  dailyGoal: UserSettings['dailyGoal'];
  consents: Record<ConsentPurpose, boolean>;
}

export async function createProfile(
  api: Pick<DataApi, 'repos' | 'recordEvent'>,
  input: NewProfile,
): Promise<User> {
  const now = new Date().toISOString();
  const user = UserSchema.parse({
    id: newId(),
    alias: input.alias,
    role: 'student',
    examDate: input.examDate,
    dailyMinutes: input.dailyMinutes,
    timeZone: DEFAULT_TIME_ZONE,
    settings: UserSettingsSchema.parse({ branches: input.branches, dailyGoal: input.dailyGoal }),
    createdAt: now,
  });
  await api.repos.users.put(user);
  for (const [purpose, granted] of Object.entries(input.consents) as [ConsentPurpose, boolean][]) {
    const status = granted ? 'granted' : 'revoked';
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
