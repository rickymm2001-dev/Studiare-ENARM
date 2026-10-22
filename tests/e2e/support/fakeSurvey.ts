// La encuesta de los primeros días del Supabase simulado (B18, 2.3 del diseño). Imita lo que publican
// supabase/migrations/20261030000001_first_week_survey.sql y 20261030000002_survey_erase.sql, con las formas de
// src/data/cloud/survey.ts: my_survey_status, submit_survey, my_survey_response, delete_my_survey_response,
// admin_survey_summary y admin_survey_responses. fakeSupabase.ts lo engancha. Está siempre, como en el servidor real, y
// con deployed en false imita un proyecto sin las migraciones, donde las funciones no existen y la app tiene que seguir
// sin franja.
//
// Aplica las mismas reglas que la base. El servidor decide si la encuesta le toca a la cuenta (prendida, alumno, dentro del
// grupo, con los días cumplidos y sin contestar), vuelve a revisar las respuestas y el comentario, deja una sola respuesta
// por cuenta y solo da al equipo el código, las respuestas y el comentario, sin los días de la cuenta. Los días de la cuenta
// salen del reloj de la prueba, que advanceDays adelanta sin mover las sesiones, así una cuenta recién creada puede tener
// 7 días. Los días solo se los devuelven a su dueña (estado y Exportar mis datos). Todo es simulado.
import { randomBytes } from 'node:crypto';
import {
  BLOCKERS,
  DAYS_USED,
  RECOMMEND,
  SCALE_VALUES,
  USED_FEATURES,
  commentProblem,
  type SurveyAnswers,
} from '@/config/surveys';
import { SURVEY_RPC, parseSurveySetting, type SurveySetting } from '@/data/cloud/survey';
import type { Role } from '@/data/schemas/common';

/** Las funciones de la base de la encuesta que atiende el doble */
export const SURVEY_STUDENT_RPCS = [
  SURVEY_RPC.status,
  SURVEY_RPC.submit,
  SURVEY_RPC.mine,
  SURVEY_RPC.erase,
] as const;
export const SURVEY_ADMIN_RPCS = [SURVEY_RPC.summary, SURVEY_RPC.responses] as const;
export type SurveyRpc = (typeof SURVEY_STUDENT_RPCS)[number] | (typeof SURVEY_ADMIN_RPCS)[number];

const RPC_SET: ReadonlySet<string> = new Set<string>([
  ...SURVEY_STUDENT_RPCS,
  ...SURVEY_ADMIN_RPCS,
]);
export const isSurveyRpc = (name: string): name is SurveyRpc => RPC_SET.has(name);

const DAY_MS = 86_400_000;

// ===================================================================== Estado

export interface StoredSurveyResponse {
  surveyId: string;
  code: string;
  daysSinceSignup: number;
  answers: SurveyAnswers;
  comment: string | null;
  /** Cuándo se contestó, en milisegundos. Solo la ve su dueño en el archivo de Exportar mis datos */
  answeredAt: number;
}

export interface FakeSurveyStore {
  /** false imita un proyecto sin las migraciones de B18, donde las funciones no existen */
  deployed: boolean;
  /** Los días que se adelantó el reloj de la encuesta. Hace más viejas a las cuentas de la prueba */
  skewDays: number;
  /** Lo que contestó cada cuenta, por el id de su cuenta. Una por cuenta y por encuesta */
  responses: Map<string, StoredSurveyResponse>;
}

/** Un doble recién abierto. Sin respuestas y con el reloj en el momento de la prueba */
export function createFakeSurveyStore(): FakeSurveyStore {
  return { deployed: true, skewDays: 0, responses: new Map() };
}

/** Adelanta el reloj de la encuesta. Las cuentas de la prueba cumplen más días sin esperar de verdad */
export function advanceSurveyDays(store: FakeSurveyStore, days: number): void {
  store.skewDays += days;
}

/** Quita lo de una cuenta, como el on delete cascade de delete_my_account. delete_my_data no la toca (8.4) */
export function forgetSurveyUser(store: FakeSurveyStore, userId: string): void {
  store.responses.delete(userId);
}

/** El código de una respuesta, R y 6 caracteres hexadecimales al azar, que no se repite */
function newCode(store: FakeSurveyStore): string {
  const taken = new Set([...store.responses.values()].map((item) => item.code));
  for (;;) {
    const code = `R${randomBytes(3).toString('hex').toUpperCase()}`;
    if (!taken.has(code)) return code;
  }
}

// ===================================================================== Quien llama

/** Lo que el doble sabe de quien llama. El dispositivo activo y el rol salen del Supabase simulado */
export interface FakeSurveyCaller {
  userId: string;
  activeDevice: boolean;
  /** Dueño o admin con su segundo factor, como is_admin() */
  isAdmin: boolean;
  /** El rol guardado, no el que da el segundo factor. Solo un alumno ve y contesta la encuesta */
  assignedRole: Role;
  /** Cuándo se creó la cuenta, en milisegundos */
  createdAt: number;
  /** El valor de platform_settings.survey_first_week, o undefined si la clave no existe */
  settingValue: unknown;
  /** Las cuentas de alumno con el correo confirmado, con su fecha de alta, para contar las elegibles */
  students: readonly { createdAt: number }[];
  /** Ahora, en milisegundos, ya con los días adelantados */
  now: number;
}

export interface FakeSurveyReply {
  status: number;
  json?: unknown;
}

const ok = (value: unknown): FakeSurveyReply => ({ status: 200, json: value });
const fail = (code: string, message: string, status: number): FakeSurveyReply => ({
  status,
  json: { code, message, details: null, hint: null },
});
const NOT_ACTIVE = fail('42501', 'Este dispositivo no es el activo de la cuenta', 403);

// ===================================================================== Reglas, como las de la base

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** survey_answers_ok. Exactamente las siete llaves, con sus ids y sus reglas */
function answersOk(value: unknown): value is SurveyAnswers {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const wanted = ['blockers', 'clarity', 'days_used', 'ease', 'recommend', 'used', 'useful'];
  if (keys.join() !== wanted.join()) return false;
  const oneOf = (item: unknown, list: readonly unknown[]) => list.includes(item);
  const listOf = (item: unknown, list: readonly string[], max: number, exclusive: string) => {
    if (!Array.isArray(item) || item.length < 1 || item.length > max) return false;
    if (!item.every((entry) => typeof entry === 'string' && list.includes(entry))) return false;
    if (new Set(item).size !== item.length) return false;
    return !(item.includes(exclusive) && item.length > 1);
  };
  return (
    oneOf(value.days_used, DAYS_USED) &&
    oneOf(value.recommend, RECOMMEND) &&
    [value.clarity, value.ease, value.useful].every((entry) => oneOf(entry, SCALE_VALUES)) &&
    listOf(value.used, USED_FEATURES, USED_FEATURES.length, 'none') &&
    listOf(value.blockers, BLOCKERS, 3, 'nothing')
  );
}

/** survey_waited. La cuenta entra en el grupo y ya esperó los días */
function waited(caller: FakeSurveyCaller, createdAt: number, setting: SurveySetting): boolean {
  const until =
    setting.accountsUntil === null ? null : Date.parse(`${setting.accountsUntil}T06:00:00Z`);
  return (
    (until === null || createdAt < until) && caller.now - createdAt >= setting.delayDays * DAY_MS
  );
}

const daysSince = (caller: FakeSurveyCaller): number =>
  Math.min(400, Math.max(0, Math.floor((caller.now - caller.createdAt) / DAY_MS)));

// ===================================================================== Funciones de la base

/** Las funciones rpc de la encuesta, con las reglas de la migración. Quien llama ya tiene sesión */
export function fakeSurveyRpc(
  store: FakeSurveyStore,
  name: SurveyRpc,
  caller: FakeSurveyCaller,
  args: Record<string, unknown>,
): FakeSurveyReply {
  if (!store.deployed) {
    return fail('PGRST202', `Could not find the function public.${name} in the schema cache`, 404);
  }
  const setting = parseSurveySetting(caller.settingValue);
  if (name === SURVEY_RPC.summary || name === SURVEY_RPC.responses) {
    if (!caller.isAdmin) return fail('42501', 'Solo un administrador puede ver la encuesta', 403);
    const surveyId = typeof args.p_survey_id === 'string' ? args.p_survey_id : null;
    const mine = [...store.responses.values()].filter((item) => item.surveyId === surveyId);
    if (name === SURVEY_RPC.responses) {
      // Por código y no por fecha, hasta 200, y sin nada que ligue a la persona
      return ok(
        mine
          .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
          .slice(0, 200)
          .map((item) => ({
            code: item.code,
            answers: item.answers,
            comment: item.comment,
          })),
      );
    }
    const questions: Record<string, Record<string, number>> = {};
    for (const item of mine) {
      for (const [id, value] of Object.entries(item.answers)) {
        for (const option of Array.isArray(value) ? value : [value]) {
          const counts = (questions[id] ??= {});
          counts[String(option)] = (counts[String(option)] ?? 0) + 1;
        }
      }
    }
    return ok({
      eligible: caller.students.filter((student) => waited(caller, student.createdAt, setting))
        .length,
      answered: mine.length,
      comments: mine.filter((item) => item.comment !== null).length,
      questions,
    });
  }

  // Las del alumno piden sesión y dispositivo activo
  if (!caller.activeDevice) return NOT_ACTIVE;
  const own = store.responses.get(caller.userId);
  const answered = own?.surveyId === setting.id;
  switch (name) {
    case SURVEY_RPC.status:
      return ok({
        available:
          setting.enabled &&
          !answered &&
          caller.assignedRole === 'student' &&
          waited(caller, caller.createdAt, setting),
        answered,
        surveyId: setting.id,
        daysSinceSignup: daysSince(caller),
      });
    case SURVEY_RPC.submit: {
      if (
        !setting.enabled ||
        args.p_survey_id !== setting.id ||
        caller.assignedRole !== 'student' ||
        !waited(caller, caller.createdAt, setting)
      ) {
        return ok({ ok: false, reason: 'closed' });
      }
      if (answered) return ok({ ok: false, reason: 'already' });
      const raw = typeof args.p_comment === 'string' ? args.p_comment.trim() : '';
      const comment = raw === '' ? null : raw;
      if (!answersOk(args.p_answers) || commentProblem(comment) !== null) {
        return ok({ ok: false, reason: 'invalid' });
      }
      const code = newCode(store);
      store.responses.set(caller.userId, {
        surveyId: setting.id,
        code,
        daysSinceSignup: daysSince(caller),
        answers: args.p_answers,
        comment,
        answeredAt: caller.now,
      });
      return ok({ ok: true, code });
    }
    case SURVEY_RPC.mine:
      return ok(
        own
          ? {
              surveyId: own.surveyId,
              code: own.code,
              daysSinceSignup: own.daysSinceSignup,
              answers: own.answers,
              comment: own.comment,
              answeredAt: new Date(own.answeredAt).toISOString(),
            }
          : null,
      );
    case SURVEY_RPC.erase:
      return ok(store.responses.delete(caller.userId));
  }
}
