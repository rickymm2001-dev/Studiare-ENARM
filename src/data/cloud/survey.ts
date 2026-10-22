// La encuesta de los primeros días en la nube (B18 del plan del cambio, 2.1 a 2.5 del diseño). La app le habla a la base
// con las funciones de 20261030000001_first_week_survey.sql y 20261030000002_survey_erase.sql. Quien decide siempre es
// el servidor (si la encuesta le toca a esta cuenta, si ya la contestó, si las respuestas son válidas) y la app solo
// pinta lo que contesta. Las formas JSON de abajo son el contrato con el SQL y con el doble de las pruebas.
//
// Tres grupos de funciones
//   - Del alumno, con sesión y dispositivo activo: my_survey_status, submit_survey, my_survey_response y
//     delete_my_survey_response
//   - Del equipo, dueño o admin: admin_survey_summary y admin_survey_responses. Ninguna trae correo, nombre, cuenta ni
//     fecha, solo un código al azar por respuesta
//   - El ajuste survey_first_week de platform_settings, que el equipo lee y escribe con el mismo camino con el que abre el
//     registro. survey_setting, en la base, vuelve a validar cada campo al leerlo, y parseSurveySetting hace lo mismo aquí
//
// Nada de esto va a la analítica. El comentario y las respuestas solo pasan por estas llamadas, nunca por track.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  BLOCKERS,
  DAYS_USED,
  FIRST_WEEK_SURVEY_ID,
  KNOWN_SURVEY_IDS,
  RECOMMEND,
  SCALE_VALUES,
  USED_FEATURES,
  type SurveyAnswers,
} from '../../config/surveys.ts';

// ===================================================================== Funciones de la base

export const SURVEY_RPC = {
  status: 'my_survey_status',
  submit: 'submit_survey',
  mine: 'my_survey_response',
  erase: 'delete_my_survey_response',
  summary: 'admin_survey_summary',
  responses: 'admin_survey_responses',
} as const;

/** La clave del ajuste en platform_settings */
export const SURVEY_SETTING_KEY = 'survey_first_week';

// ===================================================================== Errores

/** Por qué no se pudo hablar con la base. inactive_device, otro dispositivo es el activo. no_session, sin sesión */
export type SurveyFailure = 'inactive_device' | 'no_session' | 'not_admin' | 'network' | 'unknown';

interface DbError {
  code?: string | undefined;
}

function failureOf(error: DbError): SurveyFailure {
  // 42501 es el dispositivo que ya no es el activo, o la función del equipo que pide ser admin
  if (error.code === '42501') return 'inactive_device';
  if (error.code === '28000') return 'no_session';
  // Sin código es que la petición ni llegó al servidor
  if (!error.code) return 'network';
  return 'unknown';
}

/** Lo mismo para las funciones del equipo, donde 42501 es no ser admin y no un dispositivo */
function adminFailureOf(error: DbError): SurveyFailure {
  const failure = failureOf(error);
  return failure === 'inactive_device' ? 'not_admin' : failure;
}

type Rpc = Pick<SupabaseClient, 'rpc'>;

// ===================================================================== Del alumno

const StatusSchema = z.object({
  available: z.boolean(),
  answered: z.boolean(),
  surveyId: z.string(),
  daysSinceSignup: z.number(),
});
export type SurveyStatus = z.infer<typeof StatusSchema>;

/** Si la encuesta le toca a quien llama y si ya la contestó. Lo decide el servidor, la app no adivina */
export async function readSurveyStatus(
  cloud: Rpc,
): Promise<{ ok: true; status: SurveyStatus } | { ok: false; reason: SurveyFailure }> {
  try {
    const reply = await cloud.rpc(SURVEY_RPC.status);
    if (reply.error) return { ok: false, reason: failureOf(reply.error) };
    const parsed = StatusSchema.safeParse(reply.data);
    return parsed.success ? { ok: true, status: parsed.data } : { ok: false, reason: 'unknown' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

const SubmitSchema = z.union([
  z.object({ ok: z.literal(true), code: z.string() }),
  z.object({ ok: z.literal(false), reason: z.enum(['already', 'closed', 'invalid']) }),
]);

/** already, ya la contestó. closed, apagada o ya no le toca. invalid, respuestas o comentario que la base no acepta */
export type SubmitSurveyResult =
  | { ok: true; code: string }
  | { ok: false; reason: 'already' | 'closed' | 'invalid' | SurveyFailure };

/** Manda las respuestas. El servidor vuelve a revisar todo, y un comentario vacío viaja como null */
export async function submitSurvey(
  cloud: Rpc,
  answers: SurveyAnswers,
  comment: string | null,
  surveyId: string = FIRST_WEEK_SURVEY_ID,
): Promise<SubmitSurveyResult> {
  try {
    const reply = await cloud.rpc(SURVEY_RPC.submit, {
      p_survey_id: surveyId,
      p_answers: answers,
      p_comment: comment,
    });
    if (reply.error) return { ok: false, reason: failureOf(reply.error) };
    const parsed = SubmitSchema.safeParse(reply.data);
    return parsed.success ? parsed.data : { ok: false, reason: 'unknown' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

// Las cinco opciones de una escala. Con literal y una lista, zod deja pasar exactamente esos números
const ScaleSchema = z.literal(SCALE_VALUES);
const AnswersSchema = z.object({
  days_used: z.enum(DAYS_USED),
  used: z.array(z.enum(USED_FEATURES)),
  clarity: ScaleSchema,
  ease: ScaleSchema,
  useful: ScaleSchema,
  blockers: z.array(z.enum(BLOCKERS)),
  recommend: z.enum(RECOMMEND),
});

const MineSchema = z
  .object({
    surveyId: z.string(),
    code: z.string(),
    daysSinceSignup: z.number(),
    answers: AnswersSchema,
    comment: z.string().nullable(),
    answeredAt: z.string(),
  })
  .nullable();
export type MySurveyResponse = NonNullable<z.infer<typeof MineSchema>>;

/** Lo propio, para Exportar mis datos. null es que no contestó */
export async function readMySurveyResponse(
  cloud: Rpc,
): Promise<{ ok: true; response: MySurveyResponse | null } | { ok: false; reason: SurveyFailure }> {
  try {
    const reply = await cloud.rpc(SURVEY_RPC.mine);
    if (reply.error) return { ok: false, reason: failureOf(reply.error) };
    const parsed = MineSchema.safeParse(reply.data);
    return parsed.success ? { ok: true, response: parsed.data } : { ok: false, reason: 'unknown' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Borra la respuesta propia. deleted es false si no había nada que borrar */
export async function deleteMySurveyResponse(
  cloud: Rpc,
): Promise<{ ok: true; deleted: boolean } | { ok: false; reason: SurveyFailure }> {
  try {
    const reply = await cloud.rpc(SURVEY_RPC.erase);
    if (reply.error) return { ok: false, reason: failureOf(reply.error) };
    return typeof reply.data === 'boolean'
      ? { ok: true, deleted: reply.data }
      : { ok: false, reason: 'unknown' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

// ===================================================================== Del equipo

const CountsSchema = z.record(z.string(), z.number());
const SummarySchema = z.object({
  eligible: z.number(),
  answered: z.number(),
  comments: z.number(),
  questions: z.record(z.string(), CountsSchema),
});
/** Cuántas cuentas cumplen el ajuste, cuántas contestaron y, por pregunta, cuántas marcaron cada opción */
export type SurveySummary = z.infer<typeof SummarySchema>;

export async function readSurveySummary(
  cloud: Rpc,
  surveyId: string = FIRST_WEEK_SURVEY_ID,
): Promise<{ ok: true; summary: SurveySummary } | { ok: false; reason: SurveyFailure }> {
  try {
    const reply = await cloud.rpc(SURVEY_RPC.summary, { p_survey_id: surveyId });
    if (reply.error) return { ok: false, reason: adminFailureOf(reply.error) };
    const parsed = SummarySchema.safeParse(reply.data);
    return parsed.success ? { ok: true, summary: parsed.data } : { ok: false, reason: 'unknown' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

const ResponseRowSchema = z.object({
  code: z.string(),
  answers: AnswersSchema,
  comment: z.string().nullable(),
});
/**
 * Una respuesta con su código. Nada que diga de quién es: ni correo, ni fecha, ni los días que llevaba la cuenta, que con
 * 5 personas y la fecha de alta que ya se ve en Usuarios darían la cuenta. La base no los devuelve al equipo
 */
export interface SurveyResponseRow {
  code: string;
  answers: SurveyAnswers;
  comment: string | null;
}

export async function readSurveyResponses(
  cloud: Rpc,
  surveyId: string = FIRST_WEEK_SURVEY_ID,
): Promise<{ ok: true; rows: SurveyResponseRow[] } | { ok: false; reason: SurveyFailure }> {
  try {
    const reply = await cloud.rpc(SURVEY_RPC.responses, { p_survey_id: surveyId });
    if (reply.error) return { ok: false, reason: adminFailureOf(reply.error) };
    const parsed = z.array(ResponseRowSchema).safeParse(reply.data);
    if (!parsed.success) return { ok: false, reason: 'unknown' };
    return {
      ok: true,
      rows: parsed.data.map((row) => ({
        code: row.code,
        answers: row.answers,
        comment: row.comment,
      })),
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

// ===================================================================== El ajuste

/** El ajuste de la encuesta ya validado, con la misma regla que survey_setting en la base */
export interface SurveySetting {
  enabled: boolean;
  id: string;
  delayDays: number;
  /** AAAA-MM-DD. Las cuentas creadas ese día o después ya no la reciben. null es sin fecha límite */
  accountsUntil: string | null;
}

export const DEFAULT_SURVEY_SETTING: SurveySetting = {
  enabled: false,
  id: FIRST_WEEK_SURVEY_ID,
  delayDays: 7,
  accountsUntil: null,
};

export const MAX_DELAY_DAYS = 30;

/** true si es una fecha AAAA-MM-DD que existe en el calendario */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * El ajuste que dice una fila de platform_settings. Cada campo se valida por separado y, si no sirve, usa el de
 * fábrica: solo el booleano true prende, el id es el de una encuesta que la base conoce (KNOWN_SURVEY_IDS), los días son un
 * entero de 0 a 30 y la fecha es una que existe. Nada lanza
 */
export function parseSurveySetting(value: unknown): SurveySetting {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ...DEFAULT_SURVEY_SETTING };
  }
  const raw = value as Record<string, unknown>;
  const id = raw.id;
  const days = raw.delay_days;
  const until = raw.accounts_until;
  return {
    enabled: raw.enabled === true,
    id: typeof id === 'string' && KNOWN_SURVEY_IDS.includes(id) ? id : DEFAULT_SURVEY_SETTING.id,
    delayDays:
      typeof days === 'number' && Number.isInteger(days) && days >= 0 && days <= MAX_DELAY_DAYS
        ? days
        : DEFAULT_SURVEY_SETTING.delayDays,
    accountsUntil: typeof until === 'string' && isCalendarDate(until) ? until : null,
  };
}

/** Cómo se guarda el ajuste en platform_settings */
export function surveySettingValue(setting: SurveySetting): Record<string, unknown> {
  return {
    enabled: setting.enabled,
    id: setting.id,
    delay_days: setting.delayDays,
    accounts_until: setting.accountsUntil,
  };
}

/** Lee el ajuste. null si no se pudo leer. Sin la clave, el de fábrica, apagado */
export async function readSurveySetting(
  cloud: Pick<SupabaseClient, 'from'>,
): Promise<SurveySetting | null> {
  try {
    const { data, error } = await cloud
      .from('platform_settings')
      .select('value')
      .eq('key', SURVEY_SETTING_KEY)
      .maybeSingle();
    if (error) return null;
    return parseSurveySetting((data as { value?: unknown } | null)?.value);
  } catch {
    return null;
  }
}

/** Guarda el ajuste. Solo el dueño y los admins pueden, por el permiso por fila de la tabla */
export async function writeSurveySetting(
  cloud: Pick<SupabaseClient, 'from'>,
  setting: SurveySetting,
): Promise<boolean> {
  try {
    const { error } = await cloud.from('platform_settings').upsert({
      key: SURVEY_SETTING_KEY,
      value: surveySettingValue(setting),
      updated_at: new Date().toISOString(),
    });
    return !error;
  } catch {
    return false;
  }
}
