// El registro del dominio de las billeteras contra un Stripe falso en memoria (B17, 6.3 y 6.7). Nada sale a Stripe:
// se comprueba que solo trabaja en modo prueba, que es repetible, que valida solo cuando se pide, que dice el
// estado de Apple Pay y Google Pay con lo que sigue, que rechaza los dominios que no son de la app y que nunca
// imprime la llave
import { describe, expect, it } from 'vitest';
import { STRIPE_API_VERSION } from '../../supabase/functions/_shared/billingTypes.ts';
import {
  APPLE_FILE_IN_REPO,
  REGISTER_EXIT,
  RegisterDomainError,
  allActive,
  parseDomain,
  parseRegisterArgs,
  registerKey,
  registerPaymentMethodDomain,
  reportLines,
  runRegisterCli,
  walletStatuses,
} from './register-domain.ts';

const KEY = `rk_test_${'a'.repeat(30)}`;
const DOMAIN = 'tudominio.mx';
const APPLE_ERROR = 'The domain association file could not be verified.';

interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  form: URLSearchParams;
  headers: Headers;
}

interface Seed {
  /** Lo que dice el saldo y el objeto, que en modo real sería true */
  livemode?: boolean;
  /** El archivo de Apple ya está publicado, así que apple_pay queda activo al revisar */
  fileServed?: boolean;
  /** El dominio ya estaba registrado antes */
  existing?: boolean;
  /** Stripe contesta este error a toda petición */
  failWith?: { status: number; message: string };
  /** google_pay queda inactivo */
  googleInactive?: boolean;
}

/**
 * Un Stripe falso con la regla que importa aquí. Registrar dos veces el mismo dominio es un error de Stripe, y Apple
 * Pay queda activo solo si el archivo está publicado en el momento de registrar o de validar
 */
function fakeStripe(seed: Seed = {}) {
  const calls: Call[] = [];
  const domains = new Map<string, Record<string, unknown>>();
  let served = seed.fileServed ?? false;
  const wallet = (active: boolean, message: string) => ({
    status: active ? 'active' : 'inactive',
    ...(active ? {} : { status_details: { error_message: message } }),
  });
  const make = (name: string): Record<string, unknown> => ({
    id: `pmd_${String(domains.size + 1)}`,
    object: 'payment_method_domain',
    domain_name: name,
    enabled: true,
    livemode: seed.livemode ?? false,
    apple_pay: wallet(served, APPLE_ERROR),
    google_pay: wallet(!seed.googleInactive, 'Google could not verify the domain.'),
    link: { status: 'active' },
    paypal: { status: 'inactive' },
  });
  if (seed.existing) domains.set(DOMAIN, make(DOMAIN));
  const ok = (body: unknown) => Promise.resolve(Response.json(body));
  const fail = (status: number, message: string) =>
    Promise.resolve(
      Response.json({ error: { type: 'invalid_request_error', message } }, { status }),
    );

  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? 'GET';
    const form = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
    calls.push({
      method,
      path: url.pathname,
      query: url.searchParams,
      form,
      headers: new Headers(init?.headers),
    });
    if (seed.failWith) return fail(seed.failWith.status, seed.failWith.message);
    const [, , resource = '', id = '', action = ''] = url.pathname.split('/');
    if (resource === 'balance') {
      return ok({ object: 'balance', livemode: seed.livemode ?? false, available: [] });
    }
    if (resource !== 'payment_method_domains') return fail(404, 'Unrecognized request URL');
    if (id === '' && method === 'GET') {
      const wanted = url.searchParams.get('domain_name');
      const data = [...domains.values()].filter((row) => !wanted || row.domain_name === wanted);
      return ok({ object: 'list', data, has_more: false });
    }
    if (id === '' && method === 'POST') {
      const name = form.get('domain_name') ?? '';
      if (domains.has(name)) return fail(400, `The domain ${name} is already registered.`);
      const created = make(name);
      domains.set(name, created);
      return ok(created);
    }
    const row = [...domains.values()].find((candidate) => candidate.id === id);
    if (!row) return fail(404, `No such payment_method_domain: '${id}'`);
    if (action === 'validate' && method === 'POST') {
      row.apple_pay = wallet(served, APPLE_ERROR);
      return ok(row);
    }
    return fail(400, 'Petición sin simular');
  }) as typeof fetch;

  return {
    fetchImpl,
    calls,
    domains,
    /** El archivo de Apple se publica en el dominio */
    publishAppleFile: () => {
      served = true;
    },
    creates: () =>
      calls.filter(
        (call) => call.method === 'POST' && call.path.endsWith('/payment_method_domains'),
      ),
    validations: () => calls.filter((call) => call.path.endsWith('/validate')),
  };
}

function cli(
  argv: string[],
  seed: Seed = {},
  env: Record<string, string | undefined> = { STRIPE_SECRET_KEY: KEY },
) {
  const stripe = fakeStripe(seed);
  const out: string[] = [];
  const err: string[] = [];
  const run = () =>
    runRegisterCli(argv, env, {
      fetch: stripe.fetchImpl,
      log: (line) => out.push(line),
      error: (line) => err.push(line),
    });
  return { stripe, out, err, run };
}

describe('el dominio', () => {
  it('acepta un dominio normal y lo deja en minúsculas, sin punto final', () => {
    expect(parseDomain('tudominio.mx')).toBe('tudominio.mx');
    expect(parseDomain('  TuDominio.MX. ')).toBe('tudominio.mx');
    expect(parseDomain('app.tudominio.mx')).toBe('app.tudominio.mx');
    expect(parseDomain('xn--dominio-ab1.mx')).toBe('xn--dominio-ab1.mx');
  });

  it('rechaza esquema, rutas, puertos, comodines y espacios, con el motivo y sin repetir lo que llegó', () => {
    for (const raw of [
      'https://tudominio.mx',
      'tudominio.mx/ruta',
      'tudominio.mx:8080',
      '*.tudominio.mx',
      'tu dominio.mx',
      'usuario@tudominio.mx',
      'tudominio.mx?x=1',
    ]) {
      expect(() => parseDomain(raw), raw).toThrow(RegisterDomainError);
      try {
        parseDomain(raw);
      } catch (error) {
        expect((error as Error).message).not.toContain(raw);
        expect((error as Error).message).toMatch(/sin https|dominio/);
      }
    }
  });

  it('rechaza lo que no es un dominio: sin punto, guiones mal puestos, direcciones IP y vacío', () => {
    for (const raw of [
      '',
      '   ',
      'tudominio',
      '-tudominio.mx',
      'tudominio-.mx',
      'a..mx',
      '192.168.0.1',
      '1.2.3.4',
    ]) {
      expect(() => parseDomain(raw), raw).toThrow(RegisterDomainError);
    }
  });

  it('no registra pages.dev, github.io ni dominios locales, porque no son el dominio de la app', () => {
    for (const raw of [
      'studiare.pages.dev',
      'rama.studiare.pages.dev',
      'pages.dev',
      'rickymm2001-dev.github.io',
      'localhost',
      'equipo.localhost',
      'mi.local',
    ]) {
      expect(() => parseDomain(raw), raw).toThrow(RegisterDomainError);
    }
    // Un dominio que solo termina parecido sí es válido
    expect(parseDomain('mispages.dev.mx')).toBe('mispages.dev.mx');
    expect(parseDomain('notgithub.io.mx')).toBe('notgithub.io.mx');
  });
});

describe('las opciones', () => {
  it('lee el dominio solo, con --domain y con --domain=, y --validate en cualquier lugar', () => {
    expect(parseRegisterArgs([DOMAIN])).toEqual({ domain: DOMAIN, validate: false });
    expect(parseRegisterArgs(['--validate', DOMAIN])).toEqual({ domain: DOMAIN, validate: true });
    expect(parseRegisterArgs([DOMAIN, '--validate'])).toEqual({ domain: DOMAIN, validate: true });
    expect(parseRegisterArgs(['--domain', DOMAIN])).toEqual({ domain: DOMAIN, validate: false });
    expect(parseRegisterArgs([`--domain=${DOMAIN}`, '--validate'])).toEqual({
      domain: DOMAIN,
      validate: true,
    });
  });

  it('pide el dominio, rechaza más de uno y las opciones que no existen, sin repetirlas', () => {
    for (const argv of [[], ['--validate'], [DOMAIN, 'otro.mx'], ['--domain'], ['--domain=']]) {
      expect(parseRegisterArgs(argv), JSON.stringify(argv)).toHaveProperty('error');
    }
    const unknown = parseRegisterArgs([DOMAIN, `--llave=${KEY}`]);
    expect(unknown).toHaveProperty('error');
    expect(JSON.stringify(unknown)).not.toContain(KEY);
  });

  it('el modo real no existe en este script: --live es un error que lo explica', () => {
    const live = parseRegisterArgs([DOMAIN, '--live']);
    expect(live).toHaveProperty('error');
    expect(JSON.stringify(live)).toContain('solo trabaja en modo prueba');
  });
});

describe('solo modo prueba', () => {
  it('no acepta llaves reales, publicables ni vacías, y no llama a Stripe', async () => {
    for (const key of [
      `sk_live_${'a'.repeat(30)}`,
      `rk_live_${'a'.repeat(30)}`,
      `pk_test_${'a'.repeat(30)}`,
      `whsec_${'a'.repeat(30)}`,
      'sk_test_corta',
    ]) {
      const stripe = fakeStripe();
      await expect(
        registerPaymentMethodDomain({
          key,
          fetch: stripe.fetchImpl,
          domain: DOMAIN,
          validate: false,
        }),
        key,
      ).rejects.toThrow(/Solo se aceptan llaves de prueba/);
      expect(stripe.calls).toEqual([]);
    }
    const none = fakeStripe();
    await expect(
      registerPaymentMethodDomain({
        key: '',
        fetch: none.fetchImpl,
        domain: DOMAIN,
        validate: false,
      }),
    ).rejects.toThrow(/Falta la llave de prueba/);
    expect(none.calls).toEqual([]);
  });

  it('con la llave del proxy lee el saldo primero, y si no es de prueba no registra nada', async () => {
    const live = fakeStripe({ livemode: true });
    await expect(
      registerPaymentMethodDomain({
        key: null,
        fetch: live.fetchImpl,
        domain: DOMAIN,
        validate: false,
      }),
    ).rejects.toThrow(/modo real/);
    expect(live.calls.map((call) => `${call.method} ${call.path}`)).toEqual(['GET /v1/balance']);
    expect(live.creates()).toEqual([]);

    const test = fakeStripe();
    await registerPaymentMethodDomain({
      key: null,
      fetch: test.fetchImpl,
      domain: DOMAIN,
      validate: false,
    });
    expect(test.calls[0]?.path).toBe('/v1/balance');
    // Sin llave propia, la que pone el proxy: el script no manda ninguna autorización
    expect(test.calls.every((call) => !call.headers.has('authorization'))).toBe(true);
  });

  it('si Stripe contesta algo en modo real corta aunque la llave pareciera de prueba', async () => {
    const stripe = fakeStripe({ livemode: true });
    await expect(
      registerPaymentMethodDomain({
        key: KEY,
        fetch: stripe.fetchImpl,
        domain: DOMAIN,
        validate: false,
      }),
    ).rejects.toThrow(/modo real/);
  });
});

describe('registrar el dominio', () => {
  it('lo busca, lo crea con el nombre, la llave y la versión fija, y dice que Apple Pay falta', async () => {
    const stripe = fakeStripe();
    const result = await registerPaymentMethodDomain({
      key: KEY,
      fetch: stripe.fetchImpl,
      domain: ` ${DOMAIN.toUpperCase()}`,
      validate: false,
    });
    expect(stripe.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'GET /v1/payment_method_domains',
      'POST /v1/payment_method_domains',
    ]);
    expect(stripe.calls[0]?.query.get('domain_name')).toBe(DOMAIN);
    expect(stripe.calls[1]?.form.get('domain_name')).toBe(DOMAIN);
    for (const call of stripe.calls) {
      expect(call.headers.get('authorization')).toBe(`Bearer ${KEY}`);
      expect(call.headers.get('stripe-version')).toBe(STRIPE_API_VERSION);
    }
    expect(stripe.calls[1]?.headers.get('idempotency-key')).toBe(`studiare-pmd-${DOMAIN}`);
    expect(result).toMatchObject({
      domain: DOMAIN,
      origin: 'created',
      validated: false,
      enabled: true,
    });
    expect(result.wallets).toEqual([
      { wallet: 'apple_pay', active: false, message: APPLE_ERROR },
      { wallet: 'google_pay', active: true, message: null },
    ]);
    expect(allActive(result)).toBe(false);
  });

  it('es repetible: si el dominio ya está no lo crea otra vez, y sin --validate no valida', async () => {
    const stripe = fakeStripe({ existing: true });
    const result = await registerPaymentMethodDomain({
      key: KEY,
      fetch: stripe.fetchImpl,
      domain: DOMAIN,
      validate: false,
    });
    expect(result.origin).toBe('existing');
    expect(stripe.creates()).toEqual([]);
    expect(stripe.validations()).toEqual([]);
    // Correrlo dos veces seguidas desde cero tampoco duplica
    const twice = fakeStripe();
    await registerPaymentMethodDomain({
      key: KEY,
      fetch: twice.fetchImpl,
      domain: DOMAIN,
      validate: false,
    });
    await registerPaymentMethodDomain({
      key: KEY,
      fetch: twice.fetchImpl,
      domain: DOMAIN,
      validate: false,
    });
    expect(twice.creates()).toHaveLength(1);
    expect(twice.domains.size).toBe(1);
  });

  it('con --validate vuelve a revisar, y con el archivo de Apple publicado queda todo activo', async () => {
    const stripe = fakeStripe();
    await registerPaymentMethodDomain({
      key: KEY,
      fetch: stripe.fetchImpl,
      domain: DOMAIN,
      validate: false,
    });
    stripe.publishAppleFile();
    const result = await registerPaymentMethodDomain({
      key: KEY,
      fetch: stripe.fetchImpl,
      domain: DOMAIN,
      validate: true,
    });
    expect(result).toMatchObject({ origin: 'existing', validated: true });
    expect(stripe.validations()).toHaveLength(1);
    expect(stripe.validations()[0]?.path).toBe('/v1/payment_method_domains/pmd_1/validate');
    expect(allActive(result)).toBe(true);
    expect(stripe.creates()).toHaveLength(1);
  });

  it('con --validate y el archivo todavía sin publicar sigue inactivo con el mensaje de Stripe', async () => {
    const stripe = fakeStripe({ existing: true });
    const result = await registerPaymentMethodDomain({
      key: KEY,
      fetch: stripe.fetchImpl,
      domain: DOMAIN,
      validate: true,
    });
    expect(result.wallets[0]).toMatchObject({
      wallet: 'apple_pay',
      active: false,
      message: APPLE_ERROR,
    });
  });

  it('rechaza un dominio que no es de la app antes de llamar a Stripe', async () => {
    const stripe = fakeStripe();
    await expect(
      registerPaymentMethodDomain({
        key: KEY,
        fetch: stripe.fetchImpl,
        domain: 'studiare.pages.dev',
        validate: false,
      }),
    ).rejects.toThrow(/pages.dev/);
    expect(stripe.calls).toEqual([]);
  });

  it('un error de Stripe que no es de la llave se dice con el estado y su mensaje, sin la llave', async () => {
    const stripe = fakeStripe({ failWith: { status: 400, message: 'Invalid domain_name' } });
    const attempt = () =>
      registerPaymentMethodDomain({
        key: KEY,
        fetch: stripe.fetchImpl,
        domain: DOMAIN,
        validate: false,
      });
    await expect(attempt()).rejects.toThrow(
      /Stripe respondió 400 en GET \/v1\/payment_method_domains\. Invalid domain_name/,
    );
    try {
      await attempt();
    } catch (error) {
      expect((error as Error).message).not.toContain(KEY);
    }
  });

  it.each([
    [401, 'Invalid API Key provided: rk_test_****************************abcd'],
    [401, 'Invalid API Key provided: sk_test_********wxyz'],
    [403, 'This key does not have the required permissions. Key: rk_test_****abcd'],
  ])(
    'con %s dice que Stripe rechazó la llave con palabras propias, sin repetir su mensaje',
    async (status, message) => {
      const stripe = fakeStripe({ failWith: { status, message } });
      let thrown = '';
      try {
        await registerPaymentMethodDomain({
          key: KEY,
          fetch: stripe.fetchImpl,
          domain: DOMAIN,
          validate: false,
        });
      } catch (error) {
        thrown = (error as Error).message;
      }
      expect(thrown).toContain(`Stripe rechazó la llave (${String(status)})`);
      expect(thrown).toContain('sk_test_ o rk_test_');
      // Ni el prefijo, ni los últimos caracteres, ni nada de lo que dijo Stripe
      expect(thrown).not.toMatch(/\*|abcd|wxyz|Invalid API Key|required permissions/);
      expect(thrown).not.toContain(KEY);
    },
  );

  it('desde la línea de comandos, una llave rechazada no imprime nada de lo que dijo Stripe', async () => {
    const { out, err, run } = cli([DOMAIN], {
      failWith: { status: 401, message: 'Invalid API Key provided: rk_test_****abcd' },
    });
    expect(await run()).toBe(REGISTER_EXIT.failed);
    const printed = `${out.join(' ')} ${err.join(' ')}`;
    expect(printed).toContain('Stripe rechazó la llave (401)');
    expect(printed).not.toMatch(/rk_test_\*|abcd|\*|Invalid API Key/);
  });

  it('un mensaje de otro error que nombra una llave la tapa', async () => {
    const stripe = fakeStripe({
      failWith: { status: 400, message: `Algo pasó con la llave ${KEY} en la petición` },
    });
    let thrown = '';
    try {
      await registerPaymentMethodDomain({
        key: KEY,
        fetch: stripe.fetchImpl,
        domain: DOMAIN,
        validate: false,
      });
    } catch (error) {
      thrown = (error as Error).message;
    }
    expect(thrown).toContain('[llave]');
    expect(thrown).not.toContain(KEY);
  });
});

describe('qué se imprime', () => {
  const inactiveApple = {
    id: 'pmd_1',
    domain: DOMAIN,
    origin: 'created' as const,
    validated: false,
    enabled: true,
    wallets: [
      { wallet: 'apple_pay' as const, active: false, message: APPLE_ERROR },
      { wallet: 'google_pay' as const, active: true, message: null },
    ],
  };

  it('cuenta el estado de cada billetera y, si Apple Pay falta, dónde bajar el archivo y dónde guardarlo', () => {
    const text = reportLines(inactiveApple).join('\n');
    expect(text).toContain(`Dominio ${DOMAIN} registrado en Stripe (modo prueba, pmd_1)`);
    expect(text).toContain(`Apple Pay inactivo. Stripe dice ${APPLE_ERROR}`);
    expect(text).toContain('Google Pay activo');
    expect(text).toContain('Settings, Payment method domains');
    expect(text).toContain(APPLE_FILE_IN_REPO);
    expect(APPLE_FILE_IN_REPO).toBe(
      'public/.well-known/apple-developer-merchantid-domain-association',
    );
    expect(text).toContain('--validate');
    expect(text).not.toContain('Listo');
  });

  it('con todo activo dice que los botones ya pueden aparecer, y Google Pay inactivo no pide archivo', () => {
    const active = {
      ...inactiveApple,
      origin: 'existing' as const,
      validated: true,
      wallets: inactiveApple.wallets.map((wallet) => ({ ...wallet, active: true, message: null })),
    };
    const text = reportLines(active).join('\n');
    expect(text).toContain('ya estaba registrado');
    expect(text).toContain('y revisado de nuevo');
    expect(text).toContain('Apple Pay activo');
    expect(text).toContain('Listo');
    const google = reportLines({
      ...active,
      wallets: [
        { wallet: 'apple_pay', active: true, message: null },
        { wallet: 'google_pay', active: false, message: 'No se pudo' },
      ],
    }).join('\n');
    expect(google).toContain('Google Pay inactivo. Stripe dice No se pudo');
    expect(google).toContain('Google Pay no pide archivo');
    expect(google).not.toContain('Falta el archivo de Apple');
  });

  it('el estado sale del objeto de Stripe, y lo que no es active cuenta como inactivo', () => {
    expect(
      walletStatuses({
        apple_pay: { status: 'active' },
        google_pay: { status: 'raro', status_details: { error_message: 'x' } },
      }),
    ).toEqual([
      { wallet: 'apple_pay', active: true, message: null },
      { wallet: 'google_pay', active: false, message: 'x' },
    ]);
    expect(walletStatuses({}).every((wallet) => !wallet.active)).toBe(true);
  });
});

describe('desde la línea de comandos', () => {
  it('registra, imprime el estado y sale con 3 mientras falte el archivo de Apple', async () => {
    const { stripe, out, err, run } = cli([DOMAIN]);
    expect(await run()).toBe(REGISTER_EXIT.pending);
    expect(err).toEqual([]);
    expect(out.join('\n')).toContain('Apple Pay inactivo');
    expect(stripe.creates()).toHaveLength(1);
  });

  it('publicado el archivo y con --validate sale con 0', async () => {
    const { stripe, out, run } = cli([DOMAIN, '--validate'], { existing: true });
    stripe.publishAppleFile();
    expect(await run()).toBe(REGISTER_EXIT.ok);
    expect(out.at(-1)).toContain('Listo');
  });

  it('las opciones que no sirven salen con 2 y no llaman a Stripe', async () => {
    for (const argv of [[], ['--live', DOMAIN], [DOMAIN, '--otra']]) {
      const { stripe, err, run } = cli(argv);
      expect(await run(), JSON.stringify(argv)).toBe(REGISTER_EXIT.usage);
      expect(err).toHaveLength(1);
      expect(stripe.calls).toEqual([]);
    }
  });

  it('una llave real o un dominio malo salen con 1, dicen por qué y nunca imprimen la llave', async () => {
    const realKey = `sk_live_${'b'.repeat(30)}`;
    const live = cli([DOMAIN], {}, { STRIPE_SECRET_KEY: realKey });
    expect(await live.run()).toBe(REGISTER_EXIT.failed);
    expect(live.err.join(' ')).toContain('Solo se aceptan llaves de prueba');
    const bad = cli(['https://tudominio.mx']);
    expect(await bad.run()).toBe(REGISTER_EXIT.failed);
    expect(
      `${live.out.join(' ')} ${live.err.join(' ')} ${bad.out.join(' ')} ${bad.err.join(' ')}`,
    ).not.toContain(realKey);
    expect(live.stripe.calls).toEqual([]);
    expect(bad.stripe.calls).toEqual([]);
  });

  it('una falla de red o un error ajeno dicen solo el tipo, sin el mensaje, que podría traer la llave', async () => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runRegisterCli(
      [DOMAIN],
      { STRIPE_SECRET_KEY: KEY },
      {
        fetch: () => Promise.reject(new TypeError(`fetch failed con ${KEY}`)),
        log: (line) => out.push(line),
        error: (line) => err.push(line),
      },
    );
    expect(code).toBe(REGISTER_EXIT.failed);
    expect(err).toEqual(['Falló el registro del dominio (TypeError)']);
    expect(err.join(' ')).not.toContain(KEY);
  });

  it('nada de lo que imprime lleva la llave, ni en una corrida buena', async () => {
    const { out, err, run } = cli([DOMAIN]);
    await run();
    expect(`${out.join(' ')} ${err.join(' ')}`).not.toContain(KEY);
  });

  it('avisa si se registra un dominio con www, sin impedirlo', async () => {
    const { out, run } = cli(['www.tudominio.mx']);
    await run();
    expect(out[0]).toContain('sin www');
  });

  it('sin STRIPE_SECRET_KEY usa la llave del proxy solo si hay proxy en el entorno', () => {
    expect(registerKey({ STRIPE_SECRET_KEY: KEY })).toBe(KEY);
    expect(registerKey({ HTTPS_PROXY: 'http://proxy:3128' })).toBeNull();
    expect(registerKey({ https_proxy: 'http://proxy:3128' })).toBeNull();
    expect(registerKey({})).toBe('');
  });
});
