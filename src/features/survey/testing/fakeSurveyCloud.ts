// Un servidor de la encuesta en memoria para las pruebas de componentes (B18). Imita lo que hacen las funciones de
// 20261030000001_first_week_survey.sql con la forma de src/data/cloud/survey.ts: my_survey_status, submit_survey,
// my_survey_response, delete_my_survey_response, admin_survey_summary y admin_survey_responses, y el ajuste en
// platform_settings. Aplica las mismas reglas de las respuestas con la configuración de la app. Todo es simulado.
import {
  QUESTION_IDS,
  completeAnswers,
  commentProblem,
  type SurveyAnswers,
} from '@/config/surveys';
import { parseSurveySetting, surveySettingValue, type SurveySetting } from '@/data/cloud/survey';

export interface FakeSurveyState {
  setting: SurveySetting;
  /** Si la cuenta que llama ya cumplió los días de espera */
  waited: boolean;
  /** Lo que ya contestó cada código */
  responses: { code: string; days: number; answers: SurveyAnswers; comment: string | null }[];
  /** Si la cuenta que llama ya contestó */
  answered: boolean;
  /** Cuántas cuentas cumplen el ajuste, para el resumen */
  eligible: number;
  /** Cada llamada, para revisar qué se pidió y qué no */
  calls: unknown[][];
  /** Un error que contesta a la siguiente llamada de esa función, una sola vez */
  failNext: Record<string, { code?: string } | 'throw'>;
  nextCode: number;
}

export function createFakeSurveyState(overrides: Partial<FakeSurveyState> = {}): FakeSurveyState {
  return {
    setting: { enabled: true, id: 'first-week-v1', delayDays: 7, accountsUntil: null },
    waited: true,
    responses: [],
    answered: false,
    eligible: 5,
    calls: [],
    failNext: {},
    nextCode: 1,
    ...overrides,
  };
}

export function fakeSurveyCloud(state: FakeSurveyState): unknown {
  const reply = (name: string, data: unknown) => {
    const failure = state.failNext[name];
    if (failure !== undefined) {
      Reflect.deleteProperty(state.failNext, name);
      return failure === 'throw'
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve({ data: null, error: failure });
    }
    return Promise.resolve({ data, error: null });
  };
  const counts = () => {
    const questions: Record<string, Record<string, number>> = {};
    for (const response of state.responses) {
      for (const id of QUESTION_IDS) {
        const value = response.answers[id];
        for (const option of Array.isArray(value) ? value : [value]) {
          const key = String(option);
          questions[id] ??= {};
          questions[id][key] = (questions[id][key] ?? 0) + 1;
        }
      }
    }
    return questions;
  };
  return {
    rpc: (name: string, rawArgs?: Record<string, unknown>) => {
      const args = rawArgs ?? {};
      state.calls.push(['rpc', name, rawArgs]);
      // Un error pedido responde antes de tocar nada, como una petición que no llegó
      if (state.failNext[name] !== undefined) return reply(name, null);
      switch (name) {
        case 'my_survey_status':
          return reply(name, {
            available: state.setting.enabled && state.waited && !state.answered,
            answered: state.answered,
            surveyId: state.setting.id,
            daysSinceSignup: state.waited ? 9 : 2,
          });
        case 'submit_survey': {
          if (!state.setting.enabled || !state.waited || args.p_survey_id !== state.setting.id) {
            return reply(name, { ok: false, reason: 'closed' });
          }
          if (state.answered) return reply(name, { ok: false, reason: 'already' });
          const answers = completeAnswers(args.p_answers ?? {});
          const comment = typeof args.p_comment === 'string' ? args.p_comment : null;
          if (answers === null || commentProblem(comment) !== null) {
            return reply(name, { ok: false, reason: 'invalid' });
          }
          const code = `R${String(state.nextCode).padStart(6, '0')}`;
          state.nextCode += 1;
          state.answered = true;
          state.responses.push({ code, days: 9, answers, comment });
          return reply(name, { ok: true, code });
        }
        case 'my_survey_response': {
          const mine = state.answered ? state.responses.at(-1) : undefined;
          return reply(
            name,
            mine
              ? {
                  surveyId: state.setting.id,
                  code: mine.code,
                  daysSinceSignup: mine.days,
                  answers: mine.answers,
                  comment: mine.comment,
                  answeredAt: '2026-11-02T10:00:00Z',
                }
              : null,
          );
        }
        case 'delete_my_survey_response': {
          const had = state.answered;
          if (had) {
            state.responses.pop();
            state.answered = false;
          }
          return reply(name, had);
        }
        case 'admin_survey_summary':
          return reply(name, {
            eligible: state.eligible,
            answered: state.responses.length,
            comments: state.responses.filter((response) => response.comment !== null).length,
            questions: counts(),
          });
        case 'admin_survey_responses':
          return reply(
            name,
            [...state.responses]
              .sort((a, b) => a.code.localeCompare(b.code))
              .map((response) => ({
                code: response.code,
                answers: response.answers,
                comment: response.comment,
              })),
          );
        default:
          return Promise.resolve({ data: null, error: { code: 'PGRST202' } });
      }
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => reply(`${table}.select`, { value: surveySettingValue(state.setting) }),
        }),
      }),
      upsert: (row: { value: unknown }) => {
        state.calls.push([table, 'upsert', row]);
        state.setting = parseSurveySetting(row.value);
        return reply(`${table}.upsert`, null);
      },
    }),
  };
}
