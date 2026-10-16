import { describe, expect, it } from 'vitest';
import type { ComparisonSnapshot, PopulationBaselines } from '@/data/model/contracts';
import { readStoredSnapshot } from './modelSnapshots';
import { ComparisonSnapshotSchema, PopulationBaselinesSchema } from './modelSchemas';

const cuts = Array.from({ length: 19 }, (_, index) => 0.3 + index * 0.03);
const snapshot: ComparisonSnapshot = {
  available: true,
  runAt: '2026-10-15T10:23:00.000Z',
  studyDay: '2026-10-14',
  windowDays: 30,
  minGroupSize: 30,
  specialty: 'general_surgery',
  cells: [
    { cohort: 'all', metric: 'sim_accuracy', branch: '*', students: 120, state: 'ready', cuts },
    {
      cohort: 'specialty',
      metric: 'consistency',
      branch: '*',
      students: 18,
      state: 'calibrating',
      cuts: null,
    },
  ],
};
const population: PopulationBaselines = {
  available: true,
  runAt: '2026-10-15T10:23:00.000Z',
  bias: { anchoring: { students: 80, rate: 0.21 } },
  motives: { pediatrics: { knowledge: 0.5 } },
  topics: { 'pediatrics/neonatology': { students: 60, accuracy: 0.55, difficulty: null } },
  indicators: {},
  fatigue: { state: 'calibrating', students: 12, longSessions: 40 },
};

const repos = (row: unknown) =>
  ({ bankState: { get: () => Promise.resolve(row) } }) as unknown as Parameters<
    typeof readStoredSnapshot
  >[0];

describe('foto de la comparación guardada en el navegador', () => {
  it('la lee de la fila bajo snapshot, value o data, o en la propia fila', async () => {
    for (const row of [
      { key: 'comparison', snapshot, at: '2026-10-15T10:30:00.000Z' },
      { key: 'comparison', value: snapshot },
      { key: 'comparison', data: snapshot },
      { key: 'comparison', ...snapshot },
    ]) {
      expect(await readStoredSnapshot(repos(row), 'comparison', ComparisonSnapshotSchema)).toEqual(
        snapshot,
      );
    }
  });

  it('sin fila, con una fila de otra forma o con cortes que bajan, no hay foto', async () => {
    const broken = {
      ...snapshot,
      cells: [{ ...snapshot.cells[0], cuts: [...cuts].reverse() }],
    };
    for (const row of [
      undefined,
      null,
      'texto',
      { key: 'comparison' },
      { key: 'comparison', snapshot: { available: true } },
      { key: 'comparison', snapshot: broken },
      {
        key: 'comparison',
        snapshot: { ...snapshot, cells: [{ ...snapshot.cells[0], cuts: cuts.slice(1) }] },
      },
    ]) {
      expect(
        await readStoredSnapshot(repos(row), 'comparison', ComparisonSnapshotSchema),
      ).toBeNull();
    }
  });

  it('una celda lista o calibrando con las formas del contrato pasa tal cual', () => {
    const parsed = ComparisonSnapshotSchema.parse(snapshot);
    expect(parsed.cells.map((cell) => cell.state)).toEqual(['ready', 'calibrating']);
    expect(parsed.cells[1]?.cuts).toBeNull();
  });
});

describe('línea base de la población guardada en el navegador', () => {
  it('la lee bajo baselines, population, value o data, o en la propia fila', async () => {
    for (const row of [
      { key: 'population', baselines: population },
      { key: 'population', population },
      { key: 'population', value: population },
      { key: 'population', data: population },
      { key: 'population', ...population },
    ]) {
      expect(await readStoredSnapshot(repos(row), 'population', PopulationBaselinesSchema)).toEqual(
        population,
      );
    }
  });

  it('un estado de fatiga que no existe descarta toda la fila', async () => {
    const row = { key: 'population', baselines: { ...population, fatigue: { state: 'raro' } } };
    expect(
      await readStoredSnapshot(repos(row), 'population', PopulationBaselinesSchema),
    ).toBeNull();
  });
});
