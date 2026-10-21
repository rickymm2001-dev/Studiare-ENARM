// La app del alumno contra el modelo simulado de Playwright (B14, paquete B). Comprueba sin navegador que
// lo que lee la app del modelo, la foto de comparación, la línea base de la población, la calibración dentro
// de catalog_changes y model_settings, lo entiende con los validadores de verdad, y que el doble cumple las
// reglas de 20261028000003 que protegen la privacidad. Así las e2e de la nube fallan por la app y no por
// el doble. Todo es simulado.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MIN_PRIVACY_GROUP, readModelSettings } from '@/config/modelSettings';
import { effectiveDifficulty } from '@/data/bank/calibration';
import { catalogEntryOf } from '@/data/bank/catalogMerge';
import { fetchComparisonSnapshot, fetchPopulationBaselines } from '@/data/cloud/model';
import { fakeBankRpc, seedBank } from '../e2e/support/fakeBank';
import { createFakeBankStore, type FakeBankCaller } from '../e2e/support/fakeBankStore';
import {
  comparisonSnapshotFor,
  modelSettingsValue,
  populationBaselinesFor,
  specialtyOfCaller,
  withCatalogCalibration,
} from '../e2e/support/fakeModel';
import {
  createFakeModelStore,
  emptyPopulation,
  seedCalibration,
  seedComparison,
} from '../e2e/support/fakeModelStore';

/** Un cliente de Supabase que contesta lo que le den, como lo hace fakeSupabase.ts con las rpc del modelo */
const clientOf = (data: unknown) =>
  ({
    rpc: () => Promise.resolve({ data, error: null }),
  }) as unknown as Pick<SupabaseClient, 'rpc'>;

const student: FakeBankCaller = {
  userId: 'alumno',
  role: 'student',
  alias: 'Ana',
  activeDevice: true,
  plan: 'free',
  flags: { cloudBank: true },
};

describe('foto de comparación del doble (1.8 del plan de B14)', () => {
  it('la app la entiende y trae solo Todos y la especialidad de quien pregunta', async () => {
    const model = createFakeModelStore();
    seedComparison(model, { students: 45, specialty: 'general_surgery' });
    // Una especialidad que no es la de quien pregunta no debe salir
    model.cells.push(
      ...model.cells
        .filter((cell) => cell.cohort === 'specialty')
        .map((cell) => ({ ...cell, cohortKey: 'pediatrics' })),
    );

    const reply = await fetchComparisonSnapshot(
      clientOf(comparisonSnapshotFor(model, 'general_surgery')),
    );
    if (!reply.ok) throw new Error('La app no entendió la foto del doble');
    const snapshot = reply.value;
    expect(snapshot).toMatchObject({
      available: true,
      specialty: 'general_surgery',
      minGroupSize: MIN_PRIVACY_GROUP,
    });
    expect(snapshot.cells.some((cell) => cell.cohort === 'all')).toBe(true);
    expect(snapshot.cells.some((cell) => cell.cohort === 'specialty')).toBe(true);
    for (const cell of snapshot.cells) {
      expect(cell.state).toBe('ready');
      expect(cell.cuts).toHaveLength(19);
    }
    // Quien no eligió especialidad solo ve a Todos, y la otra especialidad nunca sale
    const without = comparisonSnapshotFor(model, null);
    expect(without.cells.every((cell) => cell.cohort === 'all')).toBe(true);
    expect(comparisonSnapshotFor(model, 'obstetrics_gynecology').cells).toEqual(without.cells);
    expect(comparisonSnapshotFor(model, 'pediatrics').cells.length).toBe(snapshot.cells.length);
  });

  it('un grupo de menos de 30 dice calibrando y sin cortes, y el mínimo no baja de 30', async () => {
    // El admin escribió 5 y la tabla guardó cortes para 12 alumnos. Al leer, la base sigue exigiendo 30
    const model = createFakeModelStore();
    model.settings.minGroupSize = 5;
    seedComparison(model, { students: 12 });
    expect(model.cells.every((cell) => cell.cuts !== null)).toBe(true);
    const reply = await fetchComparisonSnapshot(clientOf(comparisonSnapshotFor(model, null)));
    if (!reply.ok) throw new Error('La app no entendió la foto del doble');
    expect(reply.value.minGroupSize).toBe(MIN_PRIVACY_GROUP);
    expect(reply.value.cells.length).toBeGreaterThan(0);
    for (const cell of reply.value.cells) {
      expect(cell).toMatchObject({ students: 12, state: 'calibrating', cuts: null });
    }
    // Con 30 alumnos o más sí salen los cortes
    const enough = createFakeModelStore();
    seedComparison(enough, { students: MIN_PRIVACY_GROUP });
    const ready = comparisonSnapshotFor(enough, null).cells;
    expect(ready.every((cell) => cell.state === 'ready' && cell.cuts?.length === 19)).toBe(true);
  });

  it('sin publicación o con la comparación apagada dice que no está disponible y sin celdas', async () => {
    const model = createFakeModelStore();
    const empty = await fetchComparisonSnapshot(clientOf(comparisonSnapshotFor(model, null)));
    expect(empty).toMatchObject({ ok: true, value: { available: false, cells: [] } });

    seedComparison(model, { students: 60 });
    model.settings.features.comparison = false;
    const off = await fetchComparisonSnapshot(
      clientOf(comparisonSnapshotFor(model, 'general_surgery')),
    );
    expect(off).toMatchObject({
      ok: true,
      value: { available: false, cells: [], specialty: 'general_surgery' },
    });
  });

  it('la especialidad sale de la siembra del modelo o de la fila de la cuenta, y sin elegir es null', () => {
    const model = createFakeModelStore();
    expect(specialtyOfCaller(model, 'a', null)).toBeNull();
    expect(specialtyOfCaller(model, 'a', 'undecided')).toBeNull();
    expect(specialtyOfCaller(model, 'a', 'pediatrics')).toBe('pediatrics');
    model.specialties.set('a', 'general_surgery');
    expect(specialtyOfCaller(model, 'a', 'pediatrics')).toBe('general_surgery');
    model.specialties.set('a', null);
    expect(specialtyOfCaller(model, 'a', 'pediatrics')).toBeNull();
  });
});

describe('línea base de la población del doble (1.9 del plan de B14)', () => {
  it('quita al leer todo dato con menos de 30 alumnos y la app la entiende', async () => {
    const model = createFakeModelStore();
    seedComparison(model, { students: 60 });
    model.population = {
      ...emptyPopulation(),
      available: true,
      runAt: null,
      bias: {
        anchoring: { students: 45, rate: 0.31 },
        framing: { students: 12, rate: 0.5 },
      },
      motives: {
        internal_medicine: { reports: 50, knowledge: 30, rushing: 20 },
        pediatrics: { reports: 10, knowledge: 10 },
      },
      topics: {
        cardiology: { students: 31, accuracy: 0.62, difficulty: 0.2 },
        nephrology: { students: 29, accuracy: 0.4, difficulty: null },
      },
      indicators: { eliminates: { students: 30, rate: 0.4 }, guesses: { students: 3, rate: 0.9 } },
    };
    const reply = await fetchPopulationBaselines(clientOf(populationBaselinesFor(model)));
    if (!reply.ok) throw new Error('La app no entendió la población del doble');
    const population = reply.value;
    expect(population.available).toBe(true);
    expect(Object.keys(population.bias)).toEqual(['anchoring']);
    expect(Object.keys(population.motives)).toEqual(['internal_medicine']);
    expect(Object.keys(population.topics)).toEqual(['cardiology']);
    expect(Object.keys(population.indicators)).toEqual(['eliminates']);
    // El detector de fatiga sigue calibrando mientras la noche no lo valide
    expect(population.fatigue.state).toBe('calibrating');
  });

  it('sin publicación no hay población disponible', async () => {
    const model = createFakeModelStore();
    model.population = { ...emptyPopulation(), available: true };
    const reply = await fetchPopulationBaselines(clientOf(populationBaselinesFor(model)));
    expect(reply).toMatchObject({ ok: true, value: { available: false } });
  });
});

describe('calibración en el catálogo del doble (1.6 del plan de B14)', () => {
  /** catalog_changes como lo contesta el doble con el modelo enganchado */
  function catalogRows(questions: number, calibrated: number) {
    const bank = createFakeBankStore();
    seedBank(bank, questions);
    const model = createFakeModelStore();
    seedCalibration(model, bank, calibrated);
    const reply = withCatalogCalibration(
      model,
      fakeBankRpc(bank, 'catalog_changes', student, { p_since: 0 }),
    );
    if (!('json' in reply)) throw new Error('catalog_changes sin JSON');
    const rows = (reply.json as { rows: unknown[] }).rows;
    return { rows, model, bank };
  }

  it('cada fila trae calibration, null si no se calibra, y la app la usa como dificultad', () => {
    const { rows } = catalogRows(5, 3);
    const entries = rows.map((row) => catalogEntryOf(row));
    expect(entries).toHaveLength(5);
    expect(entries.every((entry) => entry !== null)).toBe(true);
    const sources = entries.map((entry) => (entry ? effectiveDifficulty(entry).source : null));
    expect(sources.filter((source) => source === 'calibrated')).toHaveLength(3);
    expect(sources.filter((source) => source === 'physician_estimate')).toHaveLength(2);
    // Las no calibradas traen la llave en null y no la omiten, como bank_catalog_json
    const withoutCalibration = rows.filter(
      (row) => (row as { calibration: unknown }).calibration === null,
    );
    expect(withoutCalibration).toHaveLength(2);
  });

  it('la calibración de una versión que ya no es la publicada no vale', () => {
    const { rows } = catalogRows(3, 3);
    const row = rows[0] as { calibration: { versionId: string } };
    const stale = { ...row, calibration: { ...row.calibration, versionId: randomUUID() } };
    const entry = catalogEntryOf(stale);
    if (!entry) throw new Error('La app no entendió la fila');
    expect(effectiveDifficulty(entry).source).toBe('physician_estimate');
  });

  it('sin el modelo enganchado la respuesta no cambia', () => {
    const bank = createFakeBankStore();
    seedBank(bank, 2);
    const reply = fakeBankRpc(bank, 'catalog_changes', student, { p_since: 0 });
    const model = createFakeModelStore();
    // Una respuesta que no trae filas, como el banco cerrado, pasa sin cambio
    const closed = { status: 200, json: { open: false, rows: [], nextSince: 0, done: true } };
    expect(withCatalogCalibration(model, closed)).toEqual(closed);
    const error = { status: 403, json: { code: '42501', message: 'no' } };
    expect(withCatalogCalibration(model, error)).toEqual(error);
    expect(reply).toBeDefined();
  });
});

describe('model_settings del doble (1.5 del plan de B14)', () => {
  it('la app lo lee con sus umbrales de fábrica y el piso de 30', () => {
    const model = createFakeModelStore();
    const settings = readModelSettings(modelSettingsValue(model));
    expect(settings.features).toEqual({ comparison: true, adaptive: true });
    expect(settings.thresholds.adaptiveMinItems).toBe(50);
    expect(settings.thresholds.minGroupSize).toBe(MIN_PRIVACY_GROUP);
    // Lo que escriba una prueba para apagar el modo adaptativo llega a la app
    model.settings.features.adaptive = false;
    expect(readModelSettings(modelSettingsValue(model)).features.adaptive).toBe(false);
    // Y el piso de 30 vale aunque el doble tenga menos
    model.settings.minGroupSize = 5;
    expect(readModelSettings(modelSettingsValue(model)).thresholds.minGroupSize).toBe(
      MIN_PRIVACY_GROUP,
    );
  });
});
