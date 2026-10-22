// Formas de lo que viaja entre la app, el servidor y los dobles de prueba en B15 (7.5 del plan de B15).
// Las fija el paso 0 y no cambian sin avisar a la sesión principal, porque las comparten el paquete A
// (migraciones y funciones), el B (la app y los recordatorios) y los dobles de Playwright. Solo tipos,
// esquemas y constantes, sin llamadas a la red. Las funciones de la base que las devuelven son las de
// 20261029000001_email_reminders.sql (recordatorios y foto de vencidas) y 20261029000002_product_analytics.sql
// (identidad y permiso de la analítica). Cada respuesta se valida con zod, porque el servidor es un
// tercero, y una de más campos se acepta (se quita lo que sobra).
//
// Nada de esto lleva un correo, un nombre ni un texto del alumno. El correo del destinatario lo resuelve el
// servidor al enviar, con la llave de servicio
import { z } from 'zod';
import {
  CalendarDateSchema,
  DEFAULT_TIME_ZONE,
  TimeZoneSchema,
  UtcDateTimeSchema,
} from '../schemas/common';

/** Los nombres de las funciones de la base que usa la app, definidas en las dos migraciones de arriba */
export const ENGAGEMENT_RPC = {
  reminderPrefs: 'my_reminder_prefs',
  setReminderPrefs: 'set_reminder_prefs',
  putDueSnapshot: 'put_due_snapshot',
  analyticsIdentity: 'analytics_identity',
  setAnalyticsConsent: 'set_analytics_consent',
} as const;

// ===================================================================== Recordatorios por correo

/** Cada cuánto llega el recordatorio. Sale de los días y no se guarda aparte */
export const REMINDER_FREQUENCIES = ['daily', 'weekdays', 'custom'] as const;
export type ReminderFrequency = (typeof REMINDER_FREQUENCIES)[number];

/** Las horas en punto que se pueden elegir. De las 5 a las 23 evitan el corte del día de estudio a las 4 */
export const REMINDER_HOURS = { min: 5, max: 23 } as const;
export const DEFAULT_REMINDER_HOUR = 20;

/** Los días de la semana como los cuenta el servidor, 0 es domingo y 6 es sábado */
export const ALL_WEEK_DAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];

const sameDays = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && b.every((day) => a.includes(day));

/** Diario si están los siete días, Lunes a viernes si son esos cinco y Días que elijas en otro caso */
export function frequencyOf(days: readonly number[]): ReminderFrequency {
  const unique = [...new Set(days)];
  if (sameDays(unique, ALL_WEEK_DAYS)) return 'daily';
  return sameDays(unique, WEEKDAYS) ? 'weekdays' : 'custom';
}

/** Los días de una frecuencia. Con Días que elijas son los que el alumno marcó, ordenados y sin repetir */
export function daysOfFrequency(
  frequency: ReminderFrequency,
  chosen: readonly number[] = [],
): number[] {
  if (frequency === 'daily') return [...ALL_WEEK_DAYS];
  if (frequency === 'weekdays') return [...WEEKDAYS];
  return [...new Set(chosen)].sort((a, b) => a - b);
}

/** my_reminder_prefs y set_reminder_prefs devuelven esta forma. available es false sin cuenta en la nube */
export const ReminderPrefsSchema = z.object({
  available: z.boolean(),
  enabled: z.boolean(),
  hour: z.int().min(REMINDER_HOURS.min).max(REMINDER_HOURS.max),
  days: z.array(z.int().min(0).max(6)).min(1).max(7),
  frequency: z.enum(REMINDER_FREQUENCIES),
  onlyWhenDue: z.boolean(),
  timeZone: TimeZoneSchema,
  /** El alumno se dio de baja desde el correo. Para volver a recibirlos tiene que prenderlos otra vez */
  unsubscribed: z.boolean(),
});
export type ReminderPrefs = z.infer<typeof ReminderPrefsSchema>;

/** Lo que muestra la sección sin cuenta en la nube. Nada se guarda ni se manda */
export const UNAVAILABLE_REMINDER_PREFS: ReminderPrefs = {
  available: false,
  enabled: false,
  hour: DEFAULT_REMINDER_HOUR,
  days: [...ALL_WEEK_DAYS],
  frequency: 'daily',
  onlyWhenDue: true,
  timeZone: DEFAULT_TIME_ZONE,
  unsubscribed: false,
};

/** Los argumentos de set_reminder_prefs, con los nombres de sus parámetros en la base */
export interface SetReminderPrefsArgs {
  p_enabled: boolean;
  p_hour: number;
  p_days: number[];
  p_only_when_due: boolean;
  p_time_zone: string;
}

// ===================================================================== Foto de tarjetas vencidas

/** Cuántos días trae la foto, hoy y los 13 siguientes */
export const DUE_SNAPSHOT_DAYS = 14;
/** Una foto de más días que estos ya no sirve y el correo va sin número */
export const DUE_SNAPSHOT_STALE_DAYS = 14;
export const DUE_SNAPSHOT_MAX_COUNT = 100_000;

/**
 * La foto de conteos que sube la app con put_due_snapshot (3.3). Solo fechas y números, nunca una tarjeta.
 * Las vencidas de cada día ya vienen acumuladas, con la misma regla que el contador de Repasar
 */
export const DueSnapshotSchema = z.strictObject({
  computedAt: UtcDateTimeSchema,
  timeZone: TimeZoneSchema,
  days: z
    .array(
      z.strictObject({ day: CalendarDateSchema, due: z.int().min(0).max(DUE_SNAPSHOT_MAX_COUNT) }),
    )
    .max(DUE_SNAPSHOT_DAYS),
  newAvailable: z.int().min(0).max(DUE_SNAPSHOT_MAX_COUNT),
});
export type DueSnapshot = z.infer<typeof DueSnapshotSchema>;

/**
 * El data de email_outbox para daily_review_reminder. due es null cuando no hay una foto reciente, y
 * entonces el correo no dice cuántas tarjetas (3.2). Sin arroba, como todo lo que lleva la cola
 */
export const ReminderEmailDataSchema = z.strictObject({
  due: z.int().min(0).nullable(),
  newAvailable: z.int().min(0),
  day: CalendarDateSchema,
});
export type ReminderEmailData = z.infer<typeof ReminderEmailDataSchema>;

// ===================================================================== Baja de un clic

/** La función que atiende la baja de los recordatorios, sin verificación de JWT */
export const EMAIL_UNSUBSCRIBE_FUNCTION = 'email-unsubscribe';
/** La página pública de la app a la que lleva el enlace del correo, con ?t=ficha */
export const UNSUBSCRIBE_PAGE_PATH = '/correo/baja';
/** La ficha de baja, 18 bytes al azar en hexadecimal. Una ficha con otra forma ni se manda al servidor */
export const UNSUBSCRIBE_TOKEN = /^[0-9a-f]{36}$/;

/**
 * Lo que contesta email-unsubscribe a la página de la app, que manda POST con { token } en JSON. El POST
 * de un clic de Gmail o Yahoo (formulario List-Unsubscribe=One-Click, con la ficha en ?t=) siempre recibe
 * 200 en blanco, aunque la ficha no exista. La ficha es de 144 bits al azar, así que decir invalid a la
 * página no deja adivinar nada. done es que se dio de baja ahora, already que ya lo estaba
 */
export const EmailUnsubscribeReplySchema = z.object({
  result: z.enum(['done', 'already', 'invalid']),
});
export type EmailUnsubscribeReply = z.infer<typeof EmailUnsubscribeReplySchema>;

// ===================================================================== Identidad de la analítica

/** analytics_identity y set_analytics_consent devuelven esta forma. El id es el distinct_id de PostHog */
export const AnalyticsIdentitySchema = z.object({
  analyticsId: z.uuid(),
  consent: z.boolean(),
});
export type AnalyticsIdentity = z.infer<typeof AnalyticsIdentitySchema>;

// ===================================================================== Error de prueba

/** La función de prueba de alertas, solo para un admin con segundo factor */
export const MONITORING_TEST_FUNCTION = 'monitoring-test';
/** El mensaje fijo de cada prueba. Sin datos de nadie, para reconocerlo en el correo de Sentry */
export const MONITORING_TEST_MESSAGES = {
  browser: 'Prueba de alertas de Studiare, navegador',
  functions: 'Prueba de alertas de Studiare, funciones',
} as const;

/** sent si el evento salió hacia Sentry. missing_dsn si la función no tiene SENTRY_DSN, que no manda nada */
export const MonitoringTestReplySchema = z.object({
  result: z.enum(['sent', 'missing_dsn']),
});
export type MonitoringTestReply = z.infer<typeof MonitoringTestReplySchema>;

// ===================================================================== Interruptores y conteos del equipo

/** Las claves de platform_settings que prende el admin en Plataforma, Correos y alertas. Las dos nacen apagadas */
export const EMAIL_DELIVERY_KEY = 'email_delivery';
export const ANALYTICS_SWITCH_KEY = 'analytics';

/**
 * El interruptor de envío de todos los correos (3.1). paused lista los tipos detenidos, por ejemplo
 * daily_review_reminder, para frenar uno sin frenar los demás. Un valor que no cumple cuenta como apagado
 */
export const EmailDeliverySchema = z.object({
  enabled: z.boolean(),
  paused: z.array(z.string().min(1)).default([]),
});
export type EmailDelivery = z.infer<typeof EmailDeliverySchema>;
export const EMAIL_DELIVERY_OFF: EmailDelivery = { enabled: false, paused: [] };

/** El interruptor de la cola de eventos de dinero (1.7) */
export const AnalyticsSwitchSchema = z.object({ enabled: z.boolean() });
export type AnalyticsSwitch = z.infer<typeof AnalyticsSwitchSchema>;

/** Los estados de un correo de la cola */
export const EMAIL_STATUSES = ['queued', 'sent', 'skipped', 'failed'] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

const CountSchema = z.int().min(0);

/**
 * admin_email_overview (3.1). Cuántos correos hay por tipo y estado en los últimos días, sin destinatarios
 * ni datos. Trae todos los tipos de email_kinds, también los que están en cero, para poder pausarlos
 */
export const EmailOverviewSchema = z.object({
  days: z.int().min(1),
  kinds: z.array(
    z.object({
      kind: z.string().min(1),
      queued: CountSchema,
      sent: CountSchema,
      skipped: CountSchema,
      failed: CountSchema,
    }),
  ),
});
export type EmailOverview = z.infer<typeof EmailOverviewSchema>;

/** El nombre de la función de la base que lo devuelve, solo para admin con segundo factor */
export const ADMIN_EMAIL_OVERVIEW_RPC = 'admin_email_overview';
