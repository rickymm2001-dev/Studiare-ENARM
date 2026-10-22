// Restablecer el segundo factor (B9). La función revisa con la base que quien pide sea el dueño y solo
// entonces borra los factores con la API de administración de Auth.
import { describe, expect, it } from 'vitest';
import {
  authorizeViaRest,
  deleteFactorViaRest,
  handleResetMfa,
  listFactorsViaRest,
  type AuthorizeOutcome,
  type MfaResetDeps,
} from './mfaReset.ts';

const APP = 'https://app.studiare.example';
const TARGET = '3f9c1c2e-5b7a-4a52-9d1e-0a1b2c3d4e5f';
const env = {
  url: 'https://proyecto.supabase.co',
  anonKey: 'anon-de-prueba',
  serviceKey: 'servicio-de-prueba',
};

function deps(outcome: AuthorizeOutcome | Error, factors: string[] | Error = ['f1', 'f2']) {
  const calls = {
    authorize: [] as [string, string][],
    deleted: [] as [string, string][],
    logs: [] as string[],
  };
  const value: MfaResetDeps = {
    appUrl: APP,
    authorize: (authorization, target) => {
      calls.authorize.push([authorization, target]);
      return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
    },
    listFactors: () =>
      factors instanceof Error ? Promise.reject(factors) : Promise.resolve(factors),
    deleteFactor: (userId, factorId) => {
      calls.deleted.push([userId, factorId]);
      return Promise.resolve();
    },
    log: (line) => {
      calls.logs.push(line);
    },
  };
  return { value, calls };
}

const post = (body: unknown, authorization = 'Bearer token-del-dueno') =>
  new Request('https://proyecto.supabase.co/functions/v1/admin-reset-mfa', {
    method: 'POST',
    headers: { authorization, origin: APP, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('admin-reset-mfa', () => {
  it('con el permiso del dueño borra cada factor de la cuenta y dice cuántos', async () => {
    const { value, calls } = deps('ok');
    const reply = await handleResetMfa(post({ userId: TARGET }), value);
    expect(reply.status).toBe(200);
    expect(await reply.json()).toEqual({ removed: 2 });
    expect(calls.authorize).toEqual([['Bearer token-del-dueno', TARGET]]);
    expect(calls.deleted).toEqual([
      [TARGET, 'f1'],
      [TARGET, 'f2'],
    ]);
    expect(reply.headers.get('access-control-allow-origin')).toBe(APP);
  });

  it('si la base no da permiso no toca ningún factor', async () => {
    for (const [outcome, status, error] of [
      ['not_owner', 403, 'not_owner'],
      ['self', 403, 'self'],
      ['not_found', 404, 'not_found'],
      ['no_session', 401, 'unauthorized'],
    ] as const) {
      const { value, calls } = deps(outcome);
      const reply = await handleResetMfa(post({ userId: TARGET }), value);
      expect(reply.status, outcome).toBe(status);
      expect(await reply.json()).toEqual({ error });
      expect(calls.deleted).toEqual([]);
    }
  });

  it('sin token, con un id raro o con otro método ni pregunta a la base', async () => {
    const noToken = deps('ok');
    expect((await handleResetMfa(post({ userId: TARGET }, ''), noToken.value)).status).toBe(401);
    const badId = deps('ok');
    expect((await handleResetMfa(post({ userId: 'todos' }), badId.value)).status).toBe(400);
    expect((await handleResetMfa(post(null), badId.value)).status).toBe(400);
    const method = deps('ok');
    const get = new Request('https://proyecto.supabase.co/functions/v1/admin-reset-mfa');
    expect((await handleResetMfa(get, method.value)).status).toBe(405);
    for (const used of [noToken, badId, method]) expect(used.calls.authorize).toEqual([]);
    const preflight = new Request('https://proyecto.supabase.co/functions/v1/admin-reset-mfa', {
      method: 'OPTIONS',
      headers: { origin: APP },
    });
    expect((await handleResetMfa(preflight, method.value)).status).toBe(204);
  });

  it('si Auth falla responde failed y deja en el registro solo qué paso falló', async () => {
    const { value, calls } = deps('ok', new Error('la lista de factores respondió 500'));
    const reply = await handleResetMfa(post({ userId: TARGET }), value);
    expect(reply.status).toBe(502);
    expect(await reply.json()).toEqual({ error: 'failed' });
    expect(calls.logs).toHaveLength(1);
    expect(calls.logs[0]).not.toContain(TARGET);
    expect(calls.logs[0]).not.toContain('token');
  });
});

describe('admin-reset-mfa por REST', () => {
  function recorder(reply: () => Response) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = ((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(reply());
    }) as typeof fetch;
    return { calls, fetchImpl };
  }

  it('pregunta a authorize_mfa_reset con la sesión de quien pide y la llave pública', async () => {
    const { calls, fetchImpl } = recorder(() => new Response(null, { status: 204 }));
    expect(await authorizeViaRest(env, 'Bearer token-del-dueno', TARGET, fetchImpl)).toBe('ok');
    expect(calls[0]?.url).toBe('https://proyecto.supabase.co/rest/v1/rpc/authorize_mfa_reset');
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get('apikey')).toBe('anon-de-prueba');
    // Nunca la llave de servicio para decidir quién es quien pide
    expect(headers.get('authorization')).toBe('Bearer token-del-dueno');
    const body = calls[0]?.init?.body;
    expect(JSON.parse(typeof body === 'string' ? body : '')).toEqual({ p_target: TARGET });
  });

  it('traduce los rechazos de la base', async () => {
    const answer = (status: number, body: unknown) =>
      authorizeViaRest(
        env,
        'Bearer x',
        TARGET,
        recorder(() => new Response(JSON.stringify(body), { status })).fetchImpl,
      );
    expect(
      await answer(403, { code: '42501', message: 'Solo el dueño restablece el segundo factor' }),
    ).toBe('not_owner');
    expect(
      await answer(403, {
        code: '42501',
        message: 'El dueño no restablece su propio segundo factor desde la app',
      }),
    ).toBe('self');
    expect(await answer(404, { code: 'P0002', message: 'No existe esa cuenta' })).toBe('not_found');
    expect(await answer(403, { code: '28000', message: 'Hace falta iniciar sesión' })).toBe(
      'no_session',
    );
    expect(await answer(401, { message: 'JWT expired' })).toBe('no_session');
    await expect(answer(500, { message: 'boom' })).rejects.toThrow('500');
  });

  it('lista y borra factores con la llave de servicio en la API de administración', async () => {
    const list = recorder(
      () => new Response(JSON.stringify([{ id: 'f1', factor_type: 'totp' }, { id: '' }, null])),
    );
    expect(await listFactorsViaRest(env, TARGET, list.fetchImpl)).toEqual(['f1']);
    expect(list.calls[0]?.url).toBe(
      `https://proyecto.supabase.co/auth/v1/admin/users/${TARGET}/factors`,
    );
    expect(new Headers(list.calls[0]?.init?.headers).get('authorization')).toBe(
      'Bearer servicio-de-prueba',
    );

    const remove = recorder(() => new Response(null, { status: 200 }));
    await deleteFactorViaRest(env, TARGET, 'f1', remove.fetchImpl);
    expect(remove.calls[0]?.url).toBe(
      `https://proyecto.supabase.co/auth/v1/admin/users/${TARGET}/factors/f1`,
    );
    expect(remove.calls[0]?.init?.method).toBe('DELETE');
    // Un factor que ya no existe no es un error
    await deleteFactorViaRest(
      env,
      TARGET,
      'f2',
      recorder(() => new Response(null, { status: 404 })).fetchImpl,
    );
    await expect(
      deleteFactorViaRest(
        env,
        TARGET,
        'f3',
        recorder(() => new Response(null, { status: 500 })).fetchImpl,
      ),
    ).rejects.toThrow('500');
    await expect(
      listFactorsViaRest(env, TARGET, recorder(() => new Response('{}')).fetchImpl),
    ).rejects.toThrow('no es una lista');
  });
  it('con la llave nueva (sb_secret_) la API de administración la recibe solo en apikey', async () => {
    const newEnv = {
      url: 'https://proyecto.supabase.co',
      anonKey: 'sb_publishable_' + 'simulada_para_pruebas_0123456789',
      serviceKey: 'sb_secret_' + 'simulada_para_pruebas_0123456789',
    };
    const list = recorder(() => new Response(JSON.stringify([{ id: 'f1' }])));
    expect(await listFactorsViaRest(newEnv, TARGET, list.fetchImpl)).toEqual(['f1']);
    const remove = recorder(() => new Response(null, { status: 200 }));
    await deleteFactorViaRest(newEnv, TARGET, 'f1', remove.fetchImpl);
    for (const call of [list.calls[0], remove.calls[0]]) {
      const headers = new Headers(call?.init?.headers);
      expect(headers.get('apikey')).toBe(newEnv.serviceKey);
      expect(headers.has('authorization')).toBe(false);
    }
    // Quien pide sigue con su sesión y la llave pública nueva, nunca la de servicio
    const authorize = recorder(() => new Response(null, { status: 204 }));
    expect(
      await authorizeViaRest(newEnv, 'Bearer token-del-dueno', TARGET, authorize.fetchImpl),
    ).toBe('ok');
    const headers = new Headers(authorize.calls[0]?.init?.headers);
    expect(headers.get('apikey')).toBe(newEnv.anonKey);
    expect(headers.get('authorization')).toBe('Bearer token-del-dueno');
  });
});
