import { describe, expect, it, vi } from 'vitest';
import { hypothesisInput } from '../../../src/ai/testing/aiSamples.ts';
import { ACADEMIC_SOURCE_KEYS } from '../../../src/config/academicSources.ts';
import { DEFAULT_CONFIG, type AiConfig } from '../ai/config.ts';
import type { Admission, LedgerPort, Settlement } from '../ai/ledger.ts';
import { PgLedger, createRestRpc } from '../ai/pgLedger.ts';
import { loadPrompts } from '../ai/prompts.ts';
import { createMockProvider } from '../ai/provider.ts';
import { ROOT_PROMPTS_DIR, SERVER_PROMPTS_DIR } from '../ai/index.ts';
import { requestBody, STUDENT } from '../ai/testing/fakes.ts';
import { createHostedApp } from './app.ts';
import {
  bearerToken,
  createSupabaseAuthenticator,
  type Authenticate,
  type CloudUser,
} from './auth.ts';
import { createRestConfigStore } from './configStore.ts';
import { readHostedEnv } from './env.ts';

const URL_ = 'https://abcd1234.supabase.co';
const urlOf = (input: string | URL | Request) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
const ANON = 'anon-key-publica-0123456789';
const SERVICE = 'service-key-secreta-0123456789';
const ORIGIN = 'https://rickymm2001-dev.github.io';
const USER_ID = '6f1c0f1e-6b4a-4d2a-9d55-6f2f3f6a1b10';

// ------------------------------------------------------------------ Supabase falso
interface FakeSupabase {
  fetch: typeof fetch;
  calls: { path: string; headers: Record<string, string> }[];
}

function fakeSupabase(
  options: {
    userStatus?: number;
    plan?: string | { status: number; body: unknown };
    roleRows?: unknown;
    roleStatus?: number;
  } = {},
): FakeSupabase {
  const calls: FakeSupabase['calls'] = [];
  const respond = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const impl = (input: string | URL | Request, init?: RequestInit) => {
    const path = urlOf(input).replace(URL_, '');
    calls.push({ path, headers: { ...(init?.headers as Record<string, string>) } });
    if (path === '/auth/v1/user') {
      return Promise.resolve(
        options.userStatus && options.userStatus !== 200
          ? respond(options.userStatus, { message: 'x' })
          : respond(200, { id: USER_ID, email: 'a@x.mx' }),
      );
    }
    if (path === '/rest/v1/rpc/my_plan') {
      const plan = options.plan ?? 'monthly';
      return Promise.resolve(
        typeof plan === 'string' ? respond(200, { plan }) : respond(plan.status, plan.body),
      );
    }
    if (path.startsWith('/rest/v1/user_roles')) {
      return Promise.resolve(
        respond(options.roleStatus ?? 200, options.roleRows ?? [{ role: 'student' }]),
      );
    }
    return Promise.resolve(respond(404, {}));
  };
  return { fetch: impl, calls };
}

const authenticator = (
  supabase: FakeSupabase,
  extra: { cacheMs?: number; now?: () => number } = {},
) => createSupabaseAuthenticator({ url: URL_, anonKey: ANON, fetchImpl: supabase.fetch, ...extra });

describe('bearerToken', () => {
  it('saca el token del encabezado y rechaza cualquier otra forma', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('bearer abc')).toBeNull();
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken('Bearer ')).toBeNull();
    expect(bearerToken('Bearer a b')).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });
});

describe('autenticación con Supabase', () => {
  it('un alumno de pago entra con su plan y su rol', async () => {
    const result = await authenticator(fakeSupabase({ plan: 'annual' }))('token-1');
    expect(result).toEqual({ ok: true, user: { id: USER_ID, role: 'student', plan: 'annual' } });
  });

  it('un médico se reconoce por su rol', async () => {
    const result = await authenticator(
      fakeSupabase({ plan: 'free', roleRows: [{ role: 'physician' }] }),
    )('token-1');
    expect(result).toEqual({ ok: true, user: { id: USER_ID, role: 'physician', plan: 'free' } });
  });

  it('sin fila de rol, o con un rol que no se reconoce, es alumno', async () => {
    for (const roleRows of [[], [{ role: 'superusuario' }], 'raro']) {
      const result = await authenticator(fakeSupabase({ roleRows }))('token-1');
      expect(result).toMatchObject({ ok: true, user: { role: 'student' } });
    }
  });

  it('pide todo con el token del alumno y la llave pública, nunca otra', async () => {
    const supabase = fakeSupabase();
    await authenticator(supabase)('token-del-alumno');
    expect(supabase.calls.map((call) => call.path.split('?')[0])).toEqual(
      expect.arrayContaining(['/auth/v1/user', '/rest/v1/rpc/my_plan', '/rest/v1/user_roles']),
    );
    for (const call of supabase.calls) {
      expect(call.headers.apikey).toBe(ANON);
      expect(call.headers.authorization).toBe('Bearer token-del-alumno');
    }
  });

  it('un token vencido o falso no entra', async () => {
    for (const userStatus of [401, 403]) {
      expect(await authenticator(fakeSupabase({ userStatus }))('malo')).toEqual({
        ok: false,
        failure: 'unauthenticated',
      });
    }
  });

  it('la barrera del dispositivo único se vuelve other_device', async () => {
    const byStatus = await authenticator(
      fakeSupabase({ plan: { status: 403, body: { code: '42501', message: 'x' } } }),
    )('t');
    const byCode = await authenticator(
      fakeSupabase({ plan: { status: 400, body: { code: '42501' } } }),
    )('t');
    expect(byStatus).toEqual({ ok: false, failure: 'other_device' });
    expect(byCode).toEqual({ ok: false, failure: 'other_device' });
  });

  it('si Supabase falla no deja entrar y dice que no está disponible', async () => {
    expect(await authenticator(fakeSupabase({ userStatus: 500 }))('t')).toEqual({
      ok: false,
      failure: 'unavailable',
    });
    expect(await authenticator(fakeSupabase({ plan: { status: 500, body: {} } }))('t')).toEqual({
      ok: false,
      failure: 'unavailable',
    });
    const broken = createSupabaseAuthenticator({
      url: URL_,
      anonKey: ANON,
      fetchImpl: () => Promise.reject(new Error('sin red')),
    });
    expect(await broken('t')).toEqual({ ok: false, failure: 'unavailable' });
  });

  it('recuerda un token ya verificado un rato, y vuelve a preguntar cuando se acaba', async () => {
    const supabase = fakeSupabase();
    let now = 1_000;
    const authenticate = authenticator(supabase, { cacheMs: 30_000, now: () => now });
    await authenticate('t');
    const first = supabase.calls.length;
    await authenticate('t');
    expect(supabase.calls.length).toBe(first);
    now += 31_000;
    await authenticate('t');
    expect(supabase.calls.length).toBeGreaterThan(first);
  });

  it('no recuerda una falla, así que un cambio de dispositivo se nota enseguida', async () => {
    let status = 403;
    const authenticate = createSupabaseAuthenticator({
      url: URL_,
      anonKey: ANON,
      fetchImpl: (input: string | URL | Request) => {
        const path = urlOf(input).replace(URL_, '');
        if (path === '/auth/v1/user') return Promise.resolve(Response.json({ id: USER_ID }));
        if (path.startsWith('/rest/v1/user_roles')) return Promise.resolve(Response.json([]));
        return Promise.resolve(
          status === 403
            ? Response.json({ code: '42501' }, { status: 403 })
            : Response.json({ plan: 'monthly' }),
        );
      },
    });
    expect(await authenticate('t')).toEqual({ ok: false, failure: 'other_device' });
    status = 200;
    expect(await authenticate('t')).toMatchObject({ ok: true });
  });
});

// ------------------------------------------------------------------ Aplicación alojada
class FakeLedger implements LedgerPort {
  admits: { studentRef: string; engine: string }[] = [];
  settles: Settlement[] = [];
  releases: { studentRef: string; engine: string }[] = [];
  admission: Admission = { ok: true };
  admit(input: { studentRef: string; engine: string }) {
    this.admits.push({ studentRef: input.studentRef, engine: input.engine });
    return Promise.resolve(this.admission);
  }
  settle(input: Settlement) {
    this.settles.push(input);
    return Promise.resolve();
  }
  release(input: { studentRef: string; engine: string }) {
    this.releases.push(input);
    return Promise.resolve();
  }
  summary() {
    return Promise.resolve({
      day: '2026-10-10',
      calls: 3,
      students: 2,
      spentUsd: 0.5,
      byEngine: {},
    });
  }
}

function hostedApp(
  user: CloudUser | { failure: 'unauthenticated' | 'other_device' | 'unavailable' },
  extra: { ledger?: FakeLedger; saved?: AiConfig[] } = {},
) {
  const ledger = extra.ledger ?? new FakeLedger();
  let config = DEFAULT_CONFIG;
  const authenticate: Authenticate = (token) =>
    Promise.resolve(
      token === 'valido'
        ? 'failure' in user
          ? { ok: false, failure: user.failure }
          : { ok: true, user }
        : { ok: false, failure: 'unauthenticated' },
    );
  const app = createHostedApp({
    mode: 'mock',
    authenticate,
    origins: new Set([ORIGIN]),
    ai: {
      provider: createMockProvider(),
      prompts: loadPrompts({
        serverPromptsDir: SERVER_PROMPTS_DIR,
        rootPromptsDir: ROOT_PROMPTS_DIR,
      }),
      config: () => config,
      setConfig: (next) => {
        config = next;
      },
      configFile: null,
      saveConfig: (next) => {
        extra.saved?.push(next);
        return Promise.resolve();
      },
      ledger,
      sourceKeys: new Set<string>(ACADEMIC_SOURCE_KEYS),
    },
  });
  return { app, ledger };
}

const student = (plan: CloudUser['plan']): CloudUser => ({ id: USER_ID, role: 'student', plan });
const headers = (extra: Record<string, string> = {}) => ({
  authorization: 'Bearer valido',
  'content-type': 'application/json',
  origin: ORIGIN,
  ...extra,
});
const post = (
  app: ReturnType<typeof hostedApp>['app'],
  engine = 'forgetting',
  init: RequestInit = {},
) =>
  app.request(`/ai/${engine}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(requestBody(hypothesisInput())),
    ...init,
  });

describe('proxy alojado', () => {
  it('/health es público y dice el modo', async () => {
    const { app } = hostedApp(student('free'));
    const response = await app.request('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', mode: 'mock' });
  });

  it('sin sesión, con un token falso o con el encabezado mal puesto no atiende', async () => {
    const { app, ledger } = hostedApp(student('annual'));
    const withoutAuth = { 'content-type': 'application/json', origin: ORIGIN };
    const variants: Record<string, string>[] = [
      {},
      { authorization: 'Bearer falso' },
      { authorization: 'Basic valido' },
    ];
    for (const extra of variants) {
      const response = await post(app, 'forgetting', { headers: { ...withoutAuth, ...extra } });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: 'unauthorized' });
    }
    expect(ledger.admits).toEqual([]);
  });

  it('un alumno de pago usa la IA y el alumno de la llamada es su cuenta, no el sobre', async () => {
    const { app, ledger } = hostedApp(student('monthly'));
    const response = await post(app);
    expect(response.status).toBe(200);
    expect(ledger.admits).toEqual([{ studentRef: USER_ID, engine: 'forgetting' }]);
    expect(ledger.admits[0]?.studentRef).not.toBe(STUDENT);
    expect(ledger.settles[0]).toMatchObject({
      studentRef: USER_ID,
      engine: 'forgetting',
      ok: true,
    });
  });

  it('un alumno del plan Gratis no usa la IA y no gasta cupo', async () => {
    const { app, ledger } = hostedApp(student('free'));
    const response = await post(app);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'plan_required' });
    expect(ledger.admits).toEqual([]);
  });

  it('un médico y un admin usan la IA aunque su plan sea Gratis', async () => {
    for (const role of ['physician', 'admin', 'owner'] as const) {
      const { app } = hostedApp({ id: USER_ID, role, plan: 'free' });
      expect(
        (
          await post(app, 'restructure', {
            body: JSON.stringify(requestBody(hypothesisInput())),
          })
        ).status,
      ).not.toBe(403);
    }
  });

  it('la cuenta activa en otro dispositivo y la caída de Supabase se dicen distinto', async () => {
    const other = await post(hostedApp({ failure: 'other_device' }).app);
    expect(other.status).toBe(403);
    expect(((await other.json()) as { message: string }).message).toMatch(/otro dispositivo/);
    const down = await post(hostedApp({ failure: 'unavailable' }).app);
    expect(down.status).toBe(503);
  });

  it('la configuración y el gasto son del admin y del dueño', async () => {
    for (const path of ['/ai/config', '/ai/usage']) {
      const denied = await hostedApp(student('annual')).app.request(path, { headers: headers() });
      expect(denied.status).toBe(403);
      const physician = await hostedApp({
        id: USER_ID,
        role: 'physician',
        plan: 'free',
      }).app.request(path, {
        headers: headers(),
      });
      expect(physician.status).toBe(403);
      for (const role of ['admin', 'owner'] as const) {
        const allowed = await hostedApp({ id: USER_ID, role, plan: 'free' }).app.request(path, {
          headers: headers(),
        });
        expect(allowed.status).toBe(200);
      }
    }
  });

  it('el admin cambia la configuración y se guarda en la base, no en un archivo', async () => {
    const saved: AiConfig[] = [];
    const { app } = hostedApp({ id: USER_ID, role: 'admin', plan: 'free' }, { saved });
    const response = await app.request('/ai/config', {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ limits: { dailyBudgetUsd: 12 } }),
    });
    expect(response.status).toBe(200);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.limits.dailyBudgetUsd).toBe(12);
    const student_ = await hostedApp(student('annual')).app.request('/ai/config', {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ limits: { dailyBudgetUsd: 99999 } }),
    });
    expect(student_.status).toBe(403);
  });

  it('el uso del día sale del libro de Postgres', async () => {
    const { app } = hostedApp({ id: USER_ID, role: 'admin', plan: 'free' });
    const response = await app.request('/ai/usage', { headers: headers() });
    expect(await response.json()).toMatchObject({
      usage: { calls: 3, students: 2, spentUsd: 0.5 },
    });
  });

  it('solo deja llamar desde la app publicada y contesta el preflight', async () => {
    const { app } = hostedApp(student('annual'));
    const evil = await post(app, 'forgetting', {
      headers: headers({ origin: 'https://malo.com' }),
    });
    expect(evil.status).toBe(403);
    expect(await evil.json()).toEqual({ error: 'origin_not_allowed' });

    const preflight = await app.request('/ai/forgetting', {
      method: 'OPTIONS',
      headers: { origin: ORIGIN, 'access-control-request-method': 'POST' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(preflight.headers.get('access-control-allow-headers')).toContain('authorization');

    const ok = await post(app);
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(ok.headers.get('vary')).toContain('Origin');
  });

  it('exige JSON, limita el tamaño y no devuelve detalles de un error', async () => {
    const { app } = hostedApp(student('annual'));
    const text = await post(app, 'forgetting', {
      headers: headers({ 'content-type': 'text/plain' }),
    });
    expect(text.status).toBe(415);
    const big = await post(app, 'forgetting', { body: 'x'.repeat(70_000) });
    expect(big.status).toBe(413);
    const unknown = await post(app, 'chat_libre');
    expect(unknown.status).toBe(404);
  });

  it('si el libro falla antes de pedir al modelo, el servidor contesta 500 sin detalles', async () => {
    const ledger = new FakeLedger();
    ledger.admit = () => Promise.reject(new Error('postgres dijo algo con datos'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app } = hostedApp(student('annual'), { ledger });
    const response = await post(app);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('postgres');
    spy.mockRestore();
  });

  it('el límite del alumno y el presupuesto salen con su mensaje', async () => {
    const ledger = new FakeLedger();
    ledger.admission = { ok: false, reason: 'student_limit' };
    const { app } = hostedApp(student('annual'), { ledger });
    const response = await post(app);
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: 'student_limit' });
  });
});

// ------------------------------------------------------------------ Libro en Postgres
describe('PgLedger', () => {
  it('admite, devuelve, asienta y resume llamando a las funciones del libro', async () => {
    const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<unknown>>();
    const ledger = new PgLedger(rpc);

    rpc.mockResolvedValueOnce('ok');
    expect(
      await ledger.admit({
        studentRef: USER_ID,
        engine: 'forgetting',
        perStudentPerDay: 12,
        dailyBudgetUsd: 5,
      }),
    ).toEqual({ ok: true });
    expect(rpc).toHaveBeenLastCalledWith('ai_admit', {
      p_user: USER_ID,
      p_engine: 'forgetting',
      p_per_student: 12,
      p_budget: 5,
    });

    rpc.mockResolvedValueOnce('student_limit');
    expect(
      await ledger.admit({
        studentRef: USER_ID,
        engine: 'forgetting',
        perStudentPerDay: 1,
        dailyBudgetUsd: 5,
      }),
    ).toEqual({ ok: false, reason: 'student_limit' });
    rpc.mockResolvedValueOnce('budget_exceeded');
    expect(
      await ledger.admit({
        studentRef: USER_ID,
        engine: 'forgetting',
        perStudentPerDay: 1,
        dailyBudgetUsd: 5,
      }),
    ).toEqual({ ok: false, reason: 'budget_exceeded' });

    rpc.mockResolvedValueOnce(null);
    await ledger.release({ studentRef: USER_ID, engine: 'bias_tips' });
    expect(rpc).toHaveBeenLastCalledWith('ai_release', { p_user: USER_ID, p_engine: 'bias_tips' });

    rpc.mockResolvedValueOnce(null);
    await ledger.settle({
      studentRef: USER_ID,
      engine: 'flashcards',
      costUsd: 0.04,
      real: true,
      model: 'claude-sonnet-5-5',
      ok: false,
      inputTokens: 1200,
      outputTokens: 300,
      latencyMs: 812.6,
    });
    expect(rpc).toHaveBeenLastCalledWith('ai_settle', {
      p_user: USER_ID,
      p_engine: 'flashcards',
      p_model: 'claude-sonnet-5-5',
      p_real: true,
      p_ok: false,
      p_cost: 0.04,
      p_input: 1200,
      p_output: 300,
      p_latency: 813,
    });

    rpc.mockResolvedValueOnce({
      day: '2026-10-10',
      calls: 4,
      students: 2,
      spentUsd: 1.5,
      byEngine: { forgetting: { calls: 4, costUsd: 1.5 } },
    });
    expect(await ledger.summary()).toMatchObject({ calls: 4, spentUsd: 1.5 });
  });

  it('rechaza un alumno que no es un ID de cuenta y una respuesta que no entiende', async () => {
    const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<unknown>>();
    const ledger = new PgLedger(rpc);
    await expect(
      ledger.admit({
        studentRef: STUDENT,
        engine: 'forgetting',
        perStudentPerDay: 1,
        dailyBudgetUsd: 1,
      }),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce('quién sabe');
    await expect(
      ledger.admit({
        studentRef: USER_ID,
        engine: 'forgetting',
        perStudentPerDay: 1,
        dailyBudgetUsd: 1,
      }),
    ).rejects.toThrow();
  });
});

describe('createRestRpc', () => {
  it('llama a la función con la llave de servicio y lee un resultado vacío', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('', { status: 200 })));
    const rpc = createRestRpc({
      url: URL_,
      serviceKey: SERVICE,
      fetchImpl: fetchImpl,
    });
    expect(await rpc('ai_release', { p_user: USER_ID })).toBeNull();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${URL_}/rest/v1/rpc/ai_release`);
    expect(init.headers).toMatchObject({ apikey: SERVICE, authorization: `Bearer ${SERVICE}` });
  });

  it('un error no vuelca el cuerpo de la respuesta', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response('{"message":"dato del alumno"}', { status: 500 })),
    );
    const rpc = createRestRpc({
      url: URL_,
      serviceKey: SERVICE,
      fetchImpl: fetchImpl,
    });
    const error = await rpc('ai_admit', {}).catch((caught: unknown) => caught as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('alumno');
  });
});

// ------------------------------------------------------------------ Configuración guardada
describe('createRestConfigStore', () => {
  const store = (fetchImpl: typeof fetch) =>
    createRestConfigStore({ url: URL_, serviceKey: SERVICE, fetchImpl });

  it('sin fila usa la de fábrica y con una fila la mezcla', async () => {
    expect(await store(() => Promise.resolve(Response.json([]))).load()).toEqual(DEFAULT_CONFIG);
    const saved = { limits: { dailyBudgetUsd: 20 } };
    const config = await store(() => Promise.resolve(Response.json([{ value: saved }]))).load();
    expect(config.limits.dailyBudgetUsd).toBe(20);
    expect(config.models).toEqual(DEFAULT_CONFIG.models);
  });

  it('una fila dañada no frena el arranque', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const config = await store(() =>
      Promise.resolve(Response.json([{ value: { limits: { dailyBudgetUsd: -5 } } }])),
    ).load();
    expect(config).toEqual(DEFAULT_CONFIG);
    spy.mockRestore();
  });

  it('no arranca a ciegas si no puede leer', async () => {
    await expect(
      store(() => Promise.resolve(new Response('', { status: 500 }))).load(),
    ).rejects.toThrow();
  });

  it('guarda con la llave de servicio, en una sola fila', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('', { status: 201 })));
    await store(fetchImpl).save(DEFAULT_CONFIG);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/rest/v1/ai_config');
    expect(init.method).toBe('POST');
    const sentHeaders = init.headers as Record<string, string>;
    expect(sentHeaders.apikey).toBe(SERVICE);
    expect(sentHeaders.prefer).toContain('merge-duplicates');
    const sent = JSON.parse(init.body as string) as unknown;
    expect(sent).toMatchObject({ id: true, value: DEFAULT_CONFIG });
    await expect(
      store(() => Promise.resolve(new Response('', { status: 403 }))).save(DEFAULT_CONFIG),
    ).rejects.toThrow();
  });
});

// ------------------------------------------------------------------ Entorno
describe('readHostedEnv', () => {
  const valid = {
    SUPABASE_URL: `${URL_}/`,
    SUPABASE_ANON_KEY: ANON,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE,
    APP_ORIGINS: `${ORIGIN}/, https://studiare.mx`,
    ENARM_ANTHROPIC_KEY: 'clave-de-prueba-que-no-es-real',
    PORT: '3000',
  };

  it('acepta una configuración completa y limpia las direcciones', () => {
    const result = readHostedEnv(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.supabaseUrl).toBe(URL_);
    expect([...result.env.origins]).toEqual([ORIGIN, 'https://studiare.mx']);
    expect(result.env.port).toBe(3000);
    expect(result.env.apiKey).toBe('clave-de-prueba-que-no-es-real');
  });

  it('dice todos los problemas juntos y nunca un valor', () => {
    const result = readHostedEnv({
      SUPABASE_URL: 'http://otra.com',
      SUPABASE_ANON_KEY: 'corta',
      SUPABASE_SERVICE_ROLE_KEY: '',
      APP_ORIGINS: 'http://sin-https.com',
      PORT: '99999',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.length).toBeGreaterThanOrEqual(6);
    for (const problem of result.problems) {
      expect(problem).not.toContain('otra.com');
      expect(problem).not.toContain('corta');
    }
  });

  it('rechaza una llave secreta en el lugar de la pública y la pública en el de servicio', () => {
    const secretAsAnon = readHostedEnv({
      ...valid,
      SUPABASE_ANON_KEY: `sb_secret_${'a'.repeat(24)}`,
    });
    expect(secretAsAnon.ok).toBe(false);
    const sameKey = readHostedEnv({ ...valid, SUPABASE_SERVICE_ROLE_KEY: ANON });
    expect(sameKey.ok).toBe(false);
  });

  it('no acepta comodines ni rutas en los orígenes', () => {
    for (const origins of ['https://*.github.io', 'https://sitio.com/app', '*']) {
      expect(readHostedEnv({ ...valid, APP_ORIGINS: origins }).ok).toBe(false);
    }
  });

  it('sin clave de IA no arranca, salvo con ALLOW_MOCK=1, que lo deja en modo simulado', () => {
    const withoutKey: Record<string, string> = { ...valid };
    Reflect.deleteProperty(withoutKey, 'ENARM_ANTHROPIC_KEY');
    const strict = readHostedEnv(withoutKey);
    expect(strict.ok).toBe(false);
    const mock = readHostedEnv({ ...withoutKey, ALLOW_MOCK: '1' });
    expect(mock.ok).toBe(true);
    if (mock.ok) expect(mock.env.apiKey).toBeNull();
  });
});
