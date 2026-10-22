// withMonitoring y el emisor propio de Sentry (B15, 2.2). Sentry se imita con un fetch en memoria: ninguna
// petición sale a la red
import { describe, expect, it } from 'vitest';
import {
  MONITORING_TEST_MESSAGE,
  SENTRY_TIMEOUT_MS,
  buildEnvelope,
  buildFunctionEvent,
  buildTestEvent,
  captureException,
  leaksData,
  monitoringDepsFrom,
  parseSentryDsn,
  scrubServerText,
  sendSentryEvent,
  withMonitoring,
  type MonitoringDeps,
  type MonitoringSource,
} from './monitoring.ts';

const PUBLIC_KEY = '0123456789abcdef0123456789abcdef';
const DSN = `https://${PUBLIC_KEY}@o4500000000000000.ingest.sentry.io/4500000000000001`;
const ENDPOINT = 'https://o4500000000000000.ingest.sentry.io/api/4500000000000001/envelope/';

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: string;
}

function setup(
  options: {
    dsn?: string | undefined;
    status?: number;
    network?: boolean;
    background?: boolean;
  } = {},
) {
  const sent: Sent[] = [];
  const logs: string[] = [];
  const work: Promise<unknown>[] = [];
  let clock = 1_800_000_000_000;
  let counter = 0;
  const deps: MonitoringDeps = {
    dsn: 'dsn' in options ? options.dsn : DSN,
    fetch: ((url: string, init: RequestInit) => {
      const headers: Record<string, string> = {};
      new Headers(init.headers).forEach((value, name) => {
        headers[name] = value;
      });
      sent.push({ url, headers, body: init.body as string });
      if (options.network) return Promise.reject(new TypeError('fetch failed'));
      return Promise.resolve(new Response('{"id":"x"}', { status: options.status ?? 200 }));
    }) as typeof fetch,
    now: () => clock,
    uuid: () => `00000000-0000-4000-8000-${String((counter += 1)).padStart(12, '0')}`,
    region: 'us-east-1',
    version: 'v42',
    environment: 'production',
    log: (line) => logs.push(line),
    ...(options.background
      ? {
          waitUntil: (promise: Promise<unknown>) => {
            work.push(promise);
          },
        }
      : {}),
  };
  return { deps, sent, logs, work, advance: (ms: number) => (clock += ms) };
}

/** Las tres líneas de un sobre: cabecera, cabecera del ítem y evento */
function parseEnvelope(body: string) {
  expect(body.endsWith('\n')).toBe(true);
  const lines = body.slice(0, -1).split('\n');
  expect(lines).toHaveLength(3);
  const [header, item, payload] = lines as [string, string, string];
  return {
    header: JSON.parse(header) as Record<string, unknown>,
    item: JSON.parse(item) as { type: string; length: number },
    payloadText: payload,
    event: JSON.parse(payload) as Record<string, unknown>,
  };
}

const request = (
  url = 'https://proyecto.supabase.co/functions/v1/send-emails?t=0123456789abcdef0123456789abcdef0123',
) =>
  new Request(url, {
    method: 'POST',
    headers: {
      authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firmaDePrueba',
      'x-email-tick': 'ficha-secreta-de-cron',
      cookie: 'sesion=secreta',
    },
    body: JSON.stringify({ correo: 'alumna@ejemplo.mx', nota: 'texto libre de la alumna' }),
  });

describe('el DSN', () => {
  it('lee un DSN de Sentry en la nube y arma la dirección del sobre', () => {
    expect(parseSentryDsn(DSN)).toEqual({ endpoint: ENDPOINT, publicKey: PUBLIC_KEY });
    expect(parseSentryDsn(` ${DSN} `)?.endpoint).toBe(ENDPOINT);
    for (const region of ['us', 'de']) {
      expect(
        parseSentryDsn(`https://${PUBLIC_KEY}@o450.ingest.${region}.sentry.io/45`)?.endpoint,
      ).toBe(`https://o450.ingest.${region}.sentry.io/api/45/envelope/`);
    }
  });

  it('rechaza lo que no es un DSN de la nube de Sentry, también uno con llave secreta', () => {
    for (const bad of [
      undefined,
      '',
      'no es un dsn',
      `http://${PUBLIC_KEY}@o450.ingest.sentry.io/45`,
      `https://${PUBLIC_KEY}@evil.example/45`,
      `https://${PUBLIC_KEY}@o450.ingest.sentry.io.evil.example/45`,
      `https://${PUBLIC_KEY}:secreta@o450.ingest.sentry.io/45`,
      `https://${PUBLIC_KEY}@sentry.example.com/45`,
      `https://${PUBLIC_KEY}@o450.ingest.sentry.io/`,
      `https://${PUBLIC_KEY}@o450.ingest.sentry.io/45/extra`,
      `https://corta@o450.ingest.sentry.io/45`,
    ]) {
      expect(parseSentryDsn(bad), String(bad)).toBeNull();
    }
  });
});

describe('sin SENTRY_DSN', () => {
  it('no manda nada, deja una línea sin datos y responde igual que antes', async () => {
    const { deps, sent, logs } = setup({ dsn: undefined });
    const failing = withMonitoring('send-emails', () => new Response('x', { status: 503 }), deps);
    const response = await failing(request());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('x');
    expect(sent).toEqual([]);
    expect(logs).toEqual([
      'Error en send-emails (respuesta, estado 503). Sin SENTRY_DSN no se avisa a Sentry',
    ]);
  });

  it('una excepción se vuelve a lanzar tal cual y el registro no trae su mensaje', async () => {
    const { deps, sent, logs } = setup({ dsn: undefined });
    const boom = new Error('falló para alumna@ejemplo.mx con el pago pi_abc123456');
    const failing = withMonitoring('create-checkout', () => Promise.reject(boom), deps);
    await expect(failing(request())).rejects.toBe(boom);
    expect(sent).toEqual([]);
    expect(logs).toEqual([
      'Error en create-checkout (excepción, estado 500). Sin SENTRY_DSN no se avisa a Sentry',
    ]);
    expect(logs.join(' ')).not.toMatch(/@|pi_/);
  });

  it('un DSN que no es de Sentry cuenta como ausente', async () => {
    const { deps, sent } = setup({ dsn: 'https://llave@evil.example/1' });
    await withMonitoring('x', () => new Response(null, { status: 500 }), deps)(request());
    expect(sent).toEqual([]);
  });

  it('las dependencias del entorno leen SENTRY_DSN, la región y la versión, y una variable vacía cuenta como ausente', () => {
    const env: Record<string, string> = {
      SENTRY_DSN: ` ${DSN} `,
      SB_REGION: 'us-east-1',
      DENO_DEPLOYMENT_ID: 'v9',
    };
    const deps = monitoringDepsFrom((name) => env[name]);
    expect(deps).toMatchObject({
      dsn: DSN,
      region: 'us-east-1',
      version: 'v9',
      environment: 'production',
    });
    const empty = monitoringDepsFrom((name) => (name === 'SENTRY_DSN' ? '   ' : undefined));
    expect(empty).toMatchObject({ dsn: undefined, region: 'desconocida', version: 'dev' });
    expect(deps.uuid()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('el DSN se lee cada vez que se avisa, así uno que se pone después se nota sin volver a cargar', async () => {
    const { deps, sent } = setup({ dsn: undefined });
    let current: MonitoringDeps = deps;
    const wrapped = withMonitoring(
      'x',
      () => new Response(null, { status: 500 }),
      () => current,
    );
    await wrapped(request());
    expect(sent).toEqual([]);
    current = { ...deps, dsn: DSN };
    await wrapped(request());
    expect(sent).toHaveLength(1);
  });
});

describe('con SENTRY_DSN', () => {
  it('una respuesta 5xx manda un evento a la dirección del DSN y la respuesta pasa igual', async () => {
    const { deps, sent } = setup();
    const original = new Response('cuerpo original', { status: 503, headers: { 'x-a': 'b' } });
    const response = await withMonitoring('send-emails', () => original, deps)(request());
    expect(response).toBe(original);
    expect(await response.text()).toBe('cuerpo original');
    expect(sent).toHaveLength(1);
    const [call] = sent;
    expect(call?.url).toBe(ENDPOINT);
    expect(call?.headers['content-type']).toBe('application/x-sentry-envelope');
    expect(call?.headers['x-sentry-auth']).toBe(
      `Sentry sentry_version=7, sentry_client=studiare.edge/1, sentry_key=${PUBLIC_KEY}`,
    );
    const { header, item, payloadText, event } = parseEnvelope(call?.body ?? '');
    expect(String(header.event_id)).toMatch(/^[0-9a-f]{32}$/);
    expect(header.sent_at).toBe(new Date(1_800_000_000_000).toISOString());
    expect(item).toEqual({ type: 'event', length: new TextEncoder().encode(payloadText).length });
    expect(event).toMatchObject({
      event_id: header.event_id,
      platform: 'javascript',
      level: 'error',
      logger: 'edge-function',
      release: 'v42',
      environment: 'production',
      message: 'Respuesta 503 de la función send-emails',
      tags: { function: 'send-emails', method: 'POST', status: '503', region: 'us-east-1' },
      request: { method: 'POST', url: '/functions/v1/send-emails' },
      fingerprint: ['edge-function', 'send-emails', 'response', '503'],
      sdk: { name: 'studiare.edge', version: '1' },
    });
    expect(event.timestamp).toBe(1_800_000_000);
  });

  it('una excepción manda su tipo y su mensaje limpios, avisa y se vuelve a lanzar', async () => {
    const { deps, sent } = setup();
    class PagoError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'PagoError';
      }
    }
    const boom = new PagoError(
      'no se pudo cobrar a alumna@ejemplo.mx, id 3f1d4c52-9f1e-4a0e-8d52-6d1c9a2b7e10, pago pi_3Abcdef123456 con sk_live_abcdefghijkl',
    );
    const failing = withMonitoring('create-checkout', () => Promise.reject(boom), deps);
    await expect(failing(request())).rejects.toBe(boom);
    expect(sent).toHaveLength(1);
    const { event } = parseEnvelope(sent[0]?.body ?? '');
    expect(event).toMatchObject({
      fingerprint: ['edge-function', 'create-checkout', 'exception', 'PagoError'],
      tags: { status: '500' },
    });
    const values = (event.exception as { values: { type: string; value: string }[] }).values;
    expect(values).toEqual([
      { type: 'PagoError', value: 'no se pudo cobrar a [correo], id [id], pago [id] con [clave]' },
    ]);
  });

  it('nunca manda el cuerpo, los encabezados, las cookies, la consulta ni lo que traían', async () => {
    const { deps, sent } = setup();
    await withMonitoring('send-emails', () => new Response('x', { status: 500 }), deps)(request());
    const text = sent[0]?.body ?? '';
    expect(text).not.toMatch(
      /alumna|ejemplo\.mx|texto libre|0123456789abcdef0123456789abcdef0123|ficha-secreta|sesion=|firmaDePrueba|eyJ|Bearer|cookie|authorization|query_string|"headers"|"data"|"user"/i,
    );
    const { event } = parseEnvelope(text);
    expect(Object.keys(event).sort()).toEqual(
      [
        'environment',
        'event_id',
        'fingerprint',
        'level',
        'logger',
        'message',
        'platform',
        'release',
        'request',
        'sdk',
        'tags',
        'timestamp',
      ].sort(),
    );
    expect(Object.keys(event.request as object).sort()).toEqual(['method', 'url']);
  });

  it('la ruta se manda sin la consulta, que puede traer la ficha de baja', () => {
    const { deps } = setup();
    const event = buildFunctionEvent(deps, {
      name: 'email-unsubscribe',
      method: 'POST',
      path: new URL(
        'https://x.supabase.co/functions/v1/email-unsubscribe?t=0123456789abcdef0123456789abcdef0123#frag',
      ).pathname,
      status: 500,
      error: null,
    });
    expect(event.request).toEqual({ method: 'POST', url: '/functions/v1/email-unsubscribe' });
  });

  it('una respuesta que no es 5xx no avisa a nadie', async () => {
    const { deps, sent, logs } = setup();
    for (const status of [
      200, 201, 202, 204, 301, 302, 400, 401, 403, 404, 405, 409, 422, 429, 499,
    ]) {
      await withMonitoring('x', () => new Response(null, { status }), deps)(request());
    }
    expect(sent).toEqual([]);
    expect(logs).toEqual([]);
  });

  it('una respuesta con cuerpo sigue intacta, porque no se lee', async () => {
    const { deps } = setup();
    const response = await withMonitoring(
      'x',
      () => new Response('gran cuerpo', { status: 500 }),
      deps,
    )(request());
    expect(response.bodyUsed).toBe(false);
    expect(await response.text()).toBe('gran cuerpo');
  });

  it('con waitUntil el aviso sale sin retrasar la respuesta', async () => {
    const { deps, sent, work } = setup({ background: true });
    await withMonitoring('x', () => new Response(null, { status: 500 }), deps)(request());
    expect(work).toHaveLength(1);
    await Promise.all(work);
    expect(sent).toHaveLength(1);
  });

  it('si Sentry no contesta, responde 429 o la red falla, la respuesta de la función no cambia', async () => {
    for (const options of [{ network: true }, { status: 429 }, { status: 500 }]) {
      const { deps, sent } = setup(options);
      const response = await withMonitoring(
        'x',
        () => new Response('ok', { status: 502 }),
        deps,
      )(request());
      expect(response.status).toBe(502);
      expect(sent).toHaveLength(1);
    }
    const { deps } = setup({ network: true });
    const boom = new Error('x');
    await expect(withMonitoring('x', () => Promise.reject(boom), deps)(request())).rejects.toBe(
      boom,
    );
  });

  it('si el aviso mismo falla, la respuesta y la excepción de la función no cambian', async () => {
    const boom = new Error('la de la función');
    const failures: Record<string, (deps: MonitoringDeps) => MonitoringSource> = {
      // EdgeRuntime.waitUntil no existe fuera de Supabase
      'waitUntil lanza': (deps) => ({
        ...deps,
        waitUntil: () => {
          throw new ReferenceError('EdgeRuntime is not defined');
        },
      }),
      'las dependencias no se pueden armar': () => () => {
        throw new TypeError('sin entorno');
      },
      'el registro lanza (sin DSN)': (deps) => ({
        ...deps,
        dsn: undefined,
        log: () => {
          throw new Error('registro roto');
        },
      }),
      'el reloj lanza': (deps) => ({
        ...deps,
        now: () => {
          throw new Error('reloj roto');
        },
      }),
    };
    for (const [caso, broken] of Object.entries(failures)) {
      const respuesta = new Response('cuerpo intacto', { status: 502 });
      const wrapped = withMonitoring(
        'x',
        () => respuesta,
        broken(setup({ background: true }).deps),
      );
      expect(await wrapped(request()), caso).toBe(respuesta);
      const lanza = withMonitoring('x', () => Promise.reject(boom), broken(setup().deps));
      await expect(lanza(request()), caso).rejects.toBe(boom);
    }
  });

  it('un Sentry que no contesta se corta por tiempo y la función no queda esperando', async () => {
    // Un fetch que no termina nunca, salvo que le cancelen la petición
    const hang = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('cancelado', 'TimeoutError'));
        });
      })) as typeof fetch;
    const { deps } = setup();
    const slow = { ...deps, fetch: hang, timeoutMs: 30 };
    const event = { event_id: 'a'.repeat(32), message: 'x' };
    const started = Date.now();
    expect(await sendSentryEvent(slow, event)).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
    // El aviso de segundo plano también termina, y no lanza
    expect(await captureException(slow, 'send-emails', new Error('x'))).toBe(false);
  });

  it('por omisión la petición a Sentry lleva una señal de 3 segundos que todavía no se cumple', async () => {
    expect(SENTRY_TIMEOUT_MS).toBe(3000);
    const signals: (AbortSignal | null | undefined)[] = [];
    const { deps } = setup();
    const watching = {
      ...deps,
      fetch: ((_url: string, init: RequestInit) => {
        signals.push(init.signal);
        return Promise.resolve(new Response('{}', { status: 200 }));
      }) as typeof fetch,
    };
    expect(await sendSentryEvent(watching, { event_id: 'a'.repeat(32), message: 'x' })).toBe(true);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0]?.aborted).toBe(false);
  });

  it('captureException nunca lanza, ni siquiera si las dependencias no se pueden armar', async () => {
    const broken = () => {
      throw new TypeError('sin entorno');
    };
    expect(await captureException(broken, 'send-emails', new Error('x'))).toBe(false);
  });

  it('a lo más 20 avisos por minuto en cada instancia', async () => {
    const { deps, sent, advance } = setup();
    const wrapped = withMonitoring('x', () => new Response(null, { status: 500 }), deps);
    for (let index = 0; index < 30; index += 1) await wrapped(request());
    expect(sent).toHaveLength(20);
    advance(61_000);
    await wrapped(request());
    expect(sent).toHaveLength(21);
  });

  it('el evento viaja con el nombre y la versión de la función, la región y el entorno', () => {
    const { deps } = setup();
    const event = buildFunctionEvent(
      { ...deps, region: 'sa-east-1', version: '7', environment: 'production' },
      {
        name: 'bank-sync',
        method: 'GET',
        path: '/functions/v1/bank-sync',
        status: 500,
        error: new TypeError('mal'),
      },
    );
    expect(event).toMatchObject({
      release: '7',
      tags: { function: 'bank-sync', method: 'GET', status: '500', region: 'sa-east-1' },
      exception: { values: [{ type: 'TypeError', value: 'mal' }] },
    });
  });

  it('una excepción que no es un Error no vuelca su contenido', () => {
    const { deps } = setup();
    const base = { name: 'x', method: 'POST', path: '/x', status: 500 };
    const object = buildFunctionEvent(deps, { ...base, error: { correo: 'alumna@ejemplo.mx' } });
    expect(JSON.stringify(object)).not.toContain('alumna');
    const text = buildFunctionEvent(deps, { ...base, error: 'falló con alumna@ejemplo.mx' });
    expect(JSON.stringify(text)).not.toContain('alumna');
    expect(JSON.stringify(text)).toContain('[correo]');
  });

  it('la traza se conserva limpia y recortada', () => {
    const { deps } = setup();
    const error = new Error('mal');
    error.stack = [
      'Error: mal para alumna@ejemplo.mx',
      ...Array.from(
        { length: 20 },
        (_, i) => `    at f${i} (file:///src/x.ts:${i}:5?token=secreto)`,
      ),
    ].join('\n');
    const event = buildFunctionEvent(deps, {
      name: 'x',
      method: 'POST',
      path: '/x',
      status: 500,
      error,
    });
    const stack = (event.extra as { stack: string }).stack;
    expect(stack.split('\n')).toHaveLength(8);
    expect(stack).not.toMatch(/alumna|secreto/);
  });

  it('captureException avisa de un error de segundo plano con la misma limpieza', async () => {
    const { deps, sent } = setup();
    expect(
      await captureException(deps, 'send-emails', new Error('falló para alumna@ejemplo.mx')),
    ).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).not.toContain('alumna');
    const none = setup({ dsn: undefined });
    expect(await captureException(none.deps, 'send-emails', new Error('x'))).toBe(false);
    expect(none.logs).toHaveLength(1);
  });
});

describe('la limpieza', () => {
  it('quita correos, ids, tokens, claves y ids de los servicios', () => {
    const text = scrubServerText(
      'a ana@x.mx, 3f1d4c52-9f1e-4a0e-8d52-6d1c9a2b7e10, eyJhbGciOiJI.eyJzdWIiOiIx.firma, sk_live_abcdefghijkl, re_AbCdEfGh12345, phc_Abcdefghij0123456789, sntrys_abcdefgh1234, cus_Abc123456, sub_1Abcdef123, in_1Abcdef123, Bearer secreto123, abcdefghijklmnopqrst.supabase.co',
      400,
    );
    expect(text).toBe(
      'a [correo], [id], [token], [clave], [clave], [clave], [clave], [id], [id], [id], Bearer [clave], [proyecto]',
    );
    expect(leaksData(text)).toBe(false);
  });

  it('la limpieza del servidor quita correos con acentos, con %40 y fichas en hexadecimal', () => {
    const text = scrubServerText(
      'Key (email)=(josé.pérez@gmail.com), ÁNGEL@GMAIL.COM, /u/ana%40gmail.com, user@ñandú.mx, token 0123456789abcdef0123456789abcdef0123 inválido',
      400,
    );
    expect(text).toBe(
      'Key (email)=([correo]), [correo], /u/[correo], [correo], token [token] inválido',
    );
    expect(leaksData(text)).toBe(false);
  });

  it('leaksData reconoce lo que no debe salir', () => {
    expect(leaksData('hola alumna@ejemplo.mx')).toBe(true);
    expect(leaksData('eyJhbGciOiJI.eyJzdWIiOiIx.firma')).toBe(true);
    expect(leaksData('Bearer abc123')).toBe(true);
    expect(leaksData('re_AbCdEfGh12345')).toBe(true);
    expect(leaksData('una frase normal')).toBe(false);
  });

  it('leaksData también reconoce correos con acentos, con %40, de ancho completo y fichas largas', () => {
    expect(leaksData('josé.pérez@gmail.com')).toBe(true);
    expect(leaksData('ÁNGEL@GMAIL.COM')).toBe(true);
    expect(leaksData('user@ñandú.mx')).toBe(true);
    expect(leaksData('/u/ana%40gmail.com')).toBe(true);
    expect(leaksData('ana＠gmail.com')).toBe(true);
    expect(leaksData('0123456789abcdef0123456789abcdef0123')).toBe(true);
    // El event_id de un sobre mide justo 32 y no es una fuga
    expect(leaksData('a'.repeat(32))).toBe(false);
  });

  it('un evento que trae un correo con acentos o una ficha no sale', async () => {
    for (const message of [
      'hola josé.pérez@gmail.com',
      'token 0123456789abcdef0123456789abcdef0123',
    ]) {
      const { deps, sent } = setup();
      const leaked = await sendSentryEvent(deps, { event_id: 'a'.repeat(32), message });
      expect(leaked).toBe(false);
      expect(sent).toEqual([]);
    }
  });

  it('un evento que todavía trae un correo no sale', async () => {
    const { deps, sent, logs } = setup();
    const leaked = await sendSentryEvent(deps, {
      event_id: 'a'.repeat(32),
      message: 'hola alumna@ejemplo.mx',
    });
    expect(leaked).toBe(false);
    expect(sent).toEqual([]);
    expect(logs).toEqual([
      'Un evento de Sentry se descartó porque todavía traía datos de una persona o una clave',
    ]);
  });

  it('sendSentryEvent dice si Sentry lo aceptó y nunca lanza', async () => {
    expect(await sendSentryEvent(setup().deps, { event_id: 'a'.repeat(32), message: 'x' })).toBe(
      true,
    );
    expect(
      await sendSentryEvent(setup({ status: 429 }).deps, {
        event_id: 'a'.repeat(32),
        message: 'x',
      }),
    ).toBe(false);
    expect(
      await sendSentryEvent(setup({ network: true }).deps, {
        event_id: 'a'.repeat(32),
        message: 'x',
      }),
    ).toBe(false);
    expect(
      await sendSentryEvent(setup({ dsn: undefined }).deps, {
        event_id: 'a'.repeat(32),
        message: 'x',
      }),
    ).toBe(false);
  });
});

describe('el sobre y el evento de prueba', () => {
  it('el sobre son tres líneas con salto de línea y la longitud en bytes, también con acentos', () => {
    const { deps } = setup();
    const envelope = buildEnvelope(deps, {
      event_id: 'b'.repeat(32),
      message: 'Ñandú, función, 🙂',
    });
    const { item, payloadText } = parseEnvelope(envelope);
    expect(item.length).toBe(new TextEncoder().encode(payloadText).length);
    expect(item.length).toBeGreaterThan(payloadText.length);
  });

  it('el evento de prueba lleva el mensaje fijo y una huella propia en cada prueba', () => {
    const { deps } = setup();
    const first = buildTestEvent(deps);
    const second = buildTestEvent(deps);
    expect(first.message).toBe('Prueba de alertas de Studiare, funciones');
    expect(MONITORING_TEST_MESSAGE).toBe(first.message);
    expect(first.fingerprint).not.toEqual(second.fingerprint);
    expect(first.tags).toEqual({ function: 'monitoring-test', test: 'true' });
    expect(Object.keys(first)).not.toContain('user');
  });
});
