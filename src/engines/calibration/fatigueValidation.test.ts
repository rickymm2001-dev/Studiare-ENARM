// Validación del detector de fatiga con datos reales (B14, 3.6 del plan de B14, respuesta 71). Cohortes
// sintéticas con la fatiga sembrada o sin ella, para ver los tres estados y sus bordes
import { describe, expect, it } from 'vitest';
import { FACTORY_MODEL_SETTINGS } from '@/config/modelSettings';
import { FACTORY_THRESHOLDS } from '@/config/thresholds';
import { createRng } from '@/engines/random';
import { answer, bankItem } from '../../../tests/calibration/builders';
import { validateFatigue } from './fatigueValidation';
import type { AnswerRow, MotiveRow } from './types';

const items = Array.from({ length: 6 }, (_, index) => bankItem(`f${index}`, { physician: 3 }));
const bank = new Map(items.map((item) => [item.versionId, item]));

interface CohortOptions {
  seed: string;
  students: number;
  /** Cuántos alumnos se cansan, empezando por el primero */
  fatigued: number;
  /** Sesiones largas por alumno */
  sessions?: number;
  /** Solo se cansan en las sesiones pares del alumno */
  onlyEvenSessions?: boolean;
  /** Parte de los errores del último tercio que marca Fatiga, en los cansados y en los demás */
  motiveShare?: { fatigued: number; others: number };
  /** Respuestas por sesión y minutos de la sesión */
  answersPerSession?: number;
  minutes?: number;
}

/**
 * Un alumno con sesiones largas. La probabilidad de acertar es la esperada por la dificultad del médico
 * (0.6) y, si se cansa, baja 0.012 por minuto después del minuto 10, y el tiempo sube con los minutos
 */
function cohort(options: CohortOptions) {
  const rng = createRng(options.seed);
  const sessions = options.sessions ?? 8;
  const perSession = options.answersPerSession ?? 18;
  const minutes = options.minutes ?? 45;
  const share = options.motiveShare ?? { fatigued: 0.3, others: 0.05 };
  const answers: AnswerRow[] = [];
  const motives: MotiveRow[] = [];
  let seq = 0;
  for (let student = 0; student < options.students; student += 1) {
    const person = `p${student}`;
    const tires = student < options.fatigued;
    for (let session = 0; session < sessions; session += 1) {
      const sessionTires = tires && (!options.onlyEvenSessions || session % 2 === 0);
      for (let index = 0; index < perSession; index += 1) {
        const minute = Math.round((index * minutes) / (perSession - 1));
        const drop = sessionTires ? 0.012 * Math.max(0, minute - 10) : 0;
        const correct = rng.chance(0.6 - drop);
        seq += 1;
        answers.push(
          answer({
            person,
            key: `f${index % items.length}`,
            letter: correct ? 'A' : 'B',
            seq,
            session: `${person}|s${session}`,
            // Cada sesión, un día; las primeras quedan más lejos
            daysBefore: 20 - session,
            minute,
            ms: Math.round(
              30_000 * (1 + (sessionTires ? 0.02 * minute : 0)) * (0.8 + rng.next() * 0.4),
            ),
          }),
        );
        const lastThird = index >= perSession - Math.floor(perSession / 3);
        if (!correct && lastThird) {
          const chance = tires ? share.fatigued : share.others;
          motives.push({
            person,
            daysBefore: 20 - session,
            branch: 'pediatrics',
            motive: rng.chance(chance) ? 'fatigue' : 'knowledge',
            lastThird: true,
          });
        }
      }
    }
  }
  return { answers, motives };
}

const validate = (
  data: ReturnType<typeof cohort>,
  fatigue = FACTORY_MODEL_SETTINGS.thresholds.fatigue,
) =>
  validateFatigue({
    asOfDay: '2026-10-15',
    answers: data.answers,
    bank,
    exposures: [],
    motives: data.motives,
    thresholds: FACTORY_THRESHOLDS,
    settings: { thresholds: { ...FACTORY_MODEL_SETTINGS.thresholds, fatigue } },
  });

describe('validación del detector de fatiga', () => {
  it('con una cohorte cansada que lo dice, el detector queda validado', () => {
    const result = validate(cohort({ seed: 'fatiga-si', students: 60, fatigued: 30 }));
    expect(result.state).toBe('validated');
    expect(result.students).toBeGreaterThanOrEqual(30);
    expect(result.longSessions).toBe(result.students * 8);
    expect(result.splitHalfKappa).toBeGreaterThanOrEqual(0.4);
    expect(result.ratioLower).toBeGreaterThan(1);
    expect(result.motiveReports).toBeGreaterThanOrEqual(40);
  });

  it('con una cohorte sin fatiga no queda validado', () => {
    const result = validate(cohort({ seed: 'fatiga-no', students: 60, fatigued: 0 }));
    expect(result.state).not.toBe('validated');
  });

  it('con fatiga en las respuestas pero sin que el alumno lo diga queda no válido', () => {
    const result = validate(
      cohort({
        seed: 'fatiga-callada',
        students: 60,
        fatigued: 30,
        motiveShare: { fatigued: 0.1, others: 0.1 },
      }),
    );
    expect(result.state).toBe('not_valid');
    expect(result.splitHalfKappa).toBeGreaterThanOrEqual(0.4);
    expect(result.ratioLower).toBeLessThanOrEqual(1);
  });

  it('si las dos mitades de las sesiones no coinciden queda no válido', () => {
    const result = validate(
      cohort({ seed: 'fatiga-alterna', students: 60, fatigued: 30, onlyEvenSessions: true }),
    );
    expect(result.state).toBe('not_valid');
    expect(result.splitHalfKappa === null || result.splitHalfKappa < 0.4).toBe(true);
  });

  it('con menos de 30 alumnos con sesiones largas sigue calibrando', () => {
    const result = validate(cohort({ seed: 'fatiga-pocos', students: 29, fatigued: 15 }));
    expect(result.state).toBe('calibrating');
    expect(result.students).toBe(29);
    // El mínimo de alumnos es un ajuste del admin
    expect(
      validate(cohort({ seed: 'fatiga-pocos', students: 29, fatigued: 15 }), {
        minStudents: 29,
        minSplitHalfKappa: 0.4,
        minMotiveReports: 40,
      }).state,
    ).toBe('validated');
  });

  it('con menos de 40 motivos reportados sigue calibrando', () => {
    const result = validate(
      cohort({
        seed: 'fatiga-sin-motivos',
        students: 60,
        fatigued: 30,
        motiveShare: { fatigued: 0, others: 0 },
      }),
      { minStudents: 30, minSplitHalfKappa: 0.4, minMotiveReports: 1_000_000 },
    );
    expect(result.state).toBe('calibrating');
    const none = validate({
      ...cohort({ seed: 'fatiga-0', students: 60, fatigued: 30 }),
      motives: [],
    });
    expect(none).toMatchObject({ state: 'calibrating', motiveReports: 0, ratioLower: null });
  });

  it('el kappa mínimo es un ajuste del admin', () => {
    const data = cohort({ seed: 'fatiga-kappa', students: 60, fatigued: 30 });
    const strict = validate(data, {
      minStudents: 30,
      minSplitHalfKappa: 0.999,
      minMotiveReports: 40,
    });
    expect(strict.state).toBe('not_valid');
  });

  it('las sesiones de 30 minutos o menos, o con menos de 6 respuestas, no son largas', () => {
    expect(
      validate(cohort({ seed: 'fatiga-corta', students: 40, fatigued: 20, minutes: 30 })),
    ).toMatchObject({ state: 'calibrating', students: 0, longSessions: 0 });
    expect(
      validate(cohort({ seed: 'fatiga-pocas', students: 40, fatigued: 20, answersPerSession: 5 })),
    ).toMatchObject({ state: 'calibrating', students: 0 });
  });

  it('las respuestas sin sesión, sin minuto o sin tiempo no cuentan', () => {
    const data = cohort({ seed: 'fatiga-huecos', students: 40, fatigued: 20 });
    const broken = data.answers.map((row, index) =>
      index % 3 === 0
        ? { ...row, session: null }
        : index % 3 === 1
          ? { ...row, minute: null }
          : { ...row, ms: null },
    );
    expect(validate({ ...data, answers: broken })).toMatchObject({
      students: 0,
      state: 'calibrating',
    });
  });

  it('los motivos de causas de antes se leen con la tabla de equivalencias y los raros se ignoran', () => {
    const data = cohort({ seed: 'fatiga-motivos', students: 60, fatigued: 30 });
    const legacy = data.motives.map((row) => ({
      ...row,
      motive: row.motive === 'knowledge' ? 'forgot' : row.motive,
    }));
    expect(validate({ ...data, motives: legacy }).motiveReports).toBe(data.motives.length);
    const junk = data.motives.map((row) => ({ ...row, motive: 'texto libre' }));
    expect(validate({ ...data, motives: junk }).motiveReports).toBe(0);
    // Una causa que no dice cuál de los siete fue tampoco cuenta
    const other = data.motives.map((row) => ({ ...row, motive: 'other' }));
    expect(validate({ ...data, motives: other }).motiveReports).toBe(0);
  });

  it('los motivos fuera del último tercio no entran a la razón', () => {
    const data = cohort({ seed: 'fatiga-tercio', students: 60, fatigued: 30 });
    const outside = data.motives.map((row) => ({ ...row, lastThird: false }));
    expect(validate({ ...data, motives: outside })).toMatchObject({
      motiveReports: 0,
      state: 'calibrating',
    });
  });
});
