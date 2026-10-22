// @vitest-environment jsdom
// AnalyticsGate le pasa al cliente de analítica lo que sabe la sesión (B15, 1.2, 1.3 y 6.1). Con la llave
// falsa puesta, solo con el permiso, la bandera, la base real y la cuenta de la nube conectada sale algo.
// El cliente es el real, y el fetch y la nube son falsos.
import 'fake-indexeddb/auto';
import { cleanup, render, waitFor } from '@testing-library/react';
import { act, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeStoredFlags } from '@/config/featureFlags';
import { analyticsState, resetAnalyticsControl } from '@/data/analytics/control';
import { analyticsConsent, resetAnalytics, track } from '@/data/analytics/catalog';
import { DataProvider } from '@/data/DataProvider';
import { makeUser, newId } from '@/data/testing/fixtures';
import type { User } from '@/data/schemas/people';
import { setConsent } from '@/data/usecases/profile';
import { AnalyticsGate } from './AnalyticsGate';
import { useCloud } from './cloudState';
import { DEFAULT_PREFERENCES, usePreferences } from './preferences';
import { resetApp } from './testing/renderApp';
import type { DataApi } from '@/data/context';
import { useDataApi } from '@/data/context';

vi.setConfig({ testTimeout: 30_000 });
const WAIT = { timeout: 10_000 };

const KEY = 'phc_SimuladaPruebasStudiare00000000000000000000';
const ID_1 = '2f5b0c38-6a52-4a1f-9d57-3c7a9d1f0b11';
const ID_2 = '9a1c7e52-0b3d-4c6e-8f21-5d4e3a2b1c00';

/** Lo que el servidor cree del permiso de una cuenta y cada llamada que le hacen con su sesión */
interface FakeServer {
  consent: boolean;
  id: string;
  calls: string[];
  failIdentity: number;
}
const freshServer = (id: string): FakeServer => ({
  consent: false,
  id,
  calls: [],
  failIdentity: 0,
});

/** La cuenta de siempre, auth-1. Las pruebas de cambio de cuenta agregan otras en accounts */
const server = freshServer(ID_1);
const accounts = new Map<string, FakeServer>();
/** El servidor de la cuenta con la que está abierta la sesión de la nube en este momento */
const serverOfSession = (): FakeServer => {
  const cloudState = useCloud.getState().state;
  return cloudState.status === 'linked'
    ? (accounts.get(cloudState.identity.authId) ?? server)
    : server;
};

/** La nube falsa */
const cloud = {
  rpc: vi.fn((name: string, args?: { p_granted?: boolean }) => {
    const account = serverOfSession();
    account.calls.push(args ? `${name}(${String(args.p_granted)})` : name);
    if (name === 'analytics_identity') {
      if (account.failIdentity > 0) {
        account.failIdentity -= 1;
        return Promise.resolve({ data: null, error: { message: 'sin red' } });
      }
      return Promise.resolve({
        data: { analyticsId: account.id, consent: account.consent },
        error: null,
      });
    }
    if (args?.p_granted === false && account.consent) account.id = ID_2;
    account.consent = args?.p_granted === true;
    return Promise.resolve({
      data: { analyticsId: account.id, consent: account.consent },
      error: null,
    });
  }),
};

vi.mock('@/data/cloud/client', () => ({
  cloudConfigured: () => true,
  getCloud: () => cloud,
  loadCloud: () => Promise.resolve(cloud),
}));

const fetched: { url: string; body: { batch: { distinct_id: string; event: string }[] } }[] = [];

beforeEach(() => {
  vi.stubEnv('VITE_APP_ENV', 'production');
  vi.stubEnv('VITE_POSTHOG_KEY', KEY);
  vi.stubEnv('VITE_POSTHOG_HOST', 'https://us.i.posthog.com');
  writeStoredFlags({ productAnalytics: true });
  server.consent = false;
  server.id = ID_1;
  server.calls = [];
  server.failIdentity = 0;
  accounts.clear();
  fetched.length = 0;
  cloud.rpc.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      fetched.push({
        url,
        body: JSON.parse(init.body as string) as (typeof fetched)[number]['body'],
      });
      return Promise.resolve(new Response('{}', { status: 200 }));
    }),
  );
});
afterEach(async () => {
  cleanup();
  resetAnalyticsControl();
  resetAnalytics();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  writeStoredFlags(null);
  useCloud.getState().set({ status: 'checking' });
  usePreferences.setState(DEFAULT_PREFERENCES);
  await resetApp(captured);
  captured = undefined;
});

let captured: DataApi | undefined;
function Capture() {
  const value = useDataApi();
  useEffect(() => {
    captured = value;
  }, [value]);
  return null;
}

const USER = makeUser();

/** El cliente completo, que control.ts baja aparte. Es el mismo archivo que baja la app */
const client = () => import('@/data/analytics/client').then((module) => module.analytics);

/** Otra cuenta del mismo dispositivo, con sus decisiones del permiso, de la más vieja a la más nueva */
interface OtherAccount {
  user: User;
  grants: boolean[];
}

async function seedGrants(user: User, grants: boolean[]) {
  await captured?.repos.users.put(user);
  let at = 0;
  for (const granted of grants) {
    at += 1;
    await captured?.repos.consents.put({
      id: newId(),
      userId: user.id,
      purpose: 'product_analytics',
      noticeVersion: '2026-10-21',
      status: granted ? 'granted' : 'revoked',
      decidedAt: `2026-10-01T00:00:0${String(at)}.000Z`,
    });
  }
}

/** Abre el gate con un alumno sembrado. grants dice qué decisiones del permiso hay, de la más vieja a la más nueva */
async function mountGate(options: {
  grants?: boolean[];
  kind?: 'real' | 'demo';
  linked?: boolean;
  retryMs?: number;
  others?: OtherAccount[];
}) {
  const { grants = [], kind = 'real', linked = true, retryMs, others = [] } = options;
  if (kind === 'real') {
    // Se siembra con una montura aparte, así el gate nace ya con la bitácora lista
    render(
      <DataProvider kind="real">
        <Capture />
      </DataProvider>,
    );
    await waitFor(() => {
      expect(captured).toBeDefined();
    }, WAIT);
    await seedGrants(USER, grants);
    for (const other of others) await seedGrants(other.user, other.grants);
    cleanup();
  }
  usePreferences.setState({ sessionUserId: kind === 'real' ? USER.id : null });
  if (linked) {
    useCloud.getState().set({
      status: 'linked',
      identity: { authId: 'auth-1', email: 'a@b.mx', role: 'student', alias: null },
    });
  }
  render(
    <DataProvider kind={kind}>
      <Capture />
      <AnalyticsGate {...(retryMs === undefined ? {} : { retryMs })} />
    </DataProvider>,
  );
}

const review = () => {
  track('review_session_completed', { items: '10-49', minutes: '5-14' });
};

describe('AnalyticsGate', () => {
  it('sin el permiso no junta, no manda y no le pregunta nada al servidor', async () => {
    await mountGate({ grants: [] });
    await waitFor(() => {
      expect(analyticsConsent()).toBe(false);
    }, WAIT);
    review();
    (await client()).flush();
    expect(analyticsState()).toBe('off');
    expect(fetched).toEqual([]);
    expect(server.calls).toEqual([]);
  });

  it('con el permiso pide el identificador, avisa al servidor y manda con ese identificador', async () => {
    await mountGate({ grants: [true] });
    await waitFor(() => {
      expect(analyticsState()).toBe('sending');
    }, WAIT);
    expect(server.calls).toEqual(['analytics_identity', 'set_analytics_consent(true)']);
    review();
    (await client()).flush();
    await waitFor(() => {
      expect(fetched).toHaveLength(1);
    }, WAIT);
    expect(fetched[0]?.url).toBe('https://us.i.posthog.com/batch/');
    expect(fetched[0]?.body.batch[0]).toMatchObject({
      event: 'review_session_completed',
      distinct_id: ID_1,
    });
  });

  it('si el servidor ya sabía del permiso no lo vuelve a avisar', async () => {
    server.consent = true;
    await mountGate({ grants: [true] });
    await waitFor(() => {
      expect(analyticsState()).toBe('sending');
    }, WAIT);
    expect(server.calls).toEqual(['analytics_identity']);
  });

  it('retirar el permiso corta el envío, tira lo que esperaba y avisa al servidor, que cambia el identificador', async () => {
    server.consent = true;
    await mountGate({ grants: [true] });
    await waitFor(() => {
      expect(analyticsState()).toBe('sending');
    }, WAIT);
    review();
    expect((await client()).queued()).toBe(1);
    await act(async () => {
      await setConsent(captured as DataApi, USER, 'product_analytics', false);
    });
    await waitFor(() => {
      expect(analyticsState()).toBe('off');
    }, WAIT);
    expect((await client()).queued()).toBe(0);
    await waitFor(() => {
      expect(server.calls).toContain('set_analytics_consent(false)');
    }, WAIT);
    expect(server.id).toBe(ID_2);
    (await client()).flush();
    expect(fetched).toEqual([]);
  });

  it('quien nunca dio el permiso no deja ninguna fila en el servidor, ni al abrir ni al apagarlo', async () => {
    await mountGate({ grants: [false] });
    await waitFor(() => {
      expect(analyticsConsent()).toBe(false);
    }, WAIT);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(server.calls).toEqual([]);
  });

  it('quien dio el permiso y lo retiró en otro momento revisa el servidor y lo apaga si seguía en sí', async () => {
    server.consent = true;
    await mountGate({ grants: [true, false] });
    await waitFor(() => {
      expect(server.calls).toEqual(['analytics_identity', 'set_analytics_consent(false)']);
    }, WAIT);
    expect(analyticsState()).toBe('off');
  });

  it('si el servidor ya tenía el permiso en no, retirarlo no cambia el identificador otra vez', async () => {
    server.consent = false;
    await mountGate({ grants: [true, false] });
    await waitFor(() => {
      expect(server.calls).toEqual(['analytics_identity']);
    }, WAIT);
    expect(server.id).toBe(ID_1);
  });

  it('la base de demostración nunca mide, aunque todo lo demás esté en regla', async () => {
    await mountGate({ kind: 'demo' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    review();
    expect(analyticsState()).toBe('off');
    expect(server.calls).toEqual([]);
    expect(fetched).toEqual([]);
  });

  it('sin la cuenta de la nube junta y espera, sin pedir identificador ni mandar', async () => {
    await mountGate({ grants: [true], linked: false });
    await waitFor(() => {
      expect(analyticsState()).toBe('collecting');
    }, WAIT);
    review();
    (await client()).flush();
    expect((await client()).queued()).toBe(1);
    expect(fetched).toEqual([]);
    expect(server.calls).toEqual([]);
  });

  it('con la bandera apagada no junta ni manda aunque haya permiso y llave', async () => {
    writeStoredFlags({ productAnalytics: false });
    await mountGate({ grants: [true] });
    await waitFor(() => {
      expect(analyticsConsent()).toBe(false);
    }, WAIT);
    expect(analyticsState()).toBe('off');
    expect(server.calls).toEqual([]);
  });

  it('en desarrollo no mide, aunque haya permiso, llave y bandera', async () => {
    vi.stubEnv('VITE_APP_ENV', 'development');
    await mountGate({ grants: [true] });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(analyticsState()).toBe('off');
    expect(server.calls).toEqual([]);
  });

  it('si el servidor no contesta, reintenta el identificador sin mandar nada mientras tanto', async () => {
    server.failIdentity = 1;
    await mountGate({ grants: [true], retryMs: 50 });
    await waitFor(() => {
      expect(server.calls[0]).toBe('analytics_identity');
    }, WAIT);
    expect(analyticsState()).not.toBe('off');
    review();
    expect(fetched).toEqual([]);
    await waitFor(() => {
      expect(analyticsState()).toBe('sending');
    }, WAIT);
    expect(server.calls.filter((call) => call === 'analytics_identity')).toHaveLength(2);
  });

  it('deja de reintentar después de cuatro veces', async () => {
    server.failIdentity = 99;
    await mountGate({ grants: [true], retryMs: 20 });
    await new Promise((resolve) => setTimeout(resolve, 400));
    // La primera llamada y cuatro reintentos
    expect(server.calls.filter((call) => call === 'analytics_identity')).toHaveLength(5);
    expect(analyticsState()).toBe('collecting');
  });
  describe('reintentos del aviso al servidor', () => {
    const identityCalls = () => server.calls.filter((call) => call === 'analytics_identity').length;
    /** Espera a que se gasten la primera llamada y los cuatro reintentos, y deja un rato para ver que no hay un sexto */
    const exhaust = async () => {
      await waitFor(() => {
        expect(identityCalls()).toBe(5);
      }, WAIT);
      await new Promise((resolve) => setTimeout(resolve, 150));
    };

    it('un dar que se quedó sin intentos no deja sin intentos al retiro que viene después', async () => {
      server.failIdentity = 99;
      await mountGate({ grants: [true], retryMs: 20 });
      await exhaust();
      expect(identityCalls()).toBe(5);

      // El servidor ya tenía el sí. La primera revisión del retiro falla y la segunda sí contesta
      server.consent = true;
      server.failIdentity = 1;
      await act(async () => {
        await setConsent(captured as DataApi, USER, 'product_analytics', false);
      });
      await waitFor(() => {
        expect(server.calls).toContain('set_analytics_consent(false)');
      }, WAIT);
      expect(server.consent).toBe(false);
      expect(server.id).toBe(ID_2);
    });

    it('al volver la red intenta otra vez lo que quedó sin avisar, con los intentos en cero', async () => {
      server.failIdentity = 99;
      await mountGate({ grants: [true], retryMs: 20 });
      await exhaust();
      expect(identityCalls()).toBe(5);
      expect(analyticsState()).toBe('collecting');

      server.failIdentity = 0;
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
      await waitFor(() => {
        expect(analyticsState()).toBe('sending');
      }, WAIT);
      expect(server.calls).toContain('set_analytics_consent(true)');
    });

    it('un retiro sin red se vuelve a intentar al volver la red, aunque la app siga abierta', async () => {
      server.consent = true;
      server.failIdentity = 99;
      await mountGate({ grants: [true, false], retryMs: 20 });
      await exhaust();
      expect(identityCalls()).toBe(5);
      expect(server.consent).toBe(true);

      server.failIdentity = 0;
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
      await waitFor(() => {
        expect(server.calls).toContain('set_analytics_consent(false)');
      }, WAIT);
      expect(server.consent).toBe(false);
      expect(server.id).toBe(ID_2);
    });

    it('volver la red sin nada pendiente no le pregunta nada al servidor', async () => {
      await mountGate({ grants: [true] });
      await waitFor(() => {
        expect(analyticsState()).toBe('sending');
      }, WAIT);
      const before = server.calls.length;
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(server.calls).toHaveLength(before);
    });
  });

  describe('cambio directo de cuenta', () => {
    const OTHER = makeUser();
    const ID_OTHER = '5c0d8e1f-7b2a-4d93-a6c4-1e8f3b9a2d70';

    /** Cambia de la cuenta de siempre a OTHER sin pasar por sin sesión, como el puente de la nube */
    const switchToOther = () =>
      act(async () => {
        usePreferences.setState({ sessionUserId: OTHER.id });
        useCloud.getState().set({
          status: 'linked',
          identity: { authId: 'auth-B', email: 'b@b.mx', role: 'student', alias: null },
        });
        await Promise.resolve();
      });

    it('el permiso de la cuenta anterior no se le aplica a la nueva, ni en el servidor ni en lo que se manda', async () => {
      accounts.set('auth-B', freshServer(ID_OTHER));
      await mountGate({ grants: [true], others: [{ user: OTHER, grants: [] }] });
      await waitFor(() => {
        expect(analyticsState()).toBe('sending');
      }, WAIT);
      // Un evento de la cuenta anterior que todavía no salió
      review();
      expect((await client()).queued()).toBe(1);

      await switchToOther();
      await waitFor(() => {
        expect(analyticsState()).toBe('off');
      }, WAIT);
      // Se deja pasar el tiempo para que cualquier llamada tardía ocurra
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(accounts.get('auth-B')?.calls).toEqual([]);
      expect(accounts.get('auth-B')?.consent).toBe(false);
      expect((await client()).queued()).toBe(0);
      (await client()).flush();
      expect(fetched).toEqual([]);
    });

    it('si la cuenta nueva sí dio el permiso, manda con su identificador y nada de lo de la anterior', async () => {
      accounts.set('auth-B', freshServer(ID_OTHER));
      await mountGate({ grants: [true], others: [{ user: OTHER, grants: [true] }] });
      await waitFor(() => {
        expect(analyticsState()).toBe('sending');
      }, WAIT);
      review();

      await switchToOther();
      await waitFor(() => {
        expect(accounts.get('auth-B')?.calls).toEqual([
          'analytics_identity',
          'set_analytics_consent(true)',
        ]);
      }, WAIT);
      await waitFor(() => {
        expect(analyticsState()).toBe('sending');
      }, WAIT);
      // Lo que esperaba de la cuenta anterior se tiró
      expect((await client()).queued()).toBe(0);
      review();
      (await client()).flush();
      await waitFor(() => {
        expect(fetched).toHaveLength(1);
      }, WAIT);
      expect(fetched[0]?.body.batch).toHaveLength(1);
      expect(fetched[0]?.body.batch[0]).toMatchObject({ distinct_id: ID_OTHER });
      expect(fetched.flatMap((call) => call.body.batch.map((event) => event.distinct_id))).toEqual([
        ID_OTHER,
      ]);
    });
  });
});
