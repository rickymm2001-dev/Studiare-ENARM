import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FakeDbError, fakeRpc } from '../testing/bankCloud';
import {
  MODEL_RPC,
  fetchComparisonSnapshot,
  fetchModelSettings,
  fetchPopulationBaselines,
  parseComparisonSnapshot,
  parsePopulationBaselines,
} from './model';

const CUTS = Array.from({ length: 19 }, (_, index) => 0.3 + index * 0.03);

/** Lo que devuelve comparison_snapshot con una publicación y una especialidad */
const snapshotJson = (overrides: Record<string, unknown> = {}) => ({
  available: true,
  runAt: '2026-10-15T10:31:02.456789+00:00',
  studyDay: '2026-10-15',
  windowDays: 30,
  minGroupSize: 30,
  specialty: 'general_surgery',
  cells: [
    {
      cohort: 'all',
      metric: 'sim_accuracy',
      branch: '*',
      students: 212,
      state: 'ready',
      cuts: CUTS,
    },
    {
      cohort: 'all',
      metric: 'sim_accuracy',
      branch: 'pediatrics',
      students: 150,
      state: 'ready',
      cuts: CUTS,
    },
    {
      cohort: 'specialty',
      metric: 'consistency',
      branch: '*',
      students: 18,
      state: 'calibrating',
      cuts: null,
    },
  ],
  ...overrides,
});

describe('las funciones existen en la migración', () => {
  it('los nombres que usa la app son los de 20261028000003_model_reads.sql', () => {
    const sql = readFileSync(
      join(import.meta.dirname, '../../../supabase/migrations/20261028000003_model_reads.sql'),
      'utf8',
    );
    for (const name of Object.values(MODEL_RPC)) {
      expect(sql).toContain(`create or replace function public.${name}()`);
    }
  });
});

describe('foto de comparación', () => {
  it('conserva las celdas listas con sus 19 cortes y las que calibran sin cortes', () => {
    const snapshot = parseComparisonSnapshot(snapshotJson());
    expect(snapshot).toMatchObject({
      available: true,
      runAt: '2026-10-15T10:31:02.456Z',
      studyDay: '2026-10-15',
      windowDays: 30,
      minGroupSize: 30,
      specialty: 'general_surgery',
    });
    expect(snapshot?.cells).toHaveLength(3);
    expect(snapshot?.cells[0]).toMatchObject({ state: 'ready', students: 212 });
    expect(snapshot?.cells[0]?.cuts).toHaveLength(19);
    expect(snapshot?.cells[2]).toMatchObject({ state: 'calibrating', cuts: null, students: 18 });
  });

  it('sin publicación dice que no está disponible y no deja celdas', () => {
    const snapshot = parseComparisonSnapshot(
      snapshotJson({ available: false, runAt: null, studyDay: null, specialty: null }),
    );
    expect(snapshot).toMatchObject({
      available: false,
      runAt: null,
      studyDay: null,
      specialty: null,
    });
    expect(snapshot?.cells).toEqual([]);
  });

  it('una celda que esta versión no entiende se descarta sin tirar la foto', () => {
    const snapshot = parseComparisonSnapshot(
      snapshotJson({
        cells: [
          ...snapshotJson().cells,
          {
            cohort: 'all',
            metric: 'metrica_nueva',
            branch: '*',
            students: 99,
            state: 'ready',
            cuts: CUTS,
          },
          {
            cohort: 'universidad',
            metric: 'reviews',
            branch: '*',
            students: 99,
            state: 'ready',
            cuts: CUTS,
          },
          {
            cohort: 'all',
            metric: 'reviews',
            branch: 'Rama Rara',
            students: 99,
            state: 'ready',
            cuts: CUTS,
          },
          'basura',
        ],
      }),
    );
    expect(snapshot?.cells).toHaveLength(3);
  });

  it('una celda lista con cortes rotos pasa a calibrando, porque con ellos un percentil sería inventado', () => {
    const broken = [CUTS.slice(0, 18), [...CUTS, 0.99], [...CUTS].reverse(), null];
    for (const cuts of broken) {
      const snapshot = parseComparisonSnapshot(
        snapshotJson({
          cells: [
            { cohort: 'all', metric: 'reviews', branch: '*', students: 90, state: 'ready', cuts },
          ],
        }),
      );
      expect(snapshot?.cells[0]).toMatchObject({ state: 'calibrating', cuts: null });
    }
    // Y unos cortes que ni siquiera son números dejan fuera la celda
    const notNumbers = parseComparisonSnapshot(
      snapshotJson({
        cells: [
          {
            cohort: 'all',
            metric: 'reviews',
            branch: '*',
            students: 90,
            state: 'ready',
            cuts: [...CUTS.slice(0, 18), 'x'],
          },
        ],
      }),
    );
    expect(notNumbers?.cells).toEqual([]);
  });

  it('una respuesta con otra forma no es una foto', () => {
    expect(parseComparisonSnapshot(null)).toBeNull();
    expect(parseComparisonSnapshot('x')).toBeNull();
    expect(parseComparisonSnapshot(snapshotJson({ windowDays: 'treinta' }))).toBeNull();
    expect(parseComparisonSnapshot(snapshotJson({ specialty: 'Cirugía General' }))).toBeNull();
    expect(parseComparisonSnapshot(snapshotJson({ studyDay: 'ayer' }))).toBeNull();
  });
});

describe('línea base de la población', () => {
  const baselines = {
    available: true,
    runAt: '2026-10-15T10:31:02+00:00',
    bias: { anchoring: { students: 140, rate: 0.183 } },
    motives: { pediatrics: { reports: 830, knowledge: 0.41, time: 0.08, fatigue: 0.06 } },
    topics: { 'pediatrics/neonatology': { students: 96, accuracy: 0.58, difficulty: 0.31 } },
    indicators: { rapid_guess: { students: 140, rate: 0.06 } },
    fatigue: { state: 'validated', students: 61, longSessions: 420 },
  };

  it('devuelve los números con las llaves de la taxonomía', () => {
    expect(parsePopulationBaselines(baselines)).toEqual({
      ...baselines,
      runAt: '2026-10-15T10:31:02.000Z',
    });
  });

  it('sin publicación llega vacía y con la fatiga calibrando', () => {
    const empty = parsePopulationBaselines({
      available: false,
      runAt: null,
      bias: {},
      motives: {},
      topics: {},
      indicators: {},
      fatigue: { state: 'calibrating', students: 0, longSessions: 0 },
    });
    expect(empty).toMatchObject({
      available: false,
      runAt: null,
      bias: {},
      fatigue: { state: 'calibrating' },
    });
  });

  it('un tema sin dificultad publicada queda en null y lo que falta se rellena vacío', () => {
    const parsed = parsePopulationBaselines({
      available: true,
      topics: { 'surgery/hernias': { students: 40, accuracy: 0.6 } },
    });
    expect(parsed?.topics['surgery/hernias']).toEqual({
      students: 40,
      accuracy: 0.6,
      difficulty: null,
    });
    expect(parsed?.bias).toEqual({});
    expect(parsed?.fatigue).toEqual({ state: 'calibrating', students: 0, longSessions: 0 });
  });

  it('un estado de fatiga que no existe o una forma rota no es una línea base', () => {
    expect(
      parsePopulationBaselines({
        ...baselines,
        fatigue: { state: 'raro', students: 1, longSessions: 1 },
      }),
    ).toBeNull();
    expect(
      parsePopulationBaselines({ ...baselines, bias: { x: { students: -1, rate: 0.1 } } }),
    ).toBeNull();
    expect(parsePopulationBaselines(null)).toBeNull();
  });
});

describe('llamadas a la base', () => {
  it('piden cada función por su nombre y devuelven la foto validada', async () => {
    const cloud = fakeRpc({
      [MODEL_RPC.comparison]: () => snapshotJson(),
      [MODEL_RPC.population]: () => ({ available: false }),
    });
    const comparison = await fetchComparisonSnapshot(cloud);
    expect(comparison.ok && comparison.value.cells).toHaveLength(3);
    const population = await fetchPopulationBaselines(cloud);
    expect(population).toMatchObject({ ok: true, value: { available: false } });
    expect(cloud.calls.map((call) => call.name)).toEqual([
      'comparison_snapshot',
      'population_baselines',
    ]);
    // Al servidor no viaja ningún argumento
    expect(cloud.calls.every((call) => call.args === undefined)).toBe(true);
  });

  it('traduce el error de la base a una causa', async () => {
    const reasons = async (code: string) =>
      fetchComparisonSnapshot(fakeRpc({ [MODEL_RPC.comparison]: () => new FakeDbError(code) }));
    expect(await reasons('28000')).toEqual({ ok: false, reason: 'no_session' });
    expect(await reasons('42501')).toEqual({ ok: false, reason: 'other_device' });
    expect(await reasons('PGRST202')).toEqual({ ok: false, reason: 'unavailable' });
    expect(await reasons('XX000')).toEqual({ ok: false, reason: 'unknown' });
  });

  it('una falla de red y una respuesta con otra forma no tiran nada', async () => {
    const down = fakeRpc({
      [MODEL_RPC.population]: () => {
        throw new Error('sin red');
      },
    });
    expect(await fetchPopulationBaselines(down)).toEqual({ ok: false, reason: 'network' });
    const odd = fakeRpc({ [MODEL_RPC.comparison]: () => ({ cualquier: 'cosa' }) });
    expect(await fetchComparisonSnapshot(odd)).toEqual({ ok: false, reason: 'unknown' });
  });
});

describe('ajustes del modelo', () => {
  /** Un cliente que contesta lo que se le diga a platform_settings */
  const settingsCloud = (reply: { data: unknown; error: { code?: string } | null } | 'throws') => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () =>
        reply === 'throws' ? Promise.reject(new Error('red')) : Promise.resolve(reply),
    };
    return { from: () => chain } as never;
  };

  it('lee la clave model_settings y deja de fábrica lo que no se entiende', async () => {
    const reply = await fetchModelSettings(
      settingsCloud({
        data: {
          value: {
            features: { adaptive: false },
            thresholds: { adaptiveMinItems: 80, minGroupSize: 5, adaptiveExploreShare: 'mucho' },
          },
        },
        error: null,
      }),
    );
    expect(reply.ok && reply.value.features.adaptive).toBe(false);
    expect(reply.ok && reply.value.thresholds.adaptiveMinItems).toBe(80);
    // Nunca por debajo de 30 ni con un valor que no es número
    expect(reply.ok && reply.value.thresholds.minGroupSize).toBe(30);
    expect(reply.ok && reply.value.thresholds.adaptiveExploreShare).toBe(0.2);
  });

  it('sin la clave, de fábrica', async () => {
    const reply = await fetchModelSettings(settingsCloud({ data: null, error: null }));
    expect(reply.ok && reply.value.features).toEqual({ comparison: true, adaptive: true });
    expect(reply.ok && reply.value.calibration.enabled).toBe(false);
  });

  it('un error de la base o de red no inventa ajustes', async () => {
    expect(
      await fetchModelSettings(settingsCloud({ data: null, error: { code: '42501' } })),
    ).toEqual({
      ok: false,
      reason: 'other_device',
    });
    expect(await fetchModelSettings(settingsCloud('throws'))).toEqual({
      ok: false,
      reason: 'network',
    });
  });
});
