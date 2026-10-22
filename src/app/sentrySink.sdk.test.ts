// @vitest-environment jsdom
// Sentry de verdad, con las opciones de la app y un transporte falso (B15, 2.1 y 6.3). Comprueba lo que el
// doble de sentrySink.test.ts no puede: que sin integraciones el SDK no escucha nada por su cuenta, y que el
// sobre que saldría hacia Sentry no lleva usuario, dirección, contextos, migas ni datos personales
import * as Sentry from '@sentry/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { safeCopy, sentryOptions } from './sentrySink';

const DSN =
  'https://0123456789abcdef0123456789abcdef@o4500000000000000.ingest.sentry.io/4500000000000001';

type Envelope = [Record<string, unknown>, [Record<string, unknown>, Record<string, unknown>][]];

function start() {
  const sent: Envelope[] = [];
  Sentry.init({
    ...sentryOptions(DSN, { release: 'abc1234', environment: 'production' }),
    transport: () => ({
      send: (envelope) => {
        sent.push(envelope as unknown as Envelope);
        return Promise.resolve({});
      },
      flush: () => Promise.resolve(true),
    }),
  });
  const events = () =>
    sent.flatMap(([, items]) =>
      items.filter(([header]) => header.type === 'event').map(([, payload]) => payload),
    );
  return { sent, events };
}

afterEach(async () => {
  await Sentry.close();
});

const report = {
  fingerprint: '00aa11bb22cc33dd',
  kind: 'error' as const,
  message: 'TypeError: falló',
  stack: null,
  screen: '/repasar',
  version: 'abc1234',
};

describe('el SDK de Sentry con las opciones de la app', () => {
  it('un error capturado sale limpio: sin usuario, dirección, contextos, migas ni datos extra', async () => {
    const { events } = start();
    const original = Object.assign(
      new TypeError('falló para ana@correo.mx en /repasar?token=abc'),
      {
        response: { body: 'datos privados de Ana' },
      },
    );
    // Ensucia el contexto del SDK a propósito: nada de esto debe salir
    Sentry.setUser({ id: 'u1', email: 'ana@correo.mx', ip_address: '189.1.2.3' });
    Sentry.setContext('alumno', { alias: 'Ana' });
    Sentry.setExtra('respuesta', 'datos privados de Ana');
    Sentry.addBreadcrumb({ message: 'click de ana@correo.mx' });
    Sentry.captureException(safeCopy(report, original), {
      fingerprint: [report.fingerprint],
      tags: { screen: report.screen, kind: report.kind },
    });
    await Sentry.flush(1000);

    const [event] = events();
    expect(event).toBeDefined();
    const text = JSON.stringify(event);
    expect(text).not.toMatch(/ana@|correo\.mx|189\.1\.2\.3|datos privados|Ana|token=abc|u1/);
    for (const key of [
      'user',
      'request',
      'contexts',
      'breadcrumbs',
      'extra',
      'server_name',
      'modules',
    ]) {
      expect(event, key).not.toHaveProperty(key);
    }
    expect(event).toMatchObject({
      release: 'abc1234',
      environment: 'production',
      fingerprint: ['00aa11bb22cc33dd'],
      tags: { screen: '/repasar', kind: 'error' },
    });
    expect(
      (event?.exception as { values: { type: string; value: string }[] }).values[0],
    ).toMatchObject({ type: 'TypeError', value: 'falló para [correo] en /repasar?[q]' });
  });

  it('sin integraciones el SDK no escucha los errores de la página por su cuenta', async () => {
    const { sent } = start();
    // El error suelto es de mentira. Con un oyente propio, el ejecutor de pruebas no lo cuenta como falla suya
    const listener = () => undefined;
    window.addEventListener('error', listener);
    try {
      window.dispatchEvent(
        new ErrorEvent('error', { error: new Error('suelto'), message: 'suelto' }),
      );
      window.dispatchEvent(
        new PromiseRejectionEvent('unhandledrejection', {
          promise: Promise.resolve(),
          reason: new Error('rechazo suelto'),
        }),
      );
      await Sentry.flush(500);
    } finally {
      window.removeEventListener('error', listener);
    }
    expect(sent).toEqual([]);
  });

  it('no manda sesiones ni informes del cliente, solo el evento', async () => {
    const { sent } = start();
    Sentry.captureMessage('Prueba', { level: 'error' });
    await Sentry.flush(1000);
    const types = sent.flatMap(([, items]) => items.map(([header]) => header.type));
    expect(types).toEqual(['event']);
  });

  it('el mensaje de la prueba de alertas llega como error y sin datos', async () => {
    const { events } = start();
    Sentry.captureMessage('Prueba de alertas de Studiare, navegador', {
      level: 'error',
      tags: { screen: '/prueba', kind: 'test' },
    });
    await Sentry.flush(1000);
    const [event] = events();
    expect(event).toMatchObject({
      level: 'error',
      message: 'Prueba de alertas de Studiare, navegador',
      tags: { screen: '/prueba', kind: 'test' },
    });
    expect(event).not.toHaveProperty('user');
  });
});
