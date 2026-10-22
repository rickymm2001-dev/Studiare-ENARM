// @vitest-environment jsdom
// Segundo destino de los errores del navegador: Sentry (B15, 2.1, 2.4 y 6.3). El SDK es un doble. La prueba
// con el SDK de verdad está en sentrySink.sdk.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeStoredFlags } from '@/config/featureFlags';
import { MONITORING_TEST_MESSAGES } from '@/data/cloud/engagementContracts';
import type { ClientErrorReport } from '@/data/telemetry/clientErrors';

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  flush: vi.fn(() => Promise.resolve(true)),
  loads: 0,
}));
vi.mock('@sentry/browser', () => {
  sdk.loads += 1;
  return {
    init: sdk.init,
    captureException: sdk.captureException,
    captureMessage: sdk.captureMessage,
    flush: sdk.flush,
  };
});

import {
  BROWSER_TEST_MESSAGE,
  readSentryDsn,
  reportToSentry,
  resetSentrySink,
  safeCopy,
  scrubSentryEvent,
  sendBrowserTestAlert,
  sentryConfigured,
  sentryOptions,
} from './sentrySink';

const DSN =
  'https://0123456789abcdef0123456789abcdef@o4500000000000000.ingest.sentry.io/4500000000000001';

const report = (overrides: Partial<ClientErrorReport> = {}): ClientErrorReport => ({
  fingerprint: '00112233445566aa',
  kind: 'error',
  message: 'TypeError: x is not a function',
  stack: null,
  screen: '/repasar',
  version: 'abc1234',
  ...overrides,
});

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('VITE_SENTRY_DSN', DSN);
  vi.stubEnv('VITE_BUILD_ID', 'abc1234');
  writeStoredFlags({ errorMonitoring: true });
  resetSentrySink();
  sdk.init.mockClear();
  sdk.captureException.mockClear();
  sdk.captureMessage.mockClear();
  sdk.flush.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  writeStoredFlags(null);
});

describe('el DSN y cuándo está en pie', () => {
  it('lee el DSN solo si tiene la forma de Sentry', () => {
    expect(readSentryDsn({ VITE_SENTRY_DSN: ` ${DSN} ` })).toBe(DSN);
    for (const bad of [
      {},
      { VITE_SENTRY_DSN: '' },
      { VITE_SENTRY_DSN: 7 },
      { VITE_SENTRY_DSN: 'https://malo.com/1' },
      { VITE_SENTRY_DSN: DSN.replace('sentry.io', 'sentry.io.malo.com') },
      { VITE_SENTRY_DSN: DSN.replace('https', 'http') },
    ]) {
      expect(readSentryDsn(bad)).toBeNull();
    }
  });

  it('está en pie solo con la bandera errorMonitoring y un DSN bueno', () => {
    expect(sentryConfigured()).toBe(true);
    writeStoredFlags({ errorMonitoring: false });
    expect(sentryConfigured()).toBe(false);
    writeStoredFlags({ errorMonitoring: true });
    vi.stubEnv('VITE_SENTRY_DSN', '');
    expect(sentryConfigured()).toBe(false);
  });
});

describe('las opciones de Sentry.init', () => {
  const options = sentryOptions(DSN, { release: 'abc1234', environment: 'production' });

  it('sin integraciones, sin migas ni informes, y sin datos de personas en ninguna categoría', () => {
    expect(options).toMatchObject({
      dsn: DSN,
      release: 'abc1234',
      environment: 'production',
      defaultIntegrations: false,
      integrations: [],
      sendClientReports: false,
      maxBreadcrumbs: 0,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        stackFrameVariables: false,
      },
    });
  });

  it('no pide trazas de rendimiento, ni repeticiones de pantalla, ni datos personales por omisión', () => {
    expect(options).not.toHaveProperty('tracesSampleRate');
    expect(options).not.toHaveProperty('tracesSampler');
    expect(options).not.toHaveProperty('replaysSessionSampleRate');
    expect(options).not.toHaveProperty('replaysOnErrorSampleRate');
    expect(options).not.toHaveProperty('sendDefaultPii');
    expect(options).not.toHaveProperty('tunnel');
  });

  it('limpia con beforeSend', () => {
    expect(options.beforeSend).toBe(scrubSentryEvent);
  });
});

describe('scrubSentryEvent', () => {
  const dirty = () =>
    ({
      type: undefined,
      event_id: 'e'.repeat(32),
      timestamp: 1_800_000_000,
      platform: 'javascript',
      level: 'error',
      release: 'abc1234',
      environment: 'production',
      fingerprint: ['00112233445566aa'],
      message: 'falló para ana@correo.mx con el token eyJabc123.eyJdef456.ghi789',
      exception: {
        values: [
          {
            type: 'TypeError',
            value:
              'No se pudo leer a ana@correo.mx (id 01J8Z3Q4W5E6R7T8Y9V0B1C2D3) en /repasar?token=secreto',
            mechanism: { type: 'onerror', handled: false, data: { respuesta: 'datos privados' } },
            stacktrace: {
              frames: [
                {
                  filename: 'https://studiare.mx/assets/index-ab12.js?correo=ana@correo.mx',
                  abs_path: 'https://studiare.mx/assets/index-ab12.js#ana@correo.mx',
                  function: 'rate',
                  lineno: 10,
                  colno: 20,
                  in_app: true,
                  vars: { alias: 'Ana', correo: 'ana@correo.mx' },
                  pre_context: ['const correo = "ana@correo.mx"'],
                  context_line: 'throw new Error(correo)',
                  post_context: ['// secreto'],
                  debug_id: 'abc',
                },
              ],
            },
          },
        ],
      },
      user: { id: 'u1', email: 'ana@correo.mx', ip_address: '189.1.2.3', username: 'Ana' },
      request: {
        url: 'https://studiare.mx/repasar?token=secreto',
        headers: { 'User-Agent': 'x', Cookie: 'sb=abc' },
        cookies: { sb: 'abc' },
        query_string: 'token=secreto',
      },
      contexts: { device: { model: 'iPhone' }, trace: { trace_id: 'abc' } },
      breadcrumbs: [{ message: 'click en ana@correo.mx' }],
      extra: { respuesta: 'datos privados' },
      transaction: '/repasar/01J8Z3Q4W5E6R7T8Y9V0B1C2D3',
      server_name: 'laptop-de-ana',
      modules: { a: '1' },
      tags: { screen: '/repasar', kind: 'error', otra: 'ana@correo.mx' },
    }) as unknown as Parameters<typeof scrubSentryEvent>[0];

  it('quita correos, ids, tokens y consultas del mensaje y de los textos de la traza', () => {
    const text = JSON.stringify(scrubSentryEvent(dirty()));
    expect(text).not.toMatch(/ana@|correo\.mx|01J8Z3Q4W5E6R7T8Y9V0B1C2D3|secreto|eyJabc|token=/);
    expect(text).toContain('[correo]');
    expect(text).toContain('[token]');
    expect(text).toContain('[id]');
  });

  it('se deshace de usuario, dirección, contextos, migas, datos extra y nombre de la máquina', () => {
    const clean = scrubSentryEvent(dirty());
    for (const key of [
      'user',
      'request',
      'contexts',
      'breadcrumbs',
      'extra',
      'transaction',
      'server_name',
      'modules',
    ]) {
      expect(clean, key).not.toHaveProperty(key);
    }
  });

  it('la huella solo pasa si es un hash de 16 caracteres hexadecimales', () => {
    const base = dirty();
    expect(scrubSentryEvent({ ...base, fingerprint: ['ana@correo.mx'] })).not.toHaveProperty(
      'fingerprint',
    );
    expect(scrubSentryEvent({ ...base, fingerprint: ['{{ default }}', 'ana'] })).not.toHaveProperty(
      'fingerprint',
    );
  });

  it('de cada línea de la traza deja solo dónde está, sin variables ni líneas de código', () => {
    const [frame] = scrubSentryEvent(dirty()).exception?.values?.[0]?.stacktrace?.frames ?? [];
    expect(frame).toMatchObject({
      function: 'rate',
      lineno: 10,
      colno: 20,
      in_app: true,
      debug_id: 'abc',
    });
    for (const key of ['vars', 'pre_context', 'context_line', 'post_context']) {
      expect(frame, key).not.toHaveProperty(key);
    }
    expect(frame?.filename).toBe('https://studiare.mx/assets/index-ab12.js?[q]');
  });

  it('conserva lo que Sentry necesita para agrupar y de las etiquetas solo la pantalla y el tipo', () => {
    const clean = scrubSentryEvent(dirty());
    expect(clean).toMatchObject({
      release: 'abc1234',
      environment: 'production',
      fingerprint: ['00112233445566aa'],
      level: 'error',
      platform: 'javascript',
      tags: { screen: '/repasar', kind: 'error' },
    });
    expect(clean.tags).not.toHaveProperty('otra');
    expect(clean.exception?.values?.[0]?.type).toBe('TypeError');
  });

  it('el mecanismo se escribe de nuevo, sin los datos que traía', () => {
    expect(scrubSentryEvent(dirty()).exception?.values?.[0]?.mechanism).toEqual({
      type: 'generic',
      handled: true,
    });
  });

  it('no toca el evento que recibe', () => {
    const event = dirty();
    const before = JSON.stringify(event);
    scrubSentryEvent(event);
    expect(JSON.stringify(event)).toBe(before);
  });

  it('recorta un mensaje larguísimo', () => {
    const clean = scrubSentryEvent({ ...dirty(), message: 'x'.repeat(5000) });
    expect(clean.message?.length).toBeLessThanOrEqual(300);
  });
});

describe('safeCopy', () => {
  it('de un valor que no es un Error arma uno con el mensaje del reporte', () => {
    const copy = safeCopy(report({ message: 'Se lanzó un valor que no es un Error' }), {
      secreto: 1,
    });
    expect(copy).toBeInstanceOf(Error);
    expect(copy.message).toBe('Se lanzó un valor que no es un Error');
    expect(JSON.stringify(copy)).not.toContain('secreto');
  });

  it('de un Error deja el nombre, el mensaje limpio y la traza, sin las propiedades de más', () => {
    const original = Object.assign(new TypeError('falló para ana@correo.mx'), {
      response: { body: 'datos privados' },
      cause: new Error('adentro ana@correo.mx'),
    });
    original.stack = [
      'TypeError: falló para ana@correo.mx',
      '    at rate (https://studiare.mx/assets/index-ab12.js:10:20)',
      'rate@https://studiare.mx/assets/index-ab12.js:11:21',
      'linea cualquiera con ana@correo.mx',
    ].join('\n');
    const copy = safeCopy(report(), original);
    expect(copy.name).toBe('TypeError');
    expect(copy.message).toBe('falló para [correo]');
    expect(copy.stack).toBe(
      [
        'TypeError: falló para [correo]',
        '    at rate (https://studiare.mx/assets/index-ab12.js:10:20)',
        'rate@https://studiare.mx/assets/index-ab12.js:11:21',
      ].join('\n'),
    );
    expect(copy).not.toHaveProperty('response');
    expect(copy.cause).toBeUndefined();
  });
});

describe('reportToSentry', () => {
  it('con todo en pie baja el SDK una sola vez, lo inicia y manda con la huella y la pantalla', async () => {
    await reportToSentry(report(), new Error('uno'));
    await reportToSentry(report({ fingerprint: 'bbbbbbbbbbbbbbbb' }), new Error('dos'));
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init.mock.calls[0]?.[0]).toMatchObject({
      dsn: DSN,
      release: 'abc1234',
      defaultIntegrations: false,
      maxBreadcrumbs: 0,
    });
    expect(sdk.captureException).toHaveBeenCalledTimes(2);
    expect(sdk.captureException.mock.calls[0]?.[1]).toEqual({
      fingerprint: ['00112233445566aa'],
      tags: { screen: '/repasar', kind: 'error' },
    });
    expect(sdk.captureException.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it('sin la bandera no baja el SDK ni manda nada', async () => {
    writeStoredFlags({ errorMonitoring: false });
    const loadsBefore = sdk.loads;
    await reportToSentry(report(), new Error('uno'));
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
    expect(sdk.loads).toBe(loadsBefore);
  });

  it('sin DSN tampoco', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    await reportToSentry(report(), new Error('uno'));
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it('si el SDK falla al capturar no lanza', async () => {
    sdk.captureException.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    await expect(reportToSentry(report(), new Error('uno'))).resolves.toBeUndefined();
  });
});

describe('sendBrowserTestAlert', () => {
  it('manda el mensaje fijo como error, sin datos, y espera a que salga', async () => {
    await expect(sendBrowserTestAlert()).resolves.toBe('sent');
    expect(sdk.captureMessage).toHaveBeenCalledWith(BROWSER_TEST_MESSAGE, {
      level: 'error',
      tags: { screen: '/prueba', kind: 'test' },
    });
    expect(sdk.flush).toHaveBeenCalled();
    expect(BROWSER_TEST_MESSAGE).toBe(MONITORING_TEST_MESSAGES.browser);
  });

  it('sin bandera o sin DSN dice blocked y no manda nada', async () => {
    writeStoredFlags({ errorMonitoring: false });
    await expect(sendBrowserTestAlert()).resolves.toBe('blocked');
    writeStoredFlags({ errorMonitoring: true });
    vi.stubEnv('VITE_SENTRY_DSN', '');
    await expect(sendBrowserTestAlert()).resolves.toBe('blocked');
    expect(sdk.captureMessage).not.toHaveBeenCalled();
  });
});
