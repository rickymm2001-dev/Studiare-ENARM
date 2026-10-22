// @vitest-environment jsdom
// El control de la analítica en lo inicial (B15, 1.4 y 5.4): cuándo es posible medir, cuándo se baja el cliente
// completo y qué pasa con los eventos que llegan mientras se baja. El cliente es el de verdad y el fetch es falso
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeStoredFlags } from '@/config/featureFlags';
import { analyticsConsent, resetAnalytics, track } from './catalog';
import {
  MAX_EARLY_EVENTS,
  analyticsPossible,
  analyticsState,
  resetAnalyticsControl,
  trackSignupCompleted,
  updateAnalytics,
} from './control';

const KEY = 'phc_SimuladaPruebasStudiare00000000000000000000';
const ID = '2f5b0c38-6a52-4a1f-9d57-3c7a9d1f0b11';
const client = () => import('./client').then((module) => module.analytics);

const calls: { url: string; events: { event: string; distinct_id: string }[] }[] = [];

function allInPlace() {
  vi.stubEnv('VITE_APP_ENV', 'production');
  vi.stubEnv('VITE_POSTHOG_KEY', KEY);
  vi.stubEnv('VITE_POSTHOG_HOST', 'https://us.i.posthog.com');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://abcd1234.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_' + 'simulada_para_pruebas_0123456789');
  writeStoredFlags({ productAnalytics: true });
}

beforeEach(() => {
  allInPlace();
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { batch: (typeof calls)[number]['events'] };
      calls.push({ url, events: body.batch });
      return Promise.resolve(new Response('{}', { status: 200 }));
    }),
  );
});
afterEach(() => {
  resetAnalyticsControl();
  resetAnalytics();
  writeStoredFlags(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const party = () => {
  track('party_group_joined', {});
};

describe('analyticsPossible', () => {
  it('con la bandera, la llave, la nube y un entorno que no es desarrollo es posible', () => {
    expect(analyticsPossible()).toBe(true);
  });

  it('falta una cosa y no es posible', () => {
    writeStoredFlags({ productAnalytics: false });
    expect(analyticsPossible()).toBe(false);
    writeStoredFlags({ productAnalytics: true });
    vi.stubEnv('VITE_POSTHOG_KEY', '');
    expect(analyticsPossible()).toBe(false);
    vi.stubEnv('VITE_POSTHOG_KEY', KEY);
    vi.stubEnv('VITE_APP_ENV', 'development');
    expect(analyticsPossible()).toBe(false);
    vi.stubEnv('VITE_APP_ENV', 'production');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    expect(analyticsPossible()).toBe(false);
  });
});

describe('updateAnalytics', () => {
  it('sin permiso no baja el cliente ni junta nada', async () => {
    updateAnalytics({ database: 'real', consent: false });
    party();
    expect(analyticsState()).toBe('off');
    expect(analyticsConsent()).toBe(false);
    await Promise.resolve();
    expect(calls).toEqual([]);
  });

  it('sin saber el permiso lo deja en null y tampoco junta', () => {
    updateAnalytics({ database: 'real' });
    party();
    expect(analyticsState()).toBe('off');
    expect(analyticsConsent()).toBeNull();
  });

  it('con permiso baja el cliente, y los eventos que llegaron mientras tanto pasan a su cola', async () => {
    updateAnalytics({ consent: true });
    expect(analyticsState()).toBe('loading');
    party();
    party();
    const analytics = await client();
    await vi.waitFor(() => {
      expect(analyticsState()).toBe('collecting');
    });
    expect(analytics.queued()).toBe(2);
    // Con el identificador, los dos salen juntos
    updateAnalytics({ analyticsId: ID });
    analytics.flush();
    await vi.waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    expect(calls[0]?.events.map((event) => event.event)).toEqual([
      'party_group_joined',
      'party_group_joined',
    ]);
    expect(calls[0]?.events[0]?.distinct_id).toBe(ID);
  });

  it('retirar el permiso mientras el cliente se baja tira lo que esperaba', async () => {
    updateAnalytics({ consent: true });
    party();
    updateAnalytics({ consent: false });
    expect(analyticsState()).toBe('off');
    const analytics = await client();
    await Promise.resolve();
    expect(analytics.queued()).toBe(0);
    updateAnalytics({ analyticsId: ID });
    analytics.flush();
    expect(calls).toEqual([]);
  });

  it('la cola de emergencia tiene tope y suelta lo más viejo', async () => {
    updateAnalytics({ consent: true });
    for (let index = 0; index < MAX_EARLY_EVENTS + 10; index += 1) party();
    const analytics = await client();
    await vi.waitFor(() => {
      expect(analyticsState()).toBe('collecting');
    });
    // La cola del cliente también tiene su tope, que es el mismo
    expect(analytics.queued()).toBe(MAX_EARLY_EVENTS);
  });

  it('con la base de demostración nunca junta, aunque haya permiso', () => {
    updateAnalytics({ consent: true, database: 'demo' });
    party();
    expect(analyticsState()).toBe('off');
  });

  it('en desarrollo nunca junta, aunque haya llave, bandera y permiso', () => {
    vi.stubEnv('VITE_APP_ENV', 'development');
    resetAnalyticsControl();
    updateAnalytics({ consent: true });
    party();
    expect(analyticsState()).toBe('off');
  });

  it('con el cliente ya bajado, los cambios los decide el cliente', async () => {
    updateAnalytics({ consent: true, analyticsId: ID });
    await client();
    await vi.waitFor(() => {
      expect(analyticsState()).toBe('sending');
    });
    updateAnalytics({ consent: false });
    expect(analyticsState()).toBe('off');
    expect(analyticsConsent()).toBe(false);
  });

  it('un cambio mientras el cliente se baja no rompe nada', () => {
    updateAnalytics({ consent: true });
    party();
    expect(analyticsState()).toBe('loading');
    expect(() => {
      updateAnalytics({ database: 'real' });
    }).not.toThrow();
  });
});

describe('trackSignupCompleted', () => {
  const props = { method: 'email', target_specialty_set: true } as const;

  it('sin la casilla del registro no hace nada y no junta nada', () => {
    trackSignupCompleted(false, props);
    expect(analyticsState()).toBe('off');
    expect(analyticsConsent()).toBeNull();
  });

  it('con la casilla marcada pasa a juntar y el evento sale cuando llega el identificador', async () => {
    trackSignupCompleted(true, props);
    expect(analyticsConsent()).toBe(true);
    const analytics = await client();
    await vi.waitFor(() => {
      expect(analytics.queued()).toBe(1);
    });
    updateAnalytics({ analyticsId: ID });
    analytics.flush();
    await vi.waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    expect(calls[0]?.events[0]).toMatchObject({ event: 'signup_completed', distinct_id: ID });
    // Sin cómo nos conociste ni código de influencer (D-132)
    expect(JSON.stringify(calls)).not.toMatch(/heard_from|has_code|influencer/);
  });

  it('con la bandera apagada tampoco, aunque la casilla esté marcada', () => {
    writeStoredFlags({ productAnalytics: false });
    resetAnalyticsControl();
    trackSignupCompleted(true, props);
    expect(analyticsState()).toBe('off');
  });
});
