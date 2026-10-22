// monitoring-test, el botón Mandar error de prueba del admin (B15, 2.4). Sentry se imita con un fetch en
// memoria: ninguna petición sale a la red
import { describe, expect, it } from 'vitest';
import { MONITORING_TEST_MESSAGE, type MonitoringDeps } from './monitoring.ts';
import { handleMonitoringTest, type MonitoringTestDeps } from './monitoringTest.ts';

const DSN =
  'https://0123456789abcdef0123456789abcdef@o4500000000000000.ingest.sentry.io/4500000000000001';
const APP = 'https://app.ejemplo.mx';

function setup(options: { dsn?: string | undefined; sentryStatus?: number; admin?: boolean } = {}) {
  const sent: string[] = [];
  const logs: string[] = [];
  const asked: string[] = [];
  const monitoring: MonitoringDeps = {
    dsn: 'dsn' in options ? options.dsn : DSN,
    fetch: ((_url: string, init: RequestInit) => {
      sent.push(init.body as string);
      return Promise.resolve(new Response('{"id":"x"}', { status: options.sentryStatus ?? 200 }));
    }) as typeof fetch,
    now: () => 1_800_000_000_000,
    uuid: () => crypto.randomUUID(),
    region: 'us-east-1',
    version: 'v1',
    environment: 'production',
    log: (line) => logs.push(line),
  };
  const deps: MonitoringTestDeps = {
    appUrl: APP,
    adminOk: (authorization) => {
      asked.push(authorization);
      return Promise.resolve(options.admin ?? true);
    },
    monitoring,
  };
  return { deps, sent, logs, asked };
}

const post = (
  headers: Record<string, string> = { authorization: 'Bearer sesion-del-admin', origin: APP },
) =>
  new Request('https://proyecto.supabase.co/functions/v1/monitoring-test', {
    method: 'POST',
    headers,
    body: '{}',
  });

describe('monitoring-test', () => {
  it('manda a Sentry el mensaje fijo de las funciones y responde sent', async () => {
    const { deps, sent, asked } = setup();
    const response = await handleMonitoringTest(post(), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: 'sent' });
    expect(asked).toEqual(['Bearer sesion-del-admin']);
    expect(sent).toHaveLength(1);
    const event = JSON.parse((sent[0] ?? '').split('\n')[2] ?? '{}') as Record<string, unknown>;
    expect(event.message).toBe('Prueba de alertas de Studiare, funciones');
    expect(MONITORING_TEST_MESSAGE).toBe(event.message);
    expect(event.level).toBe('error');
    expect(event.tags).toEqual({ function: 'monitoring-test', test: 'true' });
    // No lleva nada de quien lo pidió
    expect(sent[0]).not.toMatch(/sesion-del-admin|Bearer|@ejemplo|"user"|admin/);
  });

  it('cada prueba abre su propio problema en Sentry, para que dispare el correo de la regla', async () => {
    const { deps, sent } = setup();
    await handleMonitoringTest(post(), deps);
    await handleMonitoringTest(post(), deps);
    const fingerprints = sent.map(
      (body) => (JSON.parse(body.split('\n')[2] ?? '{}') as { fingerprint: string[] }).fingerprint,
    );
    expect(fingerprints[0]).not.toEqual(fingerprints[1]);
  });

  it('sin SENTRY_DSN responde missing_dsn y no manda nada', async () => {
    for (const dsn of [undefined, '', 'https://llave@evil.example/1']) {
      const { deps, sent, logs } = setup({ dsn });
      const response = await handleMonitoringTest(post(), deps);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ result: 'missing_dsn' });
      expect(sent).toEqual([]);
      expect(logs).toEqual(['monitoring-test sin SENTRY_DSN. No se mandó nada a Sentry']);
    }
  });

  it('sin sesión responde 401 y para quien no es admin 403, sin mandar nada', async () => {
    const anonymous = setup();
    const noSession = await handleMonitoringTest(post({ origin: APP }), anonymous.deps);
    expect(noSession.status).toBe(401);
    expect(await noSession.json()).toEqual({ error: 'unauthorized' });
    expect(anonymous.asked).toEqual([]);

    const student = setup({ admin: false });
    const forbidden = await handleMonitoringTest(post(), student.deps);
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: 'not_admin' });
    expect(student.sent).toEqual([]);
  });

  it('si Sentry no contesta bien responde 502', async () => {
    const { deps, logs } = setup({ sentryStatus: 429 });
    const response = await handleMonitoringTest(post(), deps);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'sentry_unreachable' });
    expect(logs).toEqual(['monitoring-test no pudo mandar el evento de prueba a Sentry']);
  });

  it('solo la página de la app puede llamarla desde el navegador', async () => {
    const { deps } = setup();
    const preflight = await handleMonitoringTest(
      new Request('https://proyecto.supabase.co/functions/v1/monitoring-test', {
        method: 'OPTIONS',
        headers: { origin: APP },
      }),
      deps,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(APP);
    const other = await handleMonitoringTest(
      post({ authorization: 'Bearer x', origin: 'https://malo.example' }),
      deps,
    );
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    const method = await handleMonitoringTest(
      new Request('https://proyecto.supabase.co/functions/v1/monitoring-test', { method: 'GET' }),
      deps,
    );
    expect(method.status).toBe(405);
  });
});
