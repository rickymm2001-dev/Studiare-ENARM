// El doble de la encuesta de los primeros días contra los contratos de src/data/cloud/survey.ts (B18). Comprueba sin
// navegador que lo que contesta fakeSurvey.ts cumple las formas que valida la app, y que cumple las reglas de las
// migraciones que protegen la privacidad: una sola respuesta por cuenta, solo un alumno con los días cumplidos, y nada que
// ligue a la persona en lo que ve el equipo. Así las e2e de la nube fallan por la app y no por el doble. Todo es simulado
import { describe, expect, it } from 'vitest';
import type { SurveyAnswers } from '@/config/surveys';
import { SURVEY_RPC, parseSurveySetting } from '@/data/cloud/survey';
import {
  advanceSurveyDays,
  createFakeSurveyStore,
  fakeSurveyRpc,
  forgetSurveyUser,
  isSurveyRpc,
  type FakeSurveyCaller,
  type FakeSurveyReply,
  type FakeSurveyStore,
  type SurveyRpc,
} from '../e2e/support/fakeSurvey';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const ENABLED = { enabled: true, id: 'first-week-v1', delay_days: 7, accounts_until: null };

const ANSWERS: SurveyAnswers = {
  days_used: 'd5_6',
  used: ['review', 'practice'],
  clarity: 4,
  ease: 5,
  useful: 4,
  blockers: ['slow'],
  recommend: 'yes',
};

function caller(overrides: Partial<FakeSurveyCaller> = {}): FakeSurveyCaller {
  return {
    userId: 'ana',
    activeDevice: true,
    isAdmin: false,
    assignedRole: 'student',
    createdAt: NOW - 8 * DAY,
    settingValue: ENABLED,
    students: [{ createdAt: NOW - 8 * DAY }, { createdAt: NOW - 2 * DAY }],
    now: NOW,
    ...overrides,
  };
}

const call = (
  store: FakeSurveyStore,
  name: SurveyRpc,
  who: FakeSurveyCaller = caller(),
  args: Record<string, unknown> = {},
): FakeSurveyReply => fakeSurveyRpc(store, name, who, args);

const submit = (
  store: FakeSurveyStore,
  who: FakeSurveyCaller = caller(),
  answers: unknown = ANSWERS,
  comment: unknown = null,
) =>
  call(store, SURVEY_RPC.submit, who, {
    p_survey_id: 'first-week-v1',
    p_answers: answers,
    p_comment: comment,
  });

describe('quién recibe la encuesta', () => {
  it('apagada o sin la clave nadie la recibe, y el ajuste malo usa el de fábrica', () => {
    const store = createFakeSurveyStore();
    for (const settingValue of [
      undefined,
      { ...ENABLED, enabled: false },
      { enabled: 'true' },
      'true',
    ]) {
      expect(call(store, SURVEY_RPC.status, caller({ settingValue })).json).toMatchObject({
        available: false,
      });
    }
    expect(parseSurveySetting(undefined).enabled).toBe(false);
  });

  it('prendida, le toca al alumno con 7 días y no al de 2', () => {
    const store = createFakeSurveyStore();
    expect(call(store, SURVEY_RPC.status).json).toEqual({
      available: true,
      answered: false,
      surveyId: 'first-week-v1',
      daysSinceSignup: 8,
    });
    expect(call(store, SURVEY_RPC.status, caller({ createdAt: NOW - 2 * DAY })).json).toMatchObject(
      { available: false, daysSinceSignup: 2 },
    );
  });

  it('adelantar los días del doble hace más viejas a las cuentas', () => {
    const store = createFakeSurveyStore();
    const young = caller({ createdAt: NOW - DAY });
    expect(call(store, SURVEY_RPC.status, young).json).toMatchObject({ available: false });
    advanceSurveyDays(store, 7);
    expect(store.skewDays).toBe(7);
    // El doble de fakeSupabase suma los días a now. Aquí se hace igual
    expect(
      call(store, SURVEY_RPC.status, { ...young, now: NOW + store.skewDays * DAY }).json,
    ).toMatchObject({ available: true });
  });

  it('un médico, un admin o el dueño nunca la reciben, aunque su sesión se vea como la de un alumno', () => {
    const store = createFakeSurveyStore();
    for (const assignedRole of ['physician', 'admin', 'owner'] as const) {
      const staff = caller({ assignedRole });
      expect(call(store, SURVEY_RPC.status, staff).json).toMatchObject({ available: false });
      expect(submit(store, staff).json).toEqual({ ok: false, reason: 'closed' });
    }
  });

  it('la fecha límite deja fuera a las cuentas de ese día en adelante, contada desde la medianoche de México', () => {
    const store = createFakeSurveyStore();
    const until = { ...ENABLED, delay_days: 0, accounts_until: '2026-11-09' };
    // El corte es el 9 de noviembre a las 6:00 UTC. Antes entra y después no
    const before = caller({ settingValue: until, createdAt: Date.UTC(2026, 10, 9, 5, 0, 0) });
    const after = caller({ settingValue: until, createdAt: Date.UTC(2026, 10, 9, 7, 0, 0) });
    expect(call(store, SURVEY_RPC.status, before).json).toMatchObject({ available: true });
    expect(call(store, SURVEY_RPC.status, after).json).toMatchObject({ available: false });
  });

  it('un dispositivo que no es el activo recibe el error de siempre, y anónimo no llega aquí', () => {
    const store = createFakeSurveyStore();
    const reply = call(store, SURVEY_RPC.status, caller({ activeDevice: false }));
    expect(reply.status).toBe(403);
    expect(reply.json).toMatchObject({ code: '42501' });
  });
});

describe('contestar', () => {
  it('guarda una respuesta con un código R y 6 caracteres hexadecimales', () => {
    const store = createFakeSurveyStore();
    const reply = submit(store, caller(), ANSWERS, '  Un comentario  ');
    expect(reply.json).toMatchObject({
      ok: true,
      code: expect.stringMatching(/^R[0-9A-F]{6}$/) as string,
    });
    expect(store.responses.get('ana')).toMatchObject({
      comment: 'Un comentario',
      daysSinceSignup: 8,
    });
  });

  it('una sola vez por cuenta', () => {
    const store = createFakeSurveyStore();
    expect(submit(store).json).toMatchObject({ ok: true });
    expect(submit(store).json).toEqual({ ok: false, reason: 'already' });
    expect(call(store, SURVEY_RPC.status).json).toMatchObject({ available: false, answered: true });
  });

  it('rechaza lo que la base rechaza', () => {
    const store = createFakeSurveyStore();
    const invalid = { ok: false, reason: 'invalid' };
    expect(submit(store, caller(), { ...ANSWERS, ease: 6 }).json).toEqual(invalid);
    expect(submit(store, caller(), { ...ANSWERS, extra: 1 }).json).toEqual(invalid);
    expect(submit(store, caller(), { ...ANSWERS, used: ['none', 'review'] }).json).toEqual(invalid);
    expect(submit(store, caller(), { ...ANSWERS, used: ['review', 'review'] }).json).toEqual(
      invalid,
    );
    expect(
      submit(store, caller(), {
        ...ANSWERS,
        blockers: ['slow', 'error', 'unclear_start', 'few_questions'],
      }).json,
    ).toEqual(invalid);
    expect(submit(store, caller(), { ...ANSWERS, blockers: ['nothing', 'slow'] }).json).toEqual(
      invalid,
    );
    expect(submit(store, caller(), null).json).toEqual(invalid);
    expect(submit(store, caller(), ANSWERS, 'escríbeme a a@b.mx').json).toEqual(invalid);
    expect(submit(store, caller(), ANSWERS, 'mi cel es 55 1234 5678').json).toEqual(invalid);
    expect(submit(store, caller(), ANSWERS, 'a'.repeat(501)).json).toEqual(invalid);
    expect(store.responses.size).toBe(0);
  });

  it('cerrada si es otra encuesta, si está apagada o si todavía no cumple los días', () => {
    const store = createFakeSurveyStore();
    const closed = { ok: false, reason: 'closed' };
    expect(
      call(store, SURVEY_RPC.submit, caller(), {
        p_survey_id: 'otra',
        p_answers: ANSWERS,
        p_comment: null,
      }).json,
    ).toEqual(closed);
    expect(submit(store, caller({ settingValue: { ...ENABLED, enabled: false } })).json).toEqual(
      closed,
    );
    expect(submit(store, caller({ createdAt: NOW - DAY })).json).toEqual(closed);
  });

  it('un comentario de espacios se guarda como null', () => {
    const store = createFakeSurveyStore();
    submit(store, caller(), ANSWERS, '   ');
    expect(store.responses.get('ana')?.comment).toBeNull();
  });
});

describe('lo propio', () => {
  it('my_survey_response devuelve lo propio, o null, y borrar quita solo la propia', () => {
    const store = createFakeSurveyStore();
    expect(call(store, SURVEY_RPC.mine).json).toBeNull();
    submit(store);
    submit(store, caller({ userId: 'beto' }));
    expect(call(store, SURVEY_RPC.mine).json).toMatchObject({
      surveyId: 'first-week-v1',
      answers: ANSWERS,
      comment: null,
    });
    expect(call(store, SURVEY_RPC.erase).json).toBe(true);
    expect(call(store, SURVEY_RPC.erase).json).toBe(false);
    expect(call(store, SURVEY_RPC.mine).json).toBeNull();
    expect(store.responses.has('beto')).toBe(true);
  });

  it('borrar la cuenta se lleva la respuesta', () => {
    const store = createFakeSurveyStore();
    submit(store);
    forgetSurveyUser(store, 'ana');
    expect(store.responses.size).toBe(0);
  });
});

describe('lo que ve el equipo', () => {
  const admin = caller({ userId: 'jefe', isAdmin: true, assignedRole: 'admin' });

  it('solo un admin, y el resumen y la lista no traen cuenta, correo ni fecha', () => {
    const store = createFakeSurveyStore();
    submit(store, caller(), ANSWERS, 'Algo que cambiaría');
    submit(store, caller({ userId: 'beto' }));
    const args = { p_survey_id: 'first-week-v1' };
    for (const name of [SURVEY_RPC.summary, SURVEY_RPC.responses] as const) {
      expect(call(store, name, caller(), args).status).toBe(403);
      expect(call(store, name, admin, args).status).toBe(200);
    }
    const summary = call(store, SURVEY_RPC.summary, admin, args).json as Record<string, unknown>;
    expect(Object.keys(summary).sort()).toEqual(['answered', 'comments', 'eligible', 'questions']);
    expect(summary).toMatchObject({ answered: 2, comments: 1, eligible: 1 });
    const rows = call(store, SURVEY_RPC.responses, admin, args).json as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      // Ninguna salida del equipo trae los días de la cuenta: con la fecha de alta de Usuarios ligarían código y cuenta
      expect(Object.keys(row).sort()).toEqual(['answers', 'code', 'comment']);
    }
    expect(JSON.stringify([summary, rows])).not.toMatch(
      /ana|beto|jefe|user|email|@|created|days_since|signup/i,
    );
  });

  it('la lista sale ordenada por código y no por orden de llegada', () => {
    const store = createFakeSurveyStore();
    const codes = ['RF00001', 'RA00002', 'RB00003'];
    for (const [index, code] of codes.entries()) {
      store.responses.set(`u${String(index)}`, {
        surveyId: 'first-week-v1',
        code,
        daysSinceSignup: 9,
        answers: ANSWERS,
        comment: null,
        answeredAt: NOW + index,
      });
    }
    const rows = call(store, SURVEY_RPC.responses, admin, { p_survey_id: 'first-week-v1' })
      .json as { code: string }[];
    expect(rows.map((row) => row.code)).toEqual(['RA00002', 'RB00003', 'RF00001']);
  });
});

describe('un proyecto sin las migraciones', () => {
  it('las funciones no existen y la app tiene que seguir sin franja', () => {
    const store = createFakeSurveyStore();
    store.deployed = false;
    const reply = call(store, SURVEY_RPC.status);
    expect(reply.status).toBe(404);
    expect(reply.json).toMatchObject({ code: 'PGRST202' });
  });

  it('reconoce las seis funciones y solo esas', () => {
    for (const name of Object.values(SURVEY_RPC)) expect(isSurveyRpc(name)).toBe(true);
    expect(isSurveyRpc('my_reminder_prefs')).toBe(false);
    expect(Object.values(SURVEY_RPC)).toHaveLength(6);
  });
});
