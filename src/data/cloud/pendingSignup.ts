// Registro pendiente con Google (B9 del plan del cambio, respuesta 26). Entrar con Google sale de la
// app y vuelve con la sesión, así que lo que el alumno llenó en Crear cuenta (alias, meta, datos,
// confirmación de edad, permisos y cómo nos conoció) espera aquí mientras tanto. Vive en sessionStorage,
// que sobrevive al viaje de ida y vuelta en la misma pestaña y se borra al cerrarla, y caduca en una
// hora. El puente de la nube lo usa al crear el perfil de una cuenta que entró con Google y lo borra.
import { z } from 'zod';
import { HEARD_FROM_CHANNELS, INFLUENCER_CODE } from '../../config/signup.ts';
import { ConsentPurposeSchema, UtcDateTimeSchema } from '../schemas/common.ts';
import { AccountSchema, UserSettingsSchema } from '../schemas/people.ts';

export const PENDING_SIGNUP_KEY = 'enarm.pending-signup.v1';
/** Después de esto se descarta. Ir a Google y volver toma segundos */
export const PENDING_SIGNUP_TTL_MS = 60 * 60 * 1000;

export const PendingSignupSchema = z.strictObject({
  alias: z.string().trim().min(1).max(40),
  dailyGoal: UserSettingsSchema.shape.dailyGoal.unwrap(),
  details: AccountSchema.pick({
    birthYear: true,
    sex: true,
    state: true,
    situation: true,
    attempt: true,
    targetSpecialty: true,
    avatar: true,
  }),
  adultConfirmedAt: UtcDateTimeSchema,
  heardFrom: z
    .strictObject({
      channel: z.enum(HEARD_FROM_CHANNELS),
      influencerCode: z.string().regex(INFLUENCER_CODE).nullable(),
    })
    .nullable(),
  consents: z.partialRecord(ConsentPurposeSchema, z.boolean()),
  savedAt: UtcDateTimeSchema,
});
export type PendingSignup = z.infer<typeof PendingSignupSchema>;

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    // El navegador puede negar el acceso, por ejemplo con el almacenamiento bloqueado
    return null;
  }
}

/** Guarda lo que llenó el alumno antes de ir a Google. false si el navegador no deja guardarlo */
export function savePendingSignup(value: Omit<PendingSignup, 'savedAt'>): boolean {
  try {
    const target = storage();
    if (!target) return false;
    const parsed = PendingSignupSchema.parse({ ...value, savedAt: new Date().toISOString() });
    target.setItem(PENDING_SIGNUP_KEY, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}

/** Quita el registro pendiente, por ejemplo cuando Google rechazó la entrada */
export function clearPendingSignup(): void {
  try {
    storage()?.removeItem(PENDING_SIGNUP_KEY);
  } catch {
    // Sin acceso no hay nada que quitar
  }
}

/** Lo guardado tal cual, o null si no hay o el navegador no deja leerlo */
function readRaw(): string | null {
  try {
    return storage()?.getItem(PENDING_SIGNUP_KEY) ?? null;
  } catch {
    return null;
  }
}

/**
 * Lee el registro pendiente sin borrarlo. null si no hay, si no se entiende o si ya caducó. El puente
 * de la nube lo lee así y lo borra ya unida la cuenta, porque Supabase avisa SIGNED_IN mientras corre
 * la primera revisión y las dos tienen que verlo, gane la que gane al crear el perfil. nowMs es la hora
 * de ahora, para las pruebas
 */
export function readPendingSignup(nowMs: number = Date.now()): PendingSignup | null {
  const raw = readRaw();
  if (!raw) return null;
  try {
    const parsed = PendingSignupSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const age = nowMs - Date.parse(parsed.data.savedAt);
    return age >= 0 && age <= PENDING_SIGNUP_TTL_MS ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Toma el registro pendiente y lo borra. null si no hay, si no se entiende o si ya caducó */
export function takePendingSignup(nowMs: number = Date.now()): PendingSignup | null {
  const pending = readPendingSignup(nowMs);
  clearPendingSignup();
  return pending;
}
