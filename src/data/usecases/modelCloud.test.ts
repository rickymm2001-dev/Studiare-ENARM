import 'fake-indexeddb/auto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';
import { FACTORY_MODEL_SETTINGS } from '@/config/modelSettings';
import { MODEL_RPC } from '../cloud/model';
import type { EnarmDb } from '../db/database';
import { createDexieRepositories } from '../repos/dexie/createRepositories';
import { FakeDbError, fakeRpc } from '../testing/bankCloud';
import { freshDb } from '../testing/fixtures';
import { ensureModelSnapshots, readStoredModel } from './modelCloud';

const dbs: EnarmDb[] = [];
afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()));
});

const CUTS = Array.from({ length: 19 }, (_, index) => 0.3 + index * 0.03);
const snapshot = (specialty: string | null = 'general_surgery') => ({
  available: true,
  runAt: '2026-10-15T10:31:02.000Z',
  studyDay: '2026-10-15',
  windowDays: 30,
  minGroupSize: 30,
  specialty,
  cells: [
    { cohort: 'all', metric: 'reviews', branch: '*', students: 100, state: 'ready', cuts: CUTS },
  ],
});
const population = {
  available: true,
  runAt: '2026-10-15T10:31:02.000Z',
  bias: { anchoring: { students: 80, rate: 0.2 } },
  motives: {},
  topics: {},
  indicators: {},
  fatigue: { state: 'calibrating', students: 10, longSessions: 5 },
};

function setup() {
  const db = freshDb('real');
  dbs.push(db);
  const repos = createDexieRepositories(db);
  const server = {
    comparison: (): unknown => snapshot(),
    population: (): unknown => population,
    settings: (): { data: unknown; error: { code?: string } | null } => ({
      data: { value: { thresholds: { adaptiveMinItems: 60 } } },
      error: null,
    }),
  };
  const rpc = fakeRpc({
    [MODEL_RPC.comparison]: () => server.comparison(),
    [MODEL_RPC.population]: () => server.population(),
  });
  let settingsCalls = 0;
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => {
      settingsCalls += 1;
      return Promise.resolve(server.settings());
    },
  };
  const cloud = { rpc: rpc.rpc, from: () => chain } as unknown as Pick<
    SupabaseClient,
    'rpc' | 'from'
  >;
  return {
    api: { repos },
    cloud,
    server,
    calls: () => rpc.calls.length + settingsCalls,
  };
}

// 12:00 en Mérida del 15 de octubre es 18:00 UTC. El día de estudio cambia a las 4 a. m. de Mérida
const NOON = new Date('2026-10-15T18:00:00.000Z');
const LATER_SAME_DAY = new Date('2026-10-16T09:30:00.000Z'); // 3:30 a. m. del 16, todavía día 15
const NEXT_DAY = new Date('2026-10-16T10:30:00.000Z'); // 4:30 a. m. del 16

describe('baja lo que publica la noche una vez por día de estudio', () => {
  it('la primera vez baja las tres cosas y las guarda', async () => {
    const { api, cloud, calls } = setup();
    expect(await readStoredModel(api)).toEqual({
      comparison: null,
      population: null,
      settings: FACTORY_MODEL_SETTINGS,
    });
    expect(await ensureModelSnapshots(api, cloud, { now: NOON })).toEqual({
      status: 'updated',
      failed: [],
    });
    expect(calls()).toBe(3);
    const stored = await readStoredModel(api);
    expect(stored.comparison?.cells).toHaveLength(1);
    expect(stored.comparison?.specialty).toBe('general_surgery');
    expect(stored.population?.bias.anchoring).toEqual({ students: 80, rate: 0.2 });
    expect(stored.settings.thresholds.adaptiveMinItems).toBe(60);
  });

  it('el mismo día de estudio no vuelve a pedir nada, aunque pase la medianoche', async () => {
    const { api, cloud, calls } = setup();
    await ensureModelSnapshots(api, cloud, { now: NOON });
    expect(await ensureModelSnapshots(api, cloud, { now: NOON })).toEqual({ status: 'fresh' });
    expect(await ensureModelSnapshots(api, cloud, { now: LATER_SAME_DAY })).toEqual({
      status: 'fresh',
    });
    expect(calls()).toBe(3);
  });

  it('al empezar otro día de estudio pide otra vez y guarda lo nuevo', async () => {
    const { api, cloud, server, calls } = setup();
    await ensureModelSnapshots(api, cloud, { now: NOON });
    server.comparison = () => snapshot('pediatrics');
    expect((await ensureModelSnapshots(api, cloud, { now: NEXT_DAY })).status).toBe('updated');
    expect(calls()).toBe(6);
    expect((await readStoredModel(api)).comparison?.specialty).toBe('pediatrics');
  });

  it('force pide aunque ya se haya bajado hoy', async () => {
    const { api, cloud, calls } = setup();
    await ensureModelSnapshots(api, cloud, { now: NOON });
    await ensureModelSnapshots(api, cloud, { now: NOON, force: true });
    expect(calls()).toBe(6);
  });

  it('sin conexión se queda con lo último y lo vuelve a intentar', async () => {
    const { api, cloud, server } = setup();
    await ensureModelSnapshots(api, cloud, { now: NOON });
    const failing = () => {
      throw new Error('sin red');
    };
    server.comparison = failing;
    server.population = failing;
    server.settings = failing;
    expect(await ensureModelSnapshots(api, cloud, { now: NEXT_DAY })).toEqual({
      status: 'failed',
      failure: 'network',
    });
    // Lo de ayer sigue ahí
    expect((await readStoredModel(api)).comparison?.cells).toHaveLength(1);
    server.comparison = () => snapshot();
    server.population = () => population;
    server.settings = () => ({ data: null, error: null });
    expect((await ensureModelSnapshots(api, cloud, { now: NEXT_DAY })).status).toBe('updated');
  });

  it('si una de las tres falla, las otras quedan guardadas y solo esa se vuelve a pedir', async () => {
    const { api, cloud, server, calls } = setup();
    server.population = () => new FakeDbError('42501');
    expect(await ensureModelSnapshots(api, cloud, { now: NOON })).toEqual({
      status: 'updated',
      failed: ['other_device'],
    });
    expect(calls()).toBe(3);
    const stored = await readStoredModel(api);
    expect(stored.comparison).not.toBeNull();
    expect(stored.population).toBeNull();
    server.population = () => population;
    expect((await ensureModelSnapshots(api, cloud, { now: NOON })).status).toBe('updated');
    // Solo se pidió la que faltaba
    expect(calls()).toBe(4);
    expect((await readStoredModel(api)).population?.available).toBe(true);
  });

  it('guarda también que todavía no hay publicación, para no preguntar de más', async () => {
    const { api, cloud, server, calls } = setup();
    server.comparison = () => ({
      ...snapshot(null),
      available: false,
      runAt: null,
      studyDay: null,
      cells: [],
    });
    await ensureModelSnapshots(api, cloud, { now: NOON });
    expect((await readStoredModel(api)).comparison).toMatchObject({ available: false, cells: [] });
    await ensureModelSnapshots(api, cloud, { now: NOON });
    expect(calls()).toBe(3);
  });
});

describe('una foto que la noche todavía no publica no se da por buena todo el día (revisión de B14, hallazgo 12)', () => {
  // La corrida programada empieza a las 4:23 de Mérida del 16, que son las 10:23 UTC, y puede atrasarse horas
  const BEFORE_RUN = new Date('2026-10-16T10:05:00.000Z'); // 4:05 a. m. del 16, ya día de estudio 16
  const SOON_AFTER = new Date('2026-10-16T10:40:00.000Z'); // 4:40, menos de 3 horas después
  const LATER = new Date('2026-10-16T13:30:00.000Z'); // 7:30 a. m., más de 3 horas después
  const NOON_16 = new Date('2026-10-16T18:00:00.000Z');
  const unavailable = {
    ...snapshot(null),
    available: false,
    runAt: null,
    studyDay: null,
    cells: [],
  };
  const publishedOn16 = {
    ...snapshot(null),
    runAt: '2026-10-16T10:31:02.000Z',
    studyDay: '2026-10-16',
  };
  const populationOn16 = { ...population, runAt: '2026-10-16T10:31:02.000Z' };

  it('si abrió antes de que la noche publique, vuelve a pedir pasadas unas horas y no hasta mañana', async () => {
    const { api, cloud, server, calls } = setup();
    server.comparison = () => unavailable;
    server.population = () => ({ ...population, available: false, runAt: null });
    await ensureModelSnapshots(api, cloud, { now: BEFORE_RUN });
    expect(calls()).toBe(3);
    // Un rato después no vuelve a preguntar en cada conexión
    expect(await ensureModelSnapshots(api, cloud, { now: SOON_AFTER })).toEqual({
      status: 'fresh',
    });
    expect(calls()).toBe(3);
    // La noche publicó mientras tanto. Pasadas unas horas lo recoge el mismo día
    server.comparison = () => publishedOn16;
    server.population = () => populationOn16;
    expect((await ensureModelSnapshots(api, cloud, { now: LATER })).status).toBe('updated');
    expect(calls()).toBe(5);
    const stored = await readStoredModel(api);
    expect(stored.comparison).toMatchObject({ available: true, studyDay: '2026-10-16' });
    expect(stored.population?.available).toBe(true);
    // Ya con la foto de hoy no vuelve a pedir en todo el día
    expect(await ensureModelSnapshots(api, cloud, { now: NOON_16 })).toEqual({ status: 'fresh' });
    expect(calls()).toBe(5);
  });

  it('la foto de ayer guardada con la fecha de hoy tampoco se queda todo el día', async () => {
    const { api, cloud, server, calls } = setup();
    // A las 4:05 del 16 el servidor todavía publica la foto del 15
    await ensureModelSnapshots(api, cloud, { now: BEFORE_RUN });
    expect(calls()).toBe(3);
    expect(await ensureModelSnapshots(api, cloud, { now: SOON_AFTER })).toEqual({
      status: 'fresh',
    });
    server.comparison = () => publishedOn16;
    server.population = () => populationOn16;
    expect((await ensureModelSnapshots(api, cloud, { now: LATER })).status).toBe('updated');
    expect((await readStoredModel(api)).comparison?.studyDay).toBe('2026-10-16');
    // Los ajustes del modelo no dependen de la noche y no se piden de más
    expect(calls()).toBe(5);
  });
});
