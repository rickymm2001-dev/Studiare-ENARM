// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientErrorReport } from '@/data/telemetry/clientErrors';
import {
  MAX_REPORTS_PER_SESSION,
  installErrorReporter,
  reportClientError,
  resetErrorReporter,
  setErrorReportingAllowed,
} from './errorReporter';

let sent: ClientErrorReport[];
beforeEach(() => {
  sent = [];
  resetErrorReporter((report) => {
    sent.push(report);
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
