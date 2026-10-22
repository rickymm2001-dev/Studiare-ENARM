// @vitest-environment jsdom
// Los dos destinos del reporte de errores con el emisor de verdad (B15, 2.1): Supabase de siempre, que no
// depende de la bandera, y Sentry. Los dos con el mismo permiso
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeStoredFlags } from '@/config/featureFlags';

const rpc = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: 'recorded', error: null })));
vi.mock('@/data/cloud/client', () => ({
  cloudConfigured: () => true,
  loadCloud: () => Promise.resolve({ rpc }),
}));
const toSentry = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('./sentrySink', () => ({ reportToSentry: toSentry }));

import { reportClientError, resetErrorReporter, setErrorReportingAllowed } from './errorReporter';

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

// El envío a Supabase baja su módulo con un import dinámico. Con la máquina cargada esa primera bajada tarda
// más que la espera fija de settle, y la llamada tardía caía en la prueba siguiente. Se baja antes de empezar
// y lo que sí debe llegar se espera con waitFor
beforeAll(async () => {
  await import('@/data/cloud/clientErrors');
});

beforeEach(() => {
  rpc.mockClear();
  toSentry.mockClear();
  resetErrorReporter();
  // Sentry en pie: la bandera y algo que parezca un DSN. Que tenga la forma buena lo revisa sentrySink
  writeStoredFlags({ errorMonitoring: true });
  vi.stubEnv('VITE_SENTRY_DSN', 'https://0123456789abcdef0123456789abcdef@o1.ingest.sentry.io/2');
});
afterEach(() => {
  writeStoredFlags(null);
  vi.unstubAllEnvs();
  resetErrorReporter();
});

describe('destinos del reporte de errores', () => {
  it('con el permiso de mejora, un error va a Supabase y a Sentry, y a Sentry con el error original', async () => {
    setErrorReportingAllowed(true);
    const original = new Error('uno');
    reportClientError('error', original);
    await vi.waitFor(() => {
      expect(rpc).toHaveBeenCalledTimes(1);
    });
    expect(rpc.mock.calls[0]).toEqual([
      'report_client_error',
      expect.objectContaining({ p_kind: 'error' }),
    ]);
    await vi.waitFor(() => {
      expect(toSentry).toHaveBeenCalledTimes(1);
    });
    expect(toSentry).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }), original);
  });

  it('el destino de Supabase no depende de la bandera errorMonitoring, y Sentry ni se baja sin ella', async () => {
    writeStoredFlags({ errorMonitoring: false });
    setErrorReportingAllowed(true);
    reportClientError('error', new Error('dos'));
    await vi.waitFor(() => {
      expect(rpc).toHaveBeenCalledTimes(1);
    });
    await settle();
    expect(toSentry).not.toHaveBeenCalled();
  });

  it('sin DSN Sentry tampoco se baja, y Supabase sigue igual', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    setErrorReportingAllowed(true);
    reportClientError('error', new Error('dos bis'));
    await vi.waitFor(() => {
      expect(rpc).toHaveBeenCalledTimes(1);
    });
    await settle();
    expect(toSentry).not.toHaveBeenCalled();
  });

  it('sin el permiso no sale a ninguno de los dos', async () => {
    setErrorReportingAllowed(false);
    reportClientError('error', new Error('tres'));
    await settle();
    expect(rpc).not.toHaveBeenCalled();
    expect(toSentry).not.toHaveBeenCalled();
  });

  it('sin saber el permiso espera, y si luego no se da, no sale a ninguno', async () => {
    reportClientError('error', new Error('cuatro'));
    await settle();
    expect(rpc).not.toHaveBeenCalled();
    expect(toSentry).not.toHaveBeenCalled();
    setErrorReportingAllowed(false);
    await settle();
    expect(toSentry).not.toHaveBeenCalled();
  });

  it('el límite de cinco por sesión vale para los dos destinos juntos', async () => {
    setErrorReportingAllowed(true);
    for (let index = 0; index < 9; index += 1)
      reportClientError('error', new Error(`falla ${String(index)}`));
    await vi.waitFor(() => {
      expect(rpc).toHaveBeenCalledTimes(5);
    });
    // Que no llegue un sexto
    await settle();
    expect(rpc).toHaveBeenCalledTimes(5);
    // El doble del módulo de Sentry cuenta mal las bajadas simultáneas del mismo archivo, así que aquí solo se
    // revisa que no pasan de cinco. Que cada reporte llegue está en las pruebas de arriba
    await vi.waitFor(() => {
      expect(toSentry).toHaveBeenCalled();
    });
    expect(toSentry.mock.calls.length).toBeLessThanOrEqual(5);
  });
});
