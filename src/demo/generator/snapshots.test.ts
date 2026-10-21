import { describe, expect, it } from 'vitest';
import { FACTORY_MODEL_SETTINGS } from '@/config/modelSettings';
import { DEMO_SNAPSHOT_STUDENTS } from '../constants';
import { topicTaxonomy } from '../content';
import { buildDemoBank } from '../content/bank';
import { bankRowsFrom, calibrationInputFromCohort } from './calibrationInput';
import { generateCohort } from './cohort';
import { buildDemoSnapshotData, demoSpecialtyOf, type DemoSnapshotRequest } from './snapshots';

const bank = buildDemoBank();
const endDay = '2026-10-15';
const small = (seed: string, size = 8, days = 12) =>
  generateCohort(bank, topicTaxonomy, { seed, size, days, endDay, simulateCards: false });

describe('la cohorte simulada convertida en lo que exporta la base', () => {
  const cohort = small('c1');
  const input = calibrationInputFromCohort(cohort, bank, {
    endDay,
    seed: 'c1',
    specialtyOf: demoSpecialtyOf(8),
  });

  it('el corte es el día siguiente al último día de estudio y usa los ajustes de fábrica', () => {
    expect(input.asOfDay).toBe('2026-10-16');
    expect(input.settings).toBe(FACTORY_MODEL_SETTINGS);
    expect(input.labelPairs).toEqual([]);
  });

  it('los alumnos son seudónimos p0000, p0001 y nunca llevan ids de cuenta', () => {
    expect(input.people.map((person) => person.person)).toEqual(
      Array.from({ length: 8 }, (_, index) => `p${String(index).padStart(4, '0')}`),
    );
    const serialized = JSON.stringify(input.people) + JSON.stringify(input.answers.slice(0, 50));
    for (const student of cohort.students) {
      expect(serialized).not.toContain(student.userId);
    }
  });

  it('cada respuesta va después de su exposición y el orden es estrictamente creciente', () => {
    expect(input.answers.length).toBeGreaterThan(50);
    expect(input.exposures).toHaveLength(input.answers.length);
    input.answers.forEach((answer, index) => {
      const exposure = input.exposures[index];
      expect(exposure?.person).toBe(answer.person);
      expect(exposure?.versionId).toBe(answer.versionId);
      expect(exposure?.seq).toBeLessThan(answer.seq);
      if (index > 0) expect(answer.seq).toBeGreaterThan(input.answers[index - 1]?.seq ?? 0);
      expect(answer.daysBefore).toBeGreaterThanOrEqual(0);
      expect(answer.sessionKind).toBe('practice');
    });
  });

  it('las opciones expuestas son las que se mostraron, con la correcta', () => {
    const rows = new Map(input.bank.map((row) => [row.versionId, row]));
    for (const exposure of input.exposures.slice(0, 40)) {
      const row = rows.get(exposure.versionId);
      expect(row).toBeDefined();
      expect(exposure.options).toHaveLength(4);
      expect(row?.options.some((option) => exposure.options.includes(option.id))).toBe(true);
    }
  });

  it('la actividad trae repasos y respuestas por día, solo de días anteriores al corte', () => {
    expect(input.activity.length).toBeGreaterThan(10);
    for (const row of input.activity) {
      expect(row.daysBefore).toBeGreaterThanOrEqual(1);
      expect(row.reviews).toBeGreaterThanOrEqual(15);
    }
  });

  it('las especialidades se reparten 60% cirugía, 20% pediatría y el resto sin elegir', () => {
    const specialties = input.people.map((person) => person.specialty);
    expect(specialties.filter((one) => one === 'general_surgery')).toHaveLength(4);
    expect(specialties.filter((one) => one === 'pediatrics')).toHaveLength(2);
    expect(specialties.filter((one) => one === null)).toHaveLength(2);
  });

  it('la misma semilla da exactamente lo mismo y otra semilla da otra cosa', () => {
    const again = calibrationInputFromCohort(small('c1'), bank, { endDay, seed: 'c1' });
    const same = calibrationInputFromCohort(cohort, bank, { endDay, seed: 'c1' });
    expect(again).toEqual(same);
    const other = calibrationInputFromCohort(small('c2'), bank, { endDay, seed: 'c2' });
    expect(
      other.answers.length === same.answers.length && other.motives.length === same.motives.length,
    ).toBe(false);
  });

  it('las versiones del banco salen sin texto y con la dificultad del médico', () => {
    const rows = bankRowsFrom(bank);
    expect(rows).toHaveLength(bank.questions.length);
    for (const row of rows.slice(0, 20)) {
      expect(row.current).toBe(true);
      expect(row.options.length).toBeGreaterThanOrEqual(4);
      expect(row.options.filter((option) => option.correct)).toHaveLength(1);
      expect(Object.keys(row)).not.toContain('stem');
    }
  });
});

describe('las fotos de la demostración', () => {
  const request: DemoSnapshotRequest = { seed: 'snap', size: 10, days: 14, endDay };

  it('una cohorte chica no llega al piso de 30 y todas sus celdas quedan sin cortes', () => {
    const data = buildDemoSnapshotData(request, bank, topicTaxonomy);
    expect(data.asOfDay).toBe('2026-10-16');
    expect(data.students).toBe(10);
    expect(data.comparison.length).toBeGreaterThan(0);
    for (const cell of data.comparison) {
      expect(cell.students).toBeLessThanOrEqual(10);
      expect(cell.cuts).toBeNull();
    }
    expect(data.population.fatigue.state).toBe('calibrating');
  });

  it('con 40 alumnos el grupo Todos ya reúne 30 con datos y publica sus 19 cortes', () => {
    const data = buildDemoSnapshotData(
      { seed: 'snap', size: 40, days: 20, endDay },
      bank,
      topicTaxonomy,
    );
    const total = data.comparison.find(
      (cell) => cell.cohort === 'all' && cell.metric === 'sim_accuracy' && cell.branch === '*',
    );
    expect(total?.students).toBeGreaterThanOrEqual(FACTORY_MODEL_SETTINGS.thresholds.minGroupSize);
    expect(total?.cuts).toHaveLength(19);
    const cuts = total?.cuts ?? [];
    expect(cuts.every((cut, index) => index === 0 || cut >= (cuts[index - 1] ?? 0))).toBe(true);
    // La especialidad con 24 alumnos (60%) no llega a 30 y calibra
    const surgery = data.comparison.find(
      (cell) => cell.cohort === 'specialty' && cell.key === 'general_surgery',
    );
    expect(surgery?.cuts ?? null).toBeNull();
  }, 60_000);

  it('es reproducible con la misma semilla', () => {
    const a = buildDemoSnapshotData(request, bank, topicTaxonomy);
    const b = buildDemoSnapshotData(request, bank, topicTaxonomy);
    expect(b).toEqual(a);
  });

  it('el tope de alumnos de la demostración alcanza para tener grupos de 30', () => {
    expect(DEMO_SNAPSHOT_STUDENTS).toBeGreaterThanOrEqual(
      2 * FACTORY_MODEL_SETTINGS.thresholds.minGroupSize,
    );
  });
});
