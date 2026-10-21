// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_SNAPSHOT_STUDENTS } from '@/demo/constants';
import type { DemoSnapshotData, DemoSnapshotRequest } from '@/demo/generator/snapshots';
import { loadDemoSnapshotData, readDemoRequest, snapshotsFrom } from './demoSnapshots';
import { ComparisonSnapshotSchema, PopulationBaselinesSchema } from './modelSchemas';

type SimTruthRepo = Parameters<typeof readDemoRequest>[0];

const reposWith = (params: readonly Record<string, unknown>[] | null): SimTruthRepo =>
  ({
    simTruth:
      params === null
        ? null
        : {
            list: () =>
              Promise.resolve(
                params.map((one, index) => ({
                  userId: `u${index}`,
                  seed: 'semilla',
                  generatorVersion: '1',
                  params: one,
                })),
              ),
          },
  }) as unknown as SimTruthRepo;

const seedOptions = { seed: 'demo', endDay: '2026-10-15', cohortSize: 100, cohortDays: 90 };

const cuts = Array.from({ length: 19 }, (_, index) => 0.3 + index * 0.02);
const data: DemoSnapshotData = {
  asOfDay: '2026-10-16',
  students: 60,
  population: {
    bias: { anchoring: { students: 45, rate: 0.22 } },
    motives: { pediatrics: { knowledge: 0.6, fatigue: 0.1 } },
    topics: { 'pediatrics/neonatology': { students: 40, accuracy: 0.55, difficulty: 0.2 } },
    indicators: {},
    fatigue: { state: 'calibrating', students: 8, longSessions: 21 },
    items: { uncalibrated: 100, provisional: 10, calibrated: 4 },
  },
  comparison: [
    { cohort: 'all', key: 'all', metric: 'sim_accuracy', branch: '*', students: 60, cuts },
    { cohort: 'all', key: 'all', metric: 'sim_accuracy', branch: 'pediatrics', students: 25, cuts },
    { cohort: 'all', key: 'all', metric: 'reviews', branch: '*', students: 60, cuts: null },
    {
      cohort: 'specialty',
      key: 'general_surgery',
      metric: 'consistency',
      branch: '*',
      students: 36,
      cuts,
    },
    {
      cohort: 'specialty',
      key: 'pediatrics',
      metric: 'consistency',
      branch: '*',
      students: 12,
      cuts: null,
    },
  ],
} as unknown as DemoSnapshotData;

beforeEach(() => {
  localStorage.clear();
});

describe('qué pidió la demostración', () => {
  it('lee la semilla y los días de la verdad del alumno que la sembró', async () => {
    const request = await readDemoRequest(reposWith([{}, { seedOptions }]));
    expect(request).toEqual({
      seed: 'demo',
      size: DEMO_SNAPSHOT_STUDENTS,
      days: 31,
      endDay: '2026-10-15',
    });
  });

  it('con una cohorte más chica pide solo esa cohorte', async () => {
    const request = await readDemoRequest(
      reposWith([{ seedOptions: { ...seedOptions, cohortSize: 12, cohortDays: 20 } }]),
    );
    expect(request).toMatchObject({ size: 12, days: 20 });
  });

  it('sin siembra, sin repositorio o con opciones rotas no hay petición', async () => {
    expect(await readDemoRequest(reposWith([]))).toBeNull();
    expect(await readDemoRequest(reposWith(null))).toBeNull();
    expect(await readDemoRequest(reposWith([{ seedOptions: { seed: 'x' } }]))).toBeNull();
    expect(
      await readDemoRequest(reposWith([{ seedOptions: { ...seedOptions, endDay: 'ayer' } }])),
    ).toBeNull();
  });
});

describe('de las celdas de la cohorte a las fotos que publicaría la noche', () => {
  it('cumple los esquemas de la foto y de la población', () => {
    const { comparison, population } = snapshotsFrom(data, 'general_surgery');
    expect(ComparisonSnapshotSchema.safeParse(comparison).success).toBe(true);
    expect(PopulationBaselinesSchema.safeParse(population).success).toBe(true);
  });

  it('trae las celdas de Todos y solo las de la especialidad de quien pregunta', () => {
    const { comparison } = snapshotsFrom(data, 'general_surgery');
    expect(comparison.specialty).toBe('general_surgery');
    expect(comparison.studyDay).toBe('2026-10-16');
    expect(comparison.cells.map((cell) => `${cell.cohort}|${cell.metric}|${cell.branch}`)).toEqual([
      'all|sim_accuracy|*',
      'all|sim_accuracy|pediatrics',
      'all|reviews|*',
      'specialty|consistency|*',
    ]);
  });

  it('sin especialidad elegida solo trae Todos', () => {
    const { comparison } = snapshotsFrom(data, null);
    expect(comparison.specialty).toBeNull();
    expect(new Set(comparison.cells.map((cell) => cell.cohort))).toEqual(new Set(['all']));
  });

  it('un grupo de menos de 30 alumnos o sin cortes queda calibrando y sin cortes', () => {
    const { comparison } = snapshotsFrom(data, 'pediatrics');
    const byKey = (cohort: string, metric: string, branch: string) =>
      comparison.cells.find(
        (cell) => cell.cohort === cohort && cell.metric === metric && cell.branch === branch,
      );
    // 25 alumnos, aunque traiga cortes: no llega al piso de 30
    expect(byKey('all', 'sim_accuracy', 'pediatrics')).toMatchObject({
      state: 'calibrating',
      cuts: null,
    });
    // 60 alumnos pero sin cortes
    expect(byKey('all', 'reviews', '*')).toMatchObject({ state: 'calibrating', cuts: null });
    expect(byKey('all', 'sim_accuracy', '*')).toMatchObject({ state: 'ready' });
    expect(byKey('specialty', 'consistency', '*')).toMatchObject({
      state: 'calibrating',
      students: 12,
    });
  });

  it('la población se publica con la hora de la noche y los números de la cohorte', () => {
    const { population, comparison } = snapshotsFrom(data, null);
    expect(population.runAt).toBe(comparison.runAt);
    expect(population.runAt).toBe('2026-10-16T10:23:00.000Z');
    expect(population.bias.anchoring).toEqual({ students: 45, rate: 0.22 });
    expect(population.fatigue.state).toBe('calibrating');
  });
});

describe('cálculo y caché de la demostración', () => {
  const repos = reposWith([{ seedOptions }]);

  it('calcula una vez, lo guarda en el navegador y la próxima vez no vuelve a calcular', async () => {
    const run = vi.fn((_request: DemoSnapshotRequest) => Promise.resolve(data));
    const first = await loadDemoSnapshotData(repos, run);
    expect(first?.asOfDay).toBe('2026-10-16');
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toMatchObject({ seed: 'demo', endDay: '2026-10-15' });

    const second = await loadDemoSnapshotData(repos, run);
    expect(second).toEqual(first);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('dos partes de la pantalla que piden a la vez comparten una sola corrida', async () => {
    let finish: (value: DemoSnapshotData) => void = () => undefined;
    const run = vi.fn(
      (_request: DemoSnapshotRequest) =>
        new Promise<DemoSnapshotData>((resolve) => {
          finish = resolve;
        }),
    );
    const a = loadDemoSnapshotData(repos, run);
    const b = loadDemoSnapshotData(repos, run);
    await vi.waitFor(() => {
      expect(run).toHaveBeenCalledTimes(1);
    });
    finish(data);
    expect(await a).toEqual(await b);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('otra semilla vuelve a calcular y reemplaza lo guardado', async () => {
    const run = vi.fn((_request: DemoSnapshotRequest) => Promise.resolve(data));
    await loadDemoSnapshotData(repos, run);
    await loadDemoSnapshotData(reposWith([{ seedOptions: { ...seedOptions, seed: 'otra' } }]), run);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('si el cálculo falla no hay datos y no se guarda nada, así la próxima vez se reintenta', async () => {
    const failing = vi.fn((_request: DemoSnapshotRequest) => Promise.reject(new Error('worker')));
    expect(await loadDemoSnapshotData(repos, failing)).toBeNull();
    expect(localStorage.length).toBe(0);
    const working = vi.fn((_request: DemoSnapshotRequest) => Promise.resolve(data));
    expect((await loadDemoSnapshotData(repos, working))?.students).toBe(60);
    expect(working).toHaveBeenCalledTimes(1);
  });

  it('un caché dañado se ignora y se vuelve a calcular', async () => {
    localStorage.setItem('studiare.demoSnapshots.v1', '{no es json');
    const run = vi.fn((_request: DemoSnapshotRequest) => Promise.resolve(data));
    expect((await loadDemoSnapshotData(repos, run))?.students).toBe(60);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('sin siembra no calcula nada', async () => {
    const run = vi.fn((_request: DemoSnapshotRequest) => Promise.resolve(data));
    expect(await loadDemoSnapshotData(reposWith([]), run)).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});
