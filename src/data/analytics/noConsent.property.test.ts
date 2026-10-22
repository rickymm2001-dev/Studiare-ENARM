// @vitest-environment jsdom
// Sin permiso no sale ningún evento (B15, 6.1). Lo más importante del bloque. Secuencias al azar de eventos
// medidos, cambios del permiso (sin saber, no y sí), de la bandera, de la llave, de la base, del entorno,
// de la nube y del identificador, con el reloj y un fetch falso que a veces falla. Un modelo aparte, simple
// y escrito sin mirar el cliente, dice qué eventos tienen derecho a salir. Ninguna petición puede llevar un
// evento que se midió sin el permiso prendido en ese momento, ni salir cuando algo de la tabla falta, y
// retirar el permiso tira lo que esperaba. Nada se escribe en cookies ni en el almacenamiento del navegador.
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeStoredFlags } from '@/config/featureFlags';
import { resetAnalytics, track } from './catalog';
import { createAnalyticsClient, type AnalyticsEnvironment, type ClientInputs } from './client';
import { resetAnalyticsControl, updateAnalytics } from './control';
import type { GateInput } from './gate';

const ID_A = '2f5b0c38-6a52-4a1f-9d57-3c7a9d1f0b11';
const ID_B = '9a1c7e52-0b3d-4c6e-8f21-5d4e3a2b1c00';
const CONFIG = {
  key: 'phc_SimuladaPruebasStudiare00000000000000000000',
  host: 'https://us.i.posthog.com',
};

type Op =
  | { kind: 'track'; which: number }
  | { kind: 'consent'; value: boolean | null }
  | { kind: 'flag'; value: boolean }
  | { kind: 'config'; value: boolean }
  | { kind: 'database'; value: 'real' | 'demo' }
  | { kind: 'env'; value: 'development' | 'demo' | 'production' }
  | { kind: 'cloud'; value: boolean }
  | { kind: 'identity'; value: string | null }
  | { kind: 'wait'; ms: number }
  | { kind: 'hide' }
  | { kind: 'fail'; value: boolean };

const op: fc.Arbitrary<Op> = fc.oneof(
  { weight: 6, arbitrary: fc.nat(2).map((which): Op => ({ kind: 'track', which })) },
  {
    weight: 3,
    arbitrary: fc
      .constantFrom<boolean | null>(true, false, null)
      .map((value): Op => ({ kind: 'consent', value })),
  },
  { weight: 1, arbitrary: fc.boolean().map((value): Op => ({ kind: 'flag', value })) },
  { weight: 1, arbitrary: fc.boolean().map((value): Op => ({ kind: 'config', value })) },
  {
    weight: 1,
    arbitrary: fc.constantFrom('real', 'demo').map((value): Op => ({ kind: 'database', value })),
  },
  {
    weight: 1,
    arbitrary: fc
      .constantFrom('development', 'demo', 'production')
      .map((value): Op => ({ kind: 'env', value })),
  },
  { weight: 1, arbitrary: fc.boolean().map((value): Op => ({ kind: 'cloud', value })) },
  {
    weight: 2,
    arbitrary: fc
      .constantFrom<string | null>(ID_A, ID_B, null)
      .map((value): Op => ({ kind: 'identity', value })),
  },
  {
    weight: 4,
    arbitrary: fc.integer({ min: 0, max: 15_000 }).map((ms): Op => ({ kind: 'wait', ms })),
  },
  { weight: 1, arbitrary: fc.constant<Op>({ kind: 'hide' }) },
  { weight: 1, arbitrary: fc.boolean().map((value): Op => ({ kind: 'fail', value })) },
);

const TRACKS = [
  () => {
    track('review_session_completed', { items: '10-49', minutes: '5-14' });
  },
  () => {
    track('paywall_viewed', { feature: 'outlines' });
  },
  () => {
    track('party_group_joined', {});
  },
];

/**
 * El modelo, escrito aparte de gate.ts a propósito. Si copiara la tabla del cliente, un error en ella
 * pasaría las dos veces. Aquí se dice con las palabras de la regla, todo a la vez
 */
const mayCollect = (m: GateInput): boolean =>
  m.flag &&
  m.config !== null &&
  m.appEnv !== 'development' &&
  m.database === 'real' &&
  m.cloud &&
  m.consent === true;
const maySend = (m: GateInput): boolean =>
  mayCollect(m) && (m.analyticsId === ID_A || m.analyticsId === ID_B);

/** Los mismos nombres que usa la tabla, en un objeto que el modelo lee y el cliente recibe */
const START: GateInput = {
  flag: true,
  config: CONFIG,
  consent: null,
  database: 'real',
  appEnv: 'production',
  cloud: true,
  analyticsId: null,
};

const storageSnapshot = () => ({
  cookie: document.cookie,
  local: JSON.stringify(Object.entries(localStorage)),
  session: JSON.stringify(Object.entries(sessionStorage)),
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T15:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
  resetAnalytics();
});

describe('sin permiso no sale nada', () => {
  it('ninguna secuencia manda un evento medido sin permiso, ni con algo de la tabla en contra', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(op, { minLength: 1, maxLength: 60 }), async (ops) => {
        resetAnalytics();
        const hide = { run: null as null | (() => void) };
        const environment: AnalyticsEnvironment = {
          width: () => 1280,
          installed: () => false,
          version: () => 'dev',
          onHide: (run) => {
            hide.run = run;
            return () => {
              hide.run = null;
            };
          },
        };
        let model: GateInput = START;
        /** Los instantes de los eventos que tienen derecho a salir, y los que ya salieron */
        const eligible = new Set<number>();
        const sent = new Set<number>();
        const failures = { on: false };
        const violations: string[] = [];
        const fetchFn = vi.fn((url: string, init: RequestInit) => {
          // Una petición solo puede salir si todo está en regla en este momento
          if (!maySend(model))
            violations.push(`salió con la tabla en contra: ${JSON.stringify(model)}`);
          const body = JSON.parse(init.body as string) as {
            api_key: string;
            batch: { timestamp: string; distinct_id: string }[];
          };
          if (url !== `${CONFIG.host}/batch/`) violations.push(`salió a ${url}`);
          if (body.api_key !== CONFIG.key) violations.push('salió con otra llave');
          for (const event of body.batch) {
            const at = Date.parse(event.timestamp);
            if (!eligible.has(at)) violations.push(`salió un evento sin permiso (${at})`);
            if (sent.has(at) && !failures.on) violations.push(`salió dos veces (${at})`);
            if (event.distinct_id !== model.analyticsId)
              violations.push('salió con otro identificador');
            sent.add(at);
          }
          return failures.on
            ? Promise.reject(new TypeError('Failed to fetch'))
            : Promise.resolve(new Response('{}', { status: 200 }));
        });
        const client = createAnalyticsClient({ fetch: fetchFn, environment });
        const before = storageSnapshot();

        const apply = (patch: Partial<ClientInputs>) => {
          model = { ...model, ...patch };
          client.update(patch);
          // Si ya no se puede juntar, nada de lo que esperaba tiene derecho a salir
          if (!mayCollect(model)) eligible.clear();
        };
        client.update(START);

        for (const step of ops) {
          // Un milisegundo por paso, así cada evento tiene un instante propio
          await vi.advanceTimersByTimeAsync(1);
          switch (step.kind) {
            case 'track': {
              const at = Date.now();
              if (mayCollect(model)) eligible.add(at);
              TRACKS[step.which]?.();
              break;
            }
            case 'consent':
              apply({ consent: step.value });
              break;
            case 'flag':
              apply({ flag: step.value });
              break;
            case 'config':
              apply({ config: step.value ? CONFIG : null });
              break;
            case 'database':
              apply({ database: step.value });
              break;
            case 'env':
              apply({ appEnv: step.value });
              break;
            case 'cloud':
              apply({ cloud: step.value });
              break;
            case 'identity':
              apply({ analyticsId: step.value });
              break;
            case 'wait':
              await vi.advanceTimersByTimeAsync(step.ms);
              break;
            case 'hide':
              hide.run?.();
              break;
            case 'fail':
              failures.on = step.value;
              break;
          }
          await vi.advanceTimersByTimeAsync(0);
        }
        // Un último descanso para que salga o expire lo que esperaba
        await vi.advanceTimersByTimeAsync(30_000);

        expect(violations).toEqual([]);
        // Nada se escribió en cookies ni en el almacenamiento del navegador
        expect(storageSnapshot()).toEqual(before);
        // Y si al final no se puede juntar, la cola quedó vacía
        if (!mayCollect(model)) expect(client.queued()).toBe(0);
      }),
      { numRuns: 150 },
    );
  });

  it('el modelo sí deja salir lo que debe: con todo en regla un evento llega', async () => {
    const calls: unknown[] = [];
    const client = createAnalyticsClient({
      fetch: (_url, init) => {
        calls.push(JSON.parse(init.body as string));
        return Promise.resolve(new Response('{}', { status: 200 }));
      },
      environment: {
        width: () => 1280,
        installed: () => false,
        version: () => 'dev',
        onHide: () => () => undefined,
      },
    });
    client.update({ ...START, consent: true, analyticsId: ID_A });
    track('party_group_joined', {});
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toHaveLength(1);
  });
});

// La misma regla por el camino de la app: control.ts, que baja el cliente aparte y guarda en una cola de
// emergencia lo que llega mientras tanto. Lo que no cambia con la sesión (bandera, llave, entorno y nube) se
// fija al abrir la pestaña, así que aquí se sortea una vez por secuencia
describe('sin permiso no sale nada, por el control de lo inicial', () => {
  const dynamicOp: fc.Arbitrary<Op> = fc.oneof(
    { weight: 6, arbitrary: fc.nat(2).map((which): Op => ({ kind: 'track', which })) },
    {
      weight: 3,
      arbitrary: fc
        .constantFrom<boolean | null>(true, false, null)
        .map((value): Op => ({ kind: 'consent', value })),
    },
    {
      weight: 1,
      arbitrary: fc.constantFrom('real', 'demo').map((value): Op => ({ kind: 'database', value })),
    },
    {
      weight: 2,
      arbitrary: fc
        .constantFrom<string | null>(ID_A, ID_B, null)
        .map((value): Op => ({ kind: 'identity', value })),
    },
    {
      weight: 4,
      arbitrary: fc.integer({ min: 0, max: 15_000 }).map((ms): Op => ({ kind: 'wait', ms })),
    },
    { weight: 1, arbitrary: fc.constant<Op>({ kind: 'hide' }) },
    { weight: 1, arbitrary: fc.boolean().map((value): Op => ({ kind: 'fail', value })) },
  );
  const statics = fc.record({
    flag: fc.boolean(),
    key: fc.boolean(),
    env: fc.constantFrom('development', 'demo', 'production'),
    cloud: fc.boolean(),
  });

  afterEach(() => {
    resetAnalyticsControl();
    writeStoredFlags(null);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('ninguna secuencia manda un evento medido sin permiso, ni con algo de la tabla en contra', async () => {
    await fc.assert(
      fc.asyncProperty(
        statics,
        fc.array(dynamicOp, { minLength: 1, maxLength: 50 }),
        async (fixed, ops) => {
          resetAnalyticsControl();
          resetAnalytics();
          vi.unstubAllEnvs();
          vi.stubEnv('VITE_APP_ENV', fixed.env);
          vi.stubEnv('VITE_POSTHOG_KEY', fixed.key ? CONFIG.key : '');
          vi.stubEnv('VITE_POSTHOG_HOST', CONFIG.host);
          vi.stubEnv('VITE_SUPABASE_URL', fixed.cloud ? 'https://abcd1234.supabase.co' : '');
          vi.stubEnv(
            'VITE_SUPABASE_ANON_KEY',
            'sb_publishable_' + 'simulada_para_pruebas_0123456789',
          );
          writeStoredFlags({ productAnalytics: fixed.flag });

          let model: GateInput = {
            flag: fixed.flag,
            config: fixed.key ? CONFIG : null,
            consent: null,
            database: 'real',
            appEnv: fixed.env,
            cloud: fixed.cloud,
            analyticsId: null,
          };
          const eligible = new Set<number>();
          const sent = new Set<number>();
          const failures = { on: false };
          const violations: string[] = [];
          vi.stubGlobal(
            'fetch',
            vi.fn((url: string, init: RequestInit) => {
              if (!maySend(model))
                violations.push(`salió con la tabla en contra: ${JSON.stringify(model)}`);
              const body = JSON.parse(init.body as string) as {
                batch: { timestamp: string; distinct_id: string }[];
              };
              if (url !== `${CONFIG.host}/batch/`) violations.push(`salió a ${url}`);
              for (const event of body.batch) {
                const at = Date.parse(event.timestamp);
                if (!eligible.has(at)) violations.push(`salió un evento sin permiso (${at})`);
                if (event.distinct_id !== model.analyticsId) violations.push('otro identificador');
                sent.add(at);
              }
              return failures.on
                ? Promise.reject(new TypeError('Failed to fetch'))
                : Promise.resolve(new Response('{}', { status: 200 }));
            }),
          );
          const before = storageSnapshot();
          const apply = (patch: Partial<ClientInputs>) => {
            model = { ...model, ...patch };
            updateAnalytics(patch);
            if (!mayCollect(model)) eligible.clear();
          };

          for (const step of ops) {
            await vi.advanceTimersByTimeAsync(1);
            switch (step.kind) {
              case 'track': {
                const at = Date.now();
                if (mayCollect(model)) eligible.add(at);
                TRACKS[step.which]?.();
                break;
              }
              case 'consent':
                apply({ consent: step.value });
                break;
              case 'database':
                apply({ database: step.value });
                break;
              case 'identity':
                apply({ analyticsId: step.value });
                break;
              case 'wait':
                await vi.advanceTimersByTimeAsync(step.ms);
                break;
              case 'hide':
                window.dispatchEvent(new Event('pagehide'));
                break;
              case 'fail':
                failures.on = step.value;
                break;
              default:
                break;
            }
            await vi.advanceTimersByTimeAsync(0);
          }
          await vi.advanceTimersByTimeAsync(30_000);

          expect(violations).toEqual([]);
          expect(storageSnapshot().cookie).toBe(before.cookie);
          expect(storageSnapshot().session).toBe(before.session);
        },
      ),
      { numRuns: 80 },
    );
  });
});
