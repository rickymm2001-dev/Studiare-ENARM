// La capa de datos de la encuesta de los primeros días (B18). Cada función le habla a la base con la forma del contrato
// y traduce la respuesta o el error, sin lanzar nunca. El ajuste se valida campo por campo, como survey_setting.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { KNOWN_SURVEY_IDS, type SurveyAnswers } from '@/config/surveys';
import {
  DEFAULT_SURVEY_SETTING,
  SURVEY_RPC,
  deleteMySurveyResponse,
  isCalendarDate,
  parseSurveySetting,
  readMySurveyResponse,
  readSurveyResponses,
  readSurveySetting,
  readSurveyStatus,
  readSurveySummary,
  submitSurvey,
  surveySettingValue,
  writeSurveySetting,
} from './survey';

type Reply = { data?: unknown; error: { code?: string } | null } | 'throw';

/** Un cliente que anota cada llamada y responde lo que se le diga */
function stub(replies: Record<string, Reply>) {
  const calls: unknown[][] = [];
  const answer = (key: string) => {
    const reply = replies[key] ?? { data: null, error: null };
    return reply === 'throw'
      ? Promise.reject(new TypeError('Failed to fetch'))
      : Promise.resolve({ data: reply.data ?? null, error: reply.error });
  };
  const cloud = {
    rpc: (name: string, args?: unknown) => {
      calls.push(['rpc', name, args]);
      return answer(name);
    },
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: unknown) => ({
          maybeSingle: () => {
            calls.push([table, 'select', column, value]);
            return answer(`${table}.select`);
          },
        }),
      }),
      upsert: (row: unknown) => {
        calls.push([table, 'upsert', row]);
        return answer(`${table}.upsert`);
      },
    }),
  } as unknown as SupabaseClient;
  return { cloud, calls };
}

const ANSWERS: SurveyAnswers = {
  days_used: 'd5_6',
  used: ['review', 'practice'],
  clarity: 4,
  ease: 5,
  useful: 4,
  blockers: ['slow'],
  recommend: 'yes',
};

describe('el estado de la encuesta', () => {
  it('lee lo que contesta el servidor', async () => {
    const { cloud, calls } = stub({
      [SURVEY_RPC.status]: {
        data: { available: true, answered: false, surveyId: 'first-week-v1', daysSinceSignup: 8 },
        error: null,
      },
    });
    expect(await readSurveyStatus(cloud)).toEqual({
      ok: true,
      status: { available: true, answered: false, surveyId: 'first-week-v1', daysSinceSignup: 8 },
    });
    expect(calls).toEqual([['rpc', 'my_survey_status', undefined]]);
  });

  it('traduce el dispositivo que no es el activo, la falta de sesión, la red y una respuesta rara', async () => {
    const reason = async (reply: Reply) => {
      const result = await readSurveyStatus(stub({ [SURVEY_RPC.status]: reply }).cloud);
      return result.ok ? 'ok' : result.reason;
    };
    expect(await reason({ error: { code: '42501' } })).toBe('inactive_device');
    expect(await reason({ error: { code: '28000' } })).toBe('no_session');
    expect(await reason({ error: {} })).toBe('network');
    expect(await reason({ error: { code: 'XX000' } })).toBe('unknown');
    expect(await reason('throw')).toBe('network');
    expect(await reason({ data: { available: 'sí' }, error: null })).toBe('unknown');
  });
});

describe('enviar la encuesta', () => {
  it('manda el id, las respuestas y el comentario, y devuelve el código', async () => {
    const { cloud, calls } = stub({
      [SURVEY_RPC.submit]: { data: { ok: true, code: 'R1A2B3C' }, error: null },
    });
    expect(await submitSurvey(cloud, ANSWERS, 'Me costó ubicar Simular')).toEqual({
      ok: true,
      code: 'R1A2B3C',
    });
    expect(calls).toEqual([
      [
        'rpc',
        'submit_survey',
        {
          p_survey_id: 'first-week-v1',
          p_answers: ANSWERS,
          p_comment: 'Me costó ubicar Simular',
        },
      ],
    ]);
  });

  it('un comentario vacío viaja como null', async () => {
    const { cloud, calls } = stub({
      [SURVEY_RPC.submit]: { data: { ok: true, code: 'R000001' }, error: null },
    });
    await submitSurvey(cloud, ANSWERS, null);
    expect((calls[0]?.[2] as { p_comment: unknown }).p_comment).toBeNull();
  });

  it('traduce ya contestada, cerrada y respuestas que no valen, y los errores', async () => {
    const reason = async (reply: Reply) => {
      const result = await submitSurvey(stub({ [SURVEY_RPC.submit]: reply }).cloud, ANSWERS, null);
      return result.ok ? 'ok' : result.reason;
    };
    for (const code of ['already', 'closed', 'invalid']) {
      expect(await reason({ data: { ok: false, reason: code }, error: null })).toBe(code);
    }
    expect(await reason({ error: { code: '42501' } })).toBe('inactive_device');
    expect(await reason('throw')).toBe('network');
    expect(await reason({ data: { ok: false, reason: 'otra' }, error: null })).toBe('unknown');
    expect(await reason({ data: { ok: true }, error: null })).toBe('unknown');
  });
});

describe('lo propio', () => {
  it('lee la respuesta propia, o null si no contestó', async () => {
    const mine = {
      surveyId: 'first-week-v1',
      code: 'R1A2B3C',
      daysSinceSignup: 8,
      answers: ANSWERS,
      comment: null,
      answeredAt: '2026-11-02T10:00:00Z',
    };
    expect(
      await readMySurveyResponse(stub({ [SURVEY_RPC.mine]: { data: mine, error: null } }).cloud),
    ).toEqual({
      ok: true,
      response: mine,
    });
    expect(
      await readMySurveyResponse(stub({ [SURVEY_RPC.mine]: { data: null, error: null } }).cloud),
    ).toEqual({
      ok: true,
      response: null,
    });
    const broken = await readMySurveyResponse(
      stub({
        [SURVEY_RPC.mine]: { data: { ...mine, answers: { ...ANSWERS, clarity: 9 } }, error: null },
      }).cloud,
    );
    expect(broken).toEqual({ ok: false, reason: 'unknown' });
  });

  it('borra la respuesta propia y dice si había algo', async () => {
    expect(
      await deleteMySurveyResponse(stub({ [SURVEY_RPC.erase]: { data: true, error: null } }).cloud),
    ).toEqual({
      ok: true,
      deleted: true,
    });
    expect(
      await deleteMySurveyResponse(
        stub({ [SURVEY_RPC.erase]: { data: false, error: null } }).cloud,
      ),
    ).toEqual({
      ok: true,
      deleted: false,
    });
    expect(await deleteMySurveyResponse(stub({ [SURVEY_RPC.erase]: 'throw' }).cloud)).toEqual({
      ok: false,
      reason: 'network',
    });
    expect(
      await deleteMySurveyResponse(stub({ [SURVEY_RPC.erase]: { data: 'sí', error: null } }).cloud),
    ).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });
});

describe('lo del equipo', () => {
  it('lee el resumen y traduce que no es admin', async () => {
    const summary = {
      eligible: 5,
      answered: 3,
      comments: 2,
      questions: { clarity: { '5': 1, '3': 2 } },
    };
    const ok = stub({ [SURVEY_RPC.summary]: { data: summary, error: null } });
    expect(await readSurveySummary(ok.cloud)).toEqual({ ok: true, summary });
    expect(ok.calls).toEqual([['rpc', 'admin_survey_summary', { p_survey_id: 'first-week-v1' }]]);
    expect(
      await readSurveySummary(stub({ [SURVEY_RPC.summary]: { error: { code: '42501' } } }).cloud),
    ).toEqual({ ok: false, reason: 'not_admin' });
    expect(await readSurveySummary(stub({ [SURVEY_RPC.summary]: 'throw' }).cloud)).toEqual({
      ok: false,
      reason: 'network',
    });
  });

  it('lee las respuestas por código, sin nada que diga de quién son', async () => {
    const rows = [
      { code: 'RA00002', answers: ANSWERS, comment: 'Algo' },
      { code: 'RB00003', answers: ANSWERS, comment: null },
    ];
    const ok = stub({ [SURVEY_RPC.responses]: { data: rows, error: null } });
    const result = await readSurveyResponses(ok.cloud);
    expect(result).toEqual({
      ok: true,
      rows: [
        { code: 'RA00002', answers: ANSWERS, comment: 'Algo' },
        { code: 'RB00003', answers: ANSWERS, comment: null },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /user_id|email|alias|created_at|days_since|daysSince/,
    );
    // Aunque un servidor viejo mandara los días de la cuenta, la app no los pasa a la tarjeta ni al CSV
    const withDays = stub({
      [SURVEY_RPC.responses]: {
        data: rows.map((row) => ({ ...row, days_since_signup: 9, user_id: 'u1' })),
        error: null,
      },
    });
    expect(await readSurveyResponses(withDays.cloud)).toEqual(result);
    expect(
      await readSurveyResponses(
        stub({ [SURVEY_RPC.responses]: { error: { code: '42501' } } }).cloud,
      ),
    ).toEqual({ ok: false, reason: 'not_admin' });
    expect(
      await readSurveyResponses(
        stub({ [SURVEY_RPC.responses]: { data: [{ code: 1 }], error: null } }).cloud,
      ),
    ).toEqual({ ok: false, reason: 'unknown' });
  });
});

describe('el ajuste', () => {
  it('es de fábrica con cualquier cosa que no sea un objeto', () => {
    for (const value of [null, undefined, 'true', 7, true, [1, 2]]) {
      expect(parseSurveySetting(value)).toEqual(DEFAULT_SURVEY_SETTING);
    }
    expect(DEFAULT_SURVEY_SETTING.enabled).toBe(false);
  });

  it('solo el booleano true la prende', () => {
    expect(parseSurveySetting({ enabled: true }).enabled).toBe(true);
    for (const enabled of ['true', 1, null, 'sí', {}]) {
      expect(parseSurveySetting({ enabled }).enabled).toBe(false);
    }
  });

  it('valida los días, el id y la fecha por separado y deja lo demás', () => {
    const base = {
      enabled: true,
      id: 'first-week-v1',
      delay_days: 3,
      accounts_until: '2026-12-01',
    };
    expect(parseSurveySetting(base)).toEqual({
      enabled: true,
      id: 'first-week-v1',
      delayDays: 3,
      accountsUntil: '2026-12-01',
    });
    for (const delay_days of [31, -1, 3.5, '3', null]) {
      expect(parseSurveySetting({ ...base, delay_days }).delayDays).toBe(7);
    }
    for (const delay_days of [0, 30]) {
      expect(parseSurveySetting({ ...base, delay_days }).delayDays).toBe(delay_days);
    }
    for (const id of ['Mala Id', 'ab', 5, null]) {
      expect(parseSurveySetting({ ...base, id }).id).toBe('first-week-v1');
    }
    for (const accounts_until of [
      'ayer',
      '2026-13-45',
      '2026-02-30',
      20261201,
      '2026-12-01T10:00',
      null,
    ]) {
      expect(parseSurveySetting({ ...base, accounts_until }).accountsUntil).toBeNull();
    }
    expect(parseSurveySetting({ ...base, delay_days: 99 }).accountsUntil).toBe('2026-12-01');
  });

  it('un id que la base no conoce usa el de fábrica, aunque tenga buena forma, para que la franja no quede imposible de contestar', () => {
    for (const id of ['first-week-v2', 'first-week-v10', 'otra-encuesta', 'First-Week-V1']) {
      expect(parseSurveySetting({ enabled: true, id, delay_days: 7 })).toMatchObject({
        enabled: true,
        id: 'first-week-v1',
      });
    }
    // Y el que se guarda desde la tarjeta es siempre uno conocido
    expect(KNOWN_SURVEY_IDS).toContain(parseSurveySetting({ id: 'first-week-v2' }).id);
    expect(KNOWN_SURVEY_IDS).toContain(DEFAULT_SURVEY_SETTING.id);
  });

  it('una fecha de calendario existe de verdad', () => {
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2027-02-29')).toBe(false);
    expect(isCalendarDate('2026-1-1')).toBe(false);
  });

  it('se guarda como lo lee la base', () => {
    expect(
      surveySettingValue({ enabled: true, id: 'first-week-v1', delayDays: 0, accountsUntil: null }),
    ).toEqual({
      enabled: true,
      id: 'first-week-v1',
      delay_days: 0,
      accounts_until: null,
    });
  });

  it('lee el ajuste de platform_settings y escribe el nuevo', async () => {
    const read = stub({
      'platform_settings.select': {
        data: {
          value: { enabled: true, id: 'first-week-v1', delay_days: 0, accounts_until: null },
        },
        error: null,
      },
    });
    expect(await readSurveySetting(read.cloud)).toEqual({
      enabled: true,
      id: 'first-week-v1',
      delayDays: 0,
      accountsUntil: null,
    });
    expect(read.calls).toEqual([['platform_settings', 'select', 'key', 'survey_first_week']]);
    // Sin la clave, el de fábrica. Con un error, null
    expect(await readSurveySetting(stub({}).cloud)).toEqual(DEFAULT_SURVEY_SETTING);
    expect(
      await readSurveySetting(stub({ 'platform_settings.select': { error: { code: 'X' } } }).cloud),
    ).toBeNull();

    const write = stub({});
    expect(
      await writeSurveySetting(write.cloud, {
        enabled: true,
        id: 'first-week-v1',
        delayDays: 7,
        accountsUntil: '2026-12-01',
      }),
    ).toBe(true);
    const [, , row] = write.calls[0] ?? [];
    expect(row).toMatchObject({
      key: 'survey_first_week',
      value: { enabled: true, id: 'first-week-v1', delay_days: 7, accounts_until: '2026-12-01' },
    });
    expect(
      await writeSurveySetting(
        stub({ 'platform_settings.upsert': { error: { code: '42501' } } }).cloud,
        DEFAULT_SURVEY_SETTING,
      ),
    ).toBe(false);
    expect(
      await writeSurveySetting(
        stub({ 'platform_settings.upsert': 'throw' }).cloud,
        DEFAULT_SURVEY_SETTING,
      ),
    ).toBe(false);
  });
});
