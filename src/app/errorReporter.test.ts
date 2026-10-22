// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientErrorReport } from '@/data/telemetry/clientErrors';
import {
  MAX_REPORTS_PER_SESSION,
  errorReportingAllowed,
  installErrorReporter,
  reportClientError,
  resetErrorReporter,
  sendToDestinations,
  setErrorReportingAllowed,
} from './errorReporter';

let sent: ClientErrorReport[];
let originals: unknown[];
beforeEach(() => {
  sent = [];
  originals = [];
  resetErrorReporter((report, error) => {
    sent.push(report);
    originals.push(error);
    return Promise.resolve();
  });
});
afterEach(() => {
  resetErrorReporter();
});

describe('reportar un error', () => {
  it('con permiso lo manda', () => {
    setErrorReportingAllowed(true);
    reportClientError('error', new Error('uno'));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: 'error', message: 'Error: uno' });
  });

  it('sin permiso lo descarta', () => {
    setErrorReportingAllowed(false);
    reportClientError('error', new Error('uno'));
    expect(sent).toHaveLength(0);
  });

  it('mientras no se sabe el permiso lo guarda y solo lo manda si se da', () => {
    reportClientError('error', new Error('uno'));
    reportClientError('render', new Error('dos'));
    expect(sent).toHaveLength(0);
    setErrorReportingAllowed(true);
    expect(sent.map((report) => report.message)).toEqual(['Error: uno', 'Error: dos']);
  });

  it('si el permiso no se da, lo que esperaba se borra y no sale después', () => {
    reportClientError('error', new Error('uno'));
    setErrorReportingAllowed(false);
    setErrorReportingAllowed(true);
    expect(sent).toHaveLength(0);
  });

  it('si se deja de saber el permiso (cambió la cuenta), lo que llegue espera y no sale con el permiso anterior', () => {
    setErrorReportingAllowed(true);
    setErrorReportingAllowed(null);
    expect(errorReportingAllowed()).toBeNull();
    reportClientError('error', new Error('uno'));
    expect(sent).toHaveLength(0);
    setErrorReportingAllowed(false);
    expect(sent).toHaveLength(0);
  });

  it('el mismo error no se manda dos veces en la sesión', () => {
    setErrorReportingAllowed(true);
    reportClientError('error', new Error('uno'));
    reportClientError('error', new Error('uno'));
    expect(sent).toHaveLength(1);
  });

  it('manda unos pocos errores distintos por sesión', () => {
    setErrorReportingAllowed(true);
    for (let index = 0; index < MAX_REPORTS_PER_SESSION + 5; index += 1) {
      reportClientError('error', new Error(`falla ${index}`));
    }
    expect(sent).toHaveLength(MAX_REPORTS_PER_SESSION);
  });

  it('el ruido y los valores sin contenido no se mandan ni gastan el cupo', () => {
    setErrorReportingAllowed(true);
    reportClientError('error', 'Script error.');
    reportClientError('error', '');
    expect(sent).toHaveLength(0);
    reportClientError('error', new Error('real'));
    expect(sent).toHaveLength(1);
  });

  it('si el envío falla no lanza ni cuenta como error nuevo', async () => {
    resetErrorReporter(() => Promise.reject(new Error('sin red')));
    setErrorReportingAllowed(true);
    expect(() => {
      reportClientError('error', new Error('uno'));
    }).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('si el envío lanza de inmediato tampoco rompe', () => {
    resetErrorReporter(() => {
      throw new Error('mal');
    });
    setErrorReportingAllowed(true);
    expect(() => {
      reportClientError('error', new Error('uno'));
    }).not.toThrow();
  });
});

describe('escuchar los errores de la página', () => {
  // Un objeto aparte, para que jsdom no cuente los errores de la prueba como errores de la prueba
  const fakeWindow = () => new EventTarget() as unknown as Window;

  it('toma los errores sin atrapar y los rechazos sin atender, y deja de escuchar al pedirlo', () => {
    setErrorReportingAllowed(true);
    const target = fakeWindow();
    const stop = installErrorReporter(target);
    target.dispatchEvent(new ErrorEvent('error', { error: new Error('suelto') }));
    target.dispatchEvent(
      Object.assign(new Event('unhandledrejection'), { reason: new Error('prometido') }),
    );
    expect(sent.map((report) => [report.kind, report.message])).toEqual([
      ['error', 'Error: suelto'],
      ['rejection', 'Error: prometido'],
    ]);
    stop();
    target.dispatchEvent(new ErrorEvent('error', { error: new Error('después') }));
    expect(sent).toHaveLength(2);
  });

  it('un error sin objeto Error usa su mensaje', () => {
    setErrorReportingAllowed(true);
    const target = fakeWindow();
    const stop = installErrorReporter(target);
    target.dispatchEvent(new ErrorEvent('error', { message: 'Uncaught fallo raro' }));
    stop();
    expect(sent[0]?.message).toBe('Uncaught fallo raro');
  });
});

vi.mock('@/data/cloud/client', () => ({
  cloudConfigured: () => false,
  loadCloud: () => Promise.resolve(null),
}));

describe('el error original y los dos destinos (B15, 2.1)', () => {
  it('el emisor recibe el error original, para que Sentry lea la traza', () => {
    setErrorReportingAllowed(true);
    const original = new Error('uno');
    reportClientError('error', original);
    expect(originals).toEqual([original]);
  });

  it('un error que esperaba el permiso conserva su error original al entregarse', () => {
    const original = new Error('uno');
    reportClientError('error', original);
    expect(originals).toEqual([]);
    setErrorReportingAllowed(true);
    expect(originals).toEqual([original]);
  });

  it('sendToDestinations manda a Supabase y a Sentry, cada uno con lo suyo', async () => {
    const supabase = vi.fn(() => Promise.resolve());
    const sentry = vi.fn(() => Promise.resolve());
    const report = {
      fingerprint: 'a',
      kind: 'error',
      message: 'm',
      stack: null,
      screen: '/',
      version: 'v',
    } as const;
    const error = new Error('x');
    await sendToDestinations(report, error, { supabase, sentry });
    expect(supabase).toHaveBeenCalledWith(report);
    expect(sentry).toHaveBeenCalledWith(report, error);
  });

  it('si un destino falla o lanza, el otro igual recibe el reporte y nada lanza', async () => {
    const supabase = vi.fn(() => Promise.reject(new Error('sin red')));
    const sentry = vi.fn(() => Promise.resolve());
    const report = {
      fingerprint: 'a',
      kind: 'error',
      message: 'm',
      stack: null,
      screen: '/',
      version: 'v',
    } as const;
    await expect(sendToDestinations(report, null, { supabase, sentry })).resolves.toBeUndefined();
    expect(sentry).toHaveBeenCalledTimes(1);
    const throwing = vi.fn(() => {
      throw new Error('boom');
    });
    await expect(
      sendToDestinations(report, null, {
        supabase: vi.fn(() => Promise.resolve()),
        sentry: throwing,
      }),
    ).resolves.toBeUndefined();
  });
});
