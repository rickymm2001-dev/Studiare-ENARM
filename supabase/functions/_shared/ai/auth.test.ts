import { describe, expect, it } from 'vitest';
import { bearerToken, createSupabaseWhoAmI, identifyWith } from './auth.ts';
import { createFakeSupabaseRest, type FakeAccount } from './testing/fakeSupabaseRest.ts';
import { createMemoryAi } from './testing/memory.ts';

const USER = 'f0000000-0000-4000-8000-000000000001';

function whoami(accounts: Record<string, FakeAccount | 'expired'>) {
  let now = 0;
  const rest = createFakeSupabaseRest({ memory: createMemoryAi(), accounts });
  const check = createSupabaseWhoAmI({
    url: rest.url,
    anonKey: rest.anonKey,
    fetchImpl: rest.fetch,
    clock: () => now,
  });
  return {
    rest,
    check,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('bearerToken', () => {
  it('saca el token del encabezado y rechaza cualquier otra forma', () => {
    expect(bearerToken('Bearer abc.def-ghi_jkl')).toBe('abc.def-ghi_jkl');
    expect(bearerToken('  Bearer   abc  ')).toBe('abc');
    for (const header of [undefined, '', 'Basic abc', 'Bearer', 'Bearer a b', 'bearer abc"']) {
      expect(bearerToken(header), String(header)).toBeNull();
    }
  });
});

describe('ai_whoami', () => {
  it('un alumno de pago, un médico y un dueño, con su rol y su plan', async () => {
    const { check } = whoami({
      pago: { userId: USER, role: 'student', paid: true },
      medico: { userId: USER, role: 'physician', paid: false },
    });
    expect(await check('pago')).toEqual({
      ok: true,
      caller: { userId: USER, role: 'student', paid: true },
    });
    expect(await check('medico')).toMatchObject({
      ok: true,
      caller: { role: 'physician', paid: false },
    });
  });

  it('vencido, otro dispositivo y Supabase caído se dicen distinto', async () => {
    const { rest, check } = whoami({
      vencido: 'expired',
      otro: { userId: USER, role: 'student', paid: true, device: 'other' },
      pago: { userId: USER, role: 'student', paid: true },
    });
    expect(await check('vencido')).toEqual({ ok: false, failure: 'unauthenticated' });
    expect(await check('nadie')).toEqual({ ok: false, failure: 'unauthenticated' });
    expect(await check('otro')).toEqual({ ok: false, failure: 'other_device' });
    rest.down = true;
    expect(await check('pago')).toEqual({ ok: false, failure: 'unavailable' });
  });

  it('la llave pública como token, de una sesión cerrada, es una sesión vencida y no otro dispositivo (revisión del hallazgo 6)', async () => {
    // supabase-js manda la llave pública como Bearer cuando no hay sesión, y PostgREST contesta 401 con
    // 42501 porque el rol anon no ejecuta ai_whoami
    const { rest, check } = whoami({});
    expect(await check(rest.anonKey)).toEqual({ ok: false, failure: 'unauthenticated' });
    const identify = identifyWith(check);
    expect(await identify(`Bearer ${rest.anonKey}`)).toEqual({
      ok: false,
      failure: 'unauthenticated',
    });
  });

  it('42501 solo es otro dispositivo con estado 403, y cada estado y código se lee por separado', async () => {
    const answer = (status: number, code: string) => {
      const check = createSupabaseWhoAmI({
        url: 'https://simulado.supabase.co',
        anonKey: 'llave-publica-simulada-0000000000',
        fetchImpl: () => Promise.resolve(Response.json({ code, message: 'error' }, { status })),
      });
      return check('token');
    };
    expect(await answer(403, '42501')).toEqual({ ok: false, failure: 'other_device' });
    expect(await answer(401, '42501')).toEqual({ ok: false, failure: 'unauthenticated' });
    expect(await answer(401, 'PGRST301')).toEqual({ ok: false, failure: 'unauthenticated' });
    expect(await answer(403, '28000')).toEqual({ ok: false, failure: 'unauthenticated' });
    expect(await answer(400, '28000')).toEqual({ ok: false, failure: 'unauthenticated' });
    // Un 42501 con otro estado, o un 403 con otro código, no es un dispositivo desplazado
    expect(await answer(500, '42501')).toEqual({ ok: false, failure: 'unavailable' });
    expect(await answer(400, '42501')).toEqual({ ok: false, failure: 'unavailable' });
    expect(await answer(403, 'PGRST301')).toEqual({ ok: false, failure: 'unavailable' });
    expect(await answer(404, 'PGRST202')).toEqual({ ok: false, failure: 'unavailable' });
  });

  it('una respuesta con otra forma no deja entrar', async () => {
    const rest = createFakeSupabaseRest({ memory: createMemoryAi() });
    const odd = createSupabaseWhoAmI({
      url: rest.url,
      anonKey: rest.anonKey,
      fetchImpl: () =>
        Promise.resolve(Response.json({ userId: USER, role: 'superadmin', paid: true })),
    });
    expect(await odd('pago')).toEqual({ ok: false, failure: 'unavailable' });
  });

  it('recuerda 30 s una sesión buena y nunca una falla', async () => {
    const accounts: Record<string, FakeAccount | 'expired'> = {
      pago: { userId: USER, role: 'student', paid: true, device: 'other' },
    };
    const { rest, check, advance } = whoami(accounts);
    const asks = () => rest.calls.length;
    expect(await check('pago')).toMatchObject({ failure: 'other_device' });
    rest.accounts.pago = { userId: USER, role: 'student', paid: true };
    expect(await check('pago')).toMatchObject({ ok: true });
    expect(await check('pago')).toMatchObject({ ok: true });
    expect(asks()).toBe(2);
    advance(30_001);
    rest.accounts.pago = 'expired';
    expect(await check('pago')).toMatchObject({ failure: 'unauthenticated' });
    expect(asks()).toBe(3);
  });

  it('identify sin encabezado Bearer es una sesión vencida y no pregunta', async () => {
    const { rest, check } = whoami({});
    const identify = identifyWith(check);
    expect(await identify(undefined)).toEqual({ ok: false, failure: 'unauthenticated' });
    expect(await identify('Basic x')).toEqual({ ok: false, failure: 'unauthenticated' });
    expect(rest.calls).toHaveLength(0);
  });
});
