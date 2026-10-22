// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/DataProvider';
import { makeUser } from '@/data/testing/fixtures';
import { setConsent } from '@/data/usecases/profile';
import type { ClientErrorReport } from '@/data/telemetry/clientErrors';
import { ErrorReportingGate } from './ErrorReportingGate';
import { errorReportingAllowed, reportClientError, resetErrorReporter } from './errorReporter';
import { DEFAULT_PREFERENCES, usePreferences } from './preferences';
import { renderApp, resetApp, type RenderedApp } from './testing/renderApp';
import { SCREENS } from './screens';

vi.setConfig({ testTimeout: 30_000 });
// La primera lectura abre la base y puede tardar más que el tope de espera de siempre
const WAIT = { timeout: 10_000 };

vi.mock('@/data/cloud/client', () => ({
  cloudConfigured: () => false,
  loadCloud: () => Promise.resolve(null),
}));

let sent: ClientErrorReport[];
let app: RenderedApp | undefined;
beforeEach(() => {
  sent = [];
  resetErrorReporter((report) => {
    sent.push(report);
    return Promise.resolve();
  });
});
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
  usePreferences.setState(DEFAULT_PREFERENCES);
  resetErrorReporter();
});

const mountGate = () =>
  render(
    <DataProvider kind="real">
      <ErrorReportingGate />
    </DataProvider>,
  );

describe('permiso para reportar errores', () => {
  it('con el permiso de mejora anónima manda los errores que lleguen', async () => {
    app = await renderApp(SCREENS.review.path, {
      seed: async (api, user) => {
        await setConsent(api, user, 'anonymized_improvement', true);
      },
    });
    cleanup();
    mountGate();
    await waitFor(() => {
      expect(errorReportingAllowed()).toBe(true);
    }, WAIT);
    reportClientError('error', new Error('con permiso'));
    expect(sent.map((report) => report.message)).toEqual(['Error: con permiso']);
  });

  it('sin ese permiso descarta los errores, aunque tenga los otros permisos', async () => {
    app = await renderApp(SCREENS.review.path, {
      seed: async (api, user) => {
        await setConsent(api, user, 'party', true);
        await setConsent(api, user, 'ai_analysis', true);
      },
    });
    cleanup();
    mountGate();
    await waitFor(() => {
      expect(errorReportingAllowed()).toBe(false);
    }, WAIT);
    reportClientError('error', new Error('después'));
    expect(sent).toHaveLength(0);
  });

  it('sin sesión no manda nada', async () => {
    usePreferences.setState({ sessionUserId: null });
    reportClientError('error', new Error('visitante'));
    mountGate();
    await waitFor(() => {
      expect(errorReportingAllowed()).toBe(false);
    }, WAIT);
    reportClientError('error', new Error('otro'));
    expect(sent).toHaveLength(0);
  });

  it('retirar el permiso corta el envío', async () => {
    app = await renderApp(SCREENS.review.path, {
      seed: async (api, user) => {
        await setConsent(api, user, 'anonymized_improvement', true);
      },
    });
    cleanup();
    mountGate();
    await waitFor(() => {
      expect(errorReportingAllowed()).toBe(true);
    }, WAIT);
    await setConsent(app.api, app.user, 'anonymized_improvement', false);
    await waitFor(() => {
      expect(errorReportingAllowed()).toBe(false);
    }, WAIT);
    reportClientError('error', new Error('tras retirar'));
    expect(sent).toHaveLength(0);
  });
  it('en un cambio directo de cuenta, el permiso de la anterior no vale mientras se lee el de la nueva', async () => {
    app = await renderApp(SCREENS.review.path, {
      seed: async (api, user) => {
        await setConsent(api, user, 'anonymized_improvement', true);
      },
    });
    cleanup();
    // La cuenta que entra no ha decidido nada
    const next = makeUser();
    await app.api.repos.users.put(next);
    mountGate();
    await waitFor(() => {
      expect(errorReportingAllowed()).toBe(true);
    }, WAIT);

    // La lectura de la cuenta nueva se detiene a propósito, para ver ese rato
    const original = app.api.repos.consents.list.bind(app.api.repos.consents);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi.spyOn(app.api.repos.consents, 'list').mockImplementation(async () => {
      await held;
      return original();
    });
    await act(async () => {
      usePreferences.setState({ sessionUserId: next.id });
      await Promise.resolve();
    });
    expect(errorReportingAllowed()).toBeNull();
    reportClientError('error', new Error('en lo que se lee'));
    expect(sent).toHaveLength(0);

    release();
    await waitFor(() => {
      expect(errorReportingAllowed()).toBe(false);
    }, WAIT);
    // Lo que esperaba se tira, porque la cuenta nueva no dio el permiso
    expect(sent).toHaveLength(0);
    spy.mockRestore();
  });
});
