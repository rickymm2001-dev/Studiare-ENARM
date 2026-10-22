// Recordatorios de repaso por correo en la nube (B15, 3.2, 3.3 y 3.7). La app habla con tres funciones de la
// base que define 20261029000001_email_reminders.sql. my_reminder_prefs lee lo guardado, set_reminder_prefs lo
// guarda y put_due_snapshot sube la foto de conteos de tarjetas vencidas. Cada respuesta se valida con zod,
// porque el servidor es un tercero. Nada de aquí lleva un correo ni un texto del alumno: el correo lo
// resuelve el servidor al enviar. Ninguna llamada lanza, y una función que todavía no existe en el servidor,
// por una migración sin aplicar, se ve como que no hay recordatorios y la app sigue igual
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ENGAGEMENT_RPC,
  ReminderPrefsSchema,
  type DueSnapshot,
  type ReminderPrefs,
  type SetReminderPrefsArgs,
} from './engagementContracts';

type Rpc = Pick<SupabaseClient, 'rpc'>;

/** Qué salió mal al guardar, para que la sección diga la verdad sin repetir el código de la base */
export type SaveRemindersFailure = 'not_active_device' | 'invalid' | 'network' | 'unknown';

export type SaveRemindersResult =
  { ok: true; prefs: ReminderPrefs } | { ok: false; reason: SaveRemindersFailure };

/** Lo que el alumno decide. La hora, los días y la zona los valida el servidor */
export interface ReminderChoice {
  enabled: boolean;
  hour: number;
  days: readonly number[];
  onlyWhenDue: boolean;
  timeZone: string;
}

/** Lo que tiene guardado el alumno. null si no se pudo leer, por ejemplo con la migración sin aplicar */
export async function fetchReminderPrefs(cloud: Rpc): Promise<ReminderPrefs | null> {
  try {
    const reply = await cloud.rpc(ENGAGEMENT_RPC.reminderPrefs);
    if (reply.error) return null;
    const parsed = ReminderPrefsSchema.safeParse(reply.data);
    return parsed.success && parsed.data.available ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Los nombres de los parámetros son los de la base */
export function toArgs(choice: ReminderChoice): SetReminderPrefsArgs {
  return {
    p_enabled: choice.enabled,
    p_hour: choice.hour,
    p_days: [...new Set(choice.days)].sort((a, b) => a - b),
    p_only_when_due: choice.onlyWhenDue,
    p_time_zone: choice.timeZone,
  };
}

function failureOf(error: { code?: string | undefined }): SaveRemindersFailure {
  // 42501 es un dispositivo que no es el activo. 22023 es un valor que el servidor no acepta
  if (error.code === '42501') return 'not_active_device';
  if (error.code === '22023') return 'invalid';
  // Sin código es que la petición ni llegó al servidor
  return error.code ? 'unknown' : 'network';
}

/** Guarda los recordatorios. El servidor devuelve lo que quedó, con la ficha de baja nueva si los volvió a prender */
export async function saveReminderPrefs(
  cloud: Rpc,
  choice: ReminderChoice,
): Promise<SaveRemindersResult> {
  try {
    const reply = await cloud.rpc(ENGAGEMENT_RPC.setReminderPrefs, toArgs(choice));
    if (reply.error) return { ok: false, reason: failureOf(reply.error) };
    const parsed = ReminderPrefsSchema.safeParse(reply.data);
    return parsed.success ? { ok: true, prefs: parsed.data } : { ok: false, reason: 'unknown' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/**
 * Sube la foto de tarjetas vencidas. Solo fechas y números (3.3). Devuelve si el servidor la guardó. Si falla se
 * vuelve a intentar con la siguiente sincronización, así que no hay nada que contar al alumno
 */
export async function putDueSnapshot(cloud: Rpc, snapshot: DueSnapshot): Promise<boolean> {
  try {
    const reply = await cloud.rpc(ENGAGEMENT_RPC.putDueSnapshot, { p_snapshot: snapshot });
    return !reply.error;
  } catch {
    return false;
  }
}
