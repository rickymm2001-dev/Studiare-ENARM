// La calibración nocturna completa con alumnos simulados (B14, 3 y 8.3 del plan de B14). Rasch y Elo
// recuperan la dificultad verdadera como pide E 14.2, la misma entrada da la misma salida, las celdas
// chicas no llevan cortes y nada de lo que sale lleva seudónimos
import { beforeAll, describe, expect, it } from 'vitest';
import { FACTORY_THRESHOLDS } from '@/config/thresholds';
import { computePairAgreement } from '@/engines/agreement';
import { pearson } from '@/engines/stats/correlation';
import { simulatedInput, type Simulated } from '../../../tests/calibration/simulated';
import { runCalibration } from './run';
import type { CalibrationOutput } from './types';

const CODE = /^[a-z][a-z0-9_]{0,63}$/;
const KEY = /^[A-Za-z0-9_./*:-]{1,64}$/;

/** El mismo criterio de model_json_numeric_only de la migración 20261028000001 */
function numericOnly(value: unknown): boolean {
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return CODE.test(value);
  if (Array.isArray(value)) return value.every(numericOnly);
  if (typeof value === 'object') {
    return Object.entries(value).every(([key, entry]) => KEY.test(key) && numericOnly(entry));
  }
  return false;
}

describe('calibración nocturna con alumnos simulados', { timeout: 300_000 }, () => {
  let sim: Simulated;
  let output: CalibrationOutput;
  beforeAll(() => {
    sim = simulatedInput({
      seed: 'calibracion-unit-1',
      size: 120,
      days: 45,
      specialties: { general_surgery: 40, pediatrics: 12 },
    });
    output = runCalibration(sim.input);
  }, 300_000);

  it('Rasch recupera la dificultad verdadera con correlación de 0.90 o más', () => {
    const rows = output.items.filter((item) => item.difficulty !== null);
    expect(rows.length).toBeGreaterThanOrEqual(150);
    const correlation = pearson(
      rows.map((item) => sim.trueDifficulty.get(item.versionId) ?? 0),
      rows.map((item) => item.difficulty as number),
    );
    expect(correlation).toBeGreaterThanOrEqual(0.9);
    expect(output.counts.raschConverged).toBe(1);
  });

  it('Elo recupera la dificultad verdadera con correlación de 0.80 o más', () => {
    const rows = output.items.filter((item) => item.elo !== null);
    const correlation = pearson(
      rows.map((item) => sim.trueDifficulty.get(item.versionId) ?? 0),
      rows.map((item) => item.elo as number),
    );
    expect(correlation).toBeGreaterThanOrEqual(0.8);
  });

  it('cada pregunta con 30 alumnos o más sale al menos provisional y ninguna es extrema', () => {
    const states = new Set(output.items.map((item) => item.state));
    expect(states.has('physician_estimate')).toBe(false);
    for (const item of output.items) {
      expect(item.extreme).toBe(false);
      if (item.students >= 100 && (item.se ?? 1) <= 0.3) expect(item.state).toBe('calibrated');
      if (item.students < 30) expect(item.state).toBe('physician_estimate');
    }
    expect(output.counts.itemsProvisional as number).toBeGreaterThanOrEqual(0);
    expect(
      (output.counts.itemsPhysicianEstimate as number) +
        (output.counts.itemsProvisional as number) +
        (output.counts.itemsCalibrated as number),
    ).toBe(sim.input.bank.length);
  });

  it('el detector de fatiga queda validado con una cohorte con fatiga sembrada', () => {
    expect(output.fatigue.state).toBe('validated');
    expect(output.fatigue.splitHalfKappa).toBeGreaterThanOrEqual(0.4);
    expect(output.fatigue.ratioLower).toBeGreaterThan(1);
    expect(output.population.fatigue.state).toBe('validated');
  });

  it('la celda de especialidad con 40 alumnos sale lista y la de 12 sale calibrando sin cortes', () => {
    const cell = (key: string) =>
      output.comparison.find(
        (entry) =>
          entry.cohort === 'specialty' &&
          entry.key === key &&
          entry.metric === 'sim_accuracy' &&
          entry.branch === '*',
      );
    expect(cell('general_surgery')).toMatchObject({ students: 40 });
    expect(cell('general_surgery')?.cuts).toHaveLength(19);
    expect(cell('pediatrics')).toMatchObject({ students: 12, cuts: null });
    for (const entry of output.comparison) {
      if (entry.cuts !== null) {
        expect(entry.students).toBeGreaterThanOrEqual(30);
        expect(entry.cuts).toHaveLength(19);
        expect([...entry.cuts].sort((a, b) => a - b)).toEqual(entry.cuts);
      }
    }
  });

  it('la población solo publica datos con 30 alumnos o más', () => {
    for (const topic of Object.values(output.population.topics)) {
      expect(topic.students).toBeGreaterThanOrEqual(30);
    }
    for (const tag of Object.values(output.population.bias))
      expect(tag.students).toBeGreaterThanOrEqual(30);
    for (const indicator of Object.values(output.population.indicators)) {
      expect(indicator.students).toBeGreaterThanOrEqual(30);
    }
    expect(Object.keys(output.population.topics).length).toBeGreaterThan(10);
    expect(Object.keys(output.population.bias).length).toBeGreaterThan(5);
  });

  it('el acuerdo del etiquetado es el de computePairAgreement con los mismos pares', () => {
    const report = computePairAgreement(
      sim.input.labelPairs.map((pair) => ({
        authorTag: pair.authorTag,
        reviewerTag: pair.reviewerTag,
      })),
      FACTORY_THRESHOLDS.bias,
    );
    expect(output.agreement.pairs).toBe(60);
    expect(output.agreement.kappa).toBe(report.global?.kappa);
    expect(output.agreement.observed).toBe(report.global?.observedAgreement);
  });

  it('la misma entrada da la misma salida', () => {
    expect(runCalibration(sim.input)).toEqual(output);
  });

  it('nada de lo que sale lleva seudónimos, y las poblaciones y los conteos son solo números y códigos', () => {
    const { counts, population, agreement } = output;
    expect(numericOnly(counts)).toBe(true);
    expect(numericOnly(population)).toBe(true);
    expect(numericOnly(agreement)).toBe(true);
    const published = JSON.stringify({
      items: output.items,
      options: output.options,
      population,
      comparison: output.comparison,
      agreement,
      counts,
    });
    expect(published).not.toMatch(/"p\d{4}/);
    expect(published).not.toMatch(/p\d{4}\|/);
  });

  it('las variantes se vuelven listas con las exposiciones que pide el admin', () => {
    const variants = new Set(sim.input.bank.slice(0, 5).map((item) => item.versionId));
    const input = {
      ...sim.input,
      bank: sim.input.bank.map((item) =>
        variants.has(item.versionId) ? { ...item, variantOf: 'q-original' } : item,
      ),
      thresholds: {
        ...FACTORY_THRESHOLDS,
        sampling: { ...FACTORY_THRESHOLDS.sampling, variantExposuresForExam: 20 },
      },
    };
    const result = runCalibration(input);
    const rows = result.items.filter((item) => variants.has(item.versionId));
    expect(rows).toHaveLength(5);
    for (const row of rows) expect(row.variantReady).toBe(true);
    expect(
      result.items.filter((item) => !variants.has(item.versionId) && item.variantReady !== null),
    ).toEqual([]);
    expect(result.counts.variantsReady).toBe(5);
    // Con el umbral de fábrica (200) ninguna alcanza
    const strict = runCalibration({ ...input, thresholds: FACTORY_THRESHOLDS });
    expect(strict.items.filter((item) => item.variantReady === true)).toEqual([]);
  });

  it('sin permisos de nadie no hay nada que publicar y no truena', () => {
    const empty = runCalibration({
      ...sim.input,
      people: [],
      answers: [],
      exposures: [],
      activity: [],
      motives: [],
      labelPairs: [],
    });
    expect(empty.items).toEqual([]);
    expect(empty.options).toEqual([]);
    expect(empty.comparison).toEqual([]);
    expect(empty.fatigue.state).toBe('calibrating');
    expect(empty.agreement).toMatchObject({ pairs: 0, kappa: null });
    expect(empty.counts).toMatchObject({ consenters: 0, firstAttempts: 0, itemsCalibrated: 0 });
    expect(empty.counts.itemsPhysicianEstimate).toBe(sim.input.bank.length);
  });

  it('un alumno que retira el permiso, con menos alumnos, deja las preguntas en provisional', () => {
    const keep = new Set(sim.input.people.slice(0, 50).map((person) => person.person));
    const result = runCalibration({
      ...sim.input,
      people: sim.input.people.filter((person) => keep.has(person.person)),
      answers: sim.input.answers.filter((row) => keep.has(row.person)),
      exposures: sim.input.exposures.filter((row) => keep.has(row.person)),
      activity: sim.input.activity.filter((row) => keep.has(row.person)),
      motives: sim.input.motives.filter((row) => keep.has(row.person)),
    });
    expect(result.counts.consenters).toBe(50);
    expect(result.items.some((item) => item.state === 'provisional')).toBe(true);
    expect(result.items.some((item) => item.state === 'calibrated')).toBe(false);
    // Las especialidades de 40 y 12 alumnos pierden a los que se fueron y la de 12 sigue calibrando
    expect(
      result.comparison.find((entry) => entry.key === 'pediatrics' && entry.metric === 'reviews'),
    ).toMatchObject({ cuts: null });
  });
});
