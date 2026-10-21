// Celdas de la comparación que publica la noche (B14, 3.9 y 5 del plan de B14)
import { describe, expect, it } from 'vitest';
import { FACTORY_MODEL_SETTINGS } from '@/config/modelSettings';
import { addDays } from '@/engines/studyDay';
import { answer, bankItem } from '../../../tests/calibration/builders';
import { buildComparisonCells } from './comparisonCells';
import type { ActivityRow, AnswerRow, PersonRow } from './types';

const AS_OF = '2026-10-15';
const items = [
  bankItem('c1', { branch: 'pediatrics' }),
  bankItem('c2', { branch: 'general_surgery' }),
];
const bank = new Map(items.map((item) => [item.versionId, item]));

/** n alumnos con 20 respuestas de Pediatría, k aciertos, y un repaso por día en dos días */
function students(prefix: string, count: number, specialty: string | null) {
  const people: PersonRow[] = [];
  const answers: AnswerRow[] = [];
  const activity: ActivityRow[] = [];
  let seq = 1;
  for (let index = 0; index < count; index += 1) {
    const person = `${prefix}${index}`;
    people.push({ person, specialty });
    for (let n = 0; n < 20; n += 1) {
      answers.push(
        answer({
          person,
          key: 'c1',
          seq: (seq += 1),
          letter: n < 5 + (index % 15) ? 'A' : 'B',
          daysBefore: 1 + (n % 5),
        }),
      );
    }
    activity.push({ person, daysBefore: 2, reviews: 10 + index, answers: 0 });
    activity.push({ person, daysBefore: 4, reviews: 5, answers: 0 });
  }
  return { people, answers, activity };
}

const build = (data: ReturnType<typeof students>, minGroupSize?: number) =>
  buildComparisonCells({
    asOfDay: AS_OF,
    ...data,
    bank,
    settings: {
      thresholds: {
        ...FACTORY_MODEL_SETTINGS.thresholds,
        ...(minGroupSize === undefined ? {} : { minGroupSize }),
      },
    },
  });

function join(...groups: ReturnType<typeof students>[]) {
  return {
    people: groups.flatMap((group) => group.people),
    answers: groups.flatMap((group) => group.answers),
    activity: groups.flatMap((group) => group.activity),
  };
}

describe('celdas de comparación', () => {
  const surgery = students('s', 40, 'general_surgery');
  const pediatrics = students('p', 12, 'pediatrics');
  const undecided = students('u', 10, null);
  const { cells, counts } = build(join(surgery, pediatrics, undecided));
  const cell = (
    cohort: 'all' | 'specialty',
    key: string,
    metric: 'sim_accuracy' | 'reviews' | 'consistency',
    branch: string,
  ) =>
    cells.find(
      (entry) =>
        entry.cohort === cohort &&
        entry.key === key &&
        entry.metric === metric &&
        entry.branch === branch,
    );

  it('Todos con 62 alumnos con datos lleva sus 19 cortes en cada métrica', () => {
    expect(cell('all', '*', 'sim_accuracy', '*')).toMatchObject({ students: 62 });
    expect(cell('all', '*', 'sim_accuracy', '*')?.cuts).toHaveLength(19);
    expect(cell('all', '*', 'sim_accuracy', 'pediatrics')?.cuts).toHaveLength(19);
    expect(cell('all', '*', 'reviews', '*')?.cuts).toHaveLength(19);
    expect(cell('all', '*', 'consistency', '*')?.cuts).toHaveLength(19);
  });

  it('una especialidad con 40 alumnos lista y una con 12 calibrando y sin cortes', () => {
    expect(cell('specialty', 'general_surgery', 'sim_accuracy', '*')).toMatchObject({
      students: 40,
    });
    expect(cell('specialty', 'general_surgery', 'sim_accuracy', '*')?.cuts).toHaveLength(19);
    expect(cell('specialty', 'pediatrics', 'sim_accuracy', '*')).toMatchObject({
      students: 12,
      cuts: null,
    });
    expect(cell('specialty', 'pediatrics', 'reviews', '*')).toMatchObject({
      students: 12,
      cuts: null,
    });
  });

  it('quien no eligió especialidad solo entra a Todos, y no hay celda de una rama sin respuestas', () => {
    expect(cells.some((entry) => entry.cohort === 'specialty' && entry.key === '*')).toBe(false);
    // Cada especialidad lleva Pediatría, el total de aciertos, repasos y constancia
    expect(cells.filter((entry) => entry.cohort === 'specialty')).toHaveLength(8);
    expect(cell('all', '*', 'sim_accuracy', 'general_surgery')).toBeUndefined();
  });

  it('cuenta las celdas listas y las que calibran', () => {
    expect(counts.cellsReady + counts.cellsCalibrating).toBe(cells.length);
    expect(counts.cellsReady).toBe(cells.filter((entry) => entry.cuts !== null).length);
    expect(counts.comparisonStudents).toBe(62);
  });

  it('el piso de 30 vale aunque llegue un ajuste más bajo', () => {
    const lowered = build(join(surgery, pediatrics), 5);
    expect(lowered.cells.every((entry) => entry.cuts === null || entry.students >= 30)).toBe(true);
    expect(
      lowered.cells.find((entry) => entry.key === 'pediatrics' && entry.metric === 'reviews')?.cuts,
    ).toBeNull();
  });

  it('un mínimo más alto que el de fábrica deja sin cortes a Todos con menos alumnos', () => {
    const strict = build(join(surgery), 50);
    expect(strict.cells.every((entry) => entry.cuts === null)).toBe(true);
  });

  it('las filas salen en un orden estable, Todos primero y el total de cada métrica primero', () => {
    expect(cells[0]).toMatchObject({
      cohort: 'all',
      key: '*',
      metric: 'sim_accuracy',
      branch: '*',
    });
    expect(cells[1]).toMatchObject({ cohort: 'all', metric: 'sim_accuracy', branch: 'pediatrics' });
    expect(build(join(surgery, pediatrics, undecided)).cells).toEqual(cells);
  });
});

describe('la ventana y los mínimos de la comparación', () => {
  it('solo cuentan los 30 días completos anteriores al corte', () => {
    const data = students('w', 30, null);
    // Todas las respuestas de un alumno el día del corte y 31 días antes quedan fuera
    const outside = data.people.flatMap((person, index) => [
      answer({ person: person.person, key: 'c2', seq: 9000 + index, daysBefore: 0 }),
      answer({ person: person.person, key: 'c2', seq: 9500 + index, daysBefore: 31 }),
    ]);
    const { cells } = build({ ...data, answers: [...data.answers, ...outside] });
    expect(cells.find((cell) => cell.branch === 'general_surgery')).toBeUndefined();
    expect(cells.find((cell) => cell.metric === 'consistency')).toMatchObject({ students: 30 });
  });

  it('una rama con menos de 20 respuestas de un alumno no lo cuenta en esa rama', () => {
    const data = students('m', 30, null);
    const few = data.people.flatMap((person, index) =>
      Array.from({ length: 19 }, (_, n) =>
        answer({ person: person.person, key: 'c2', seq: 20_000 + index * 20 + n, daysBefore: 2 }),
      ),
    );
    const { cells } = build({ ...data, answers: [...data.answers, ...few] });
    expect(cells.find((cell) => cell.branch === 'general_surgery')).toBeUndefined();
    expect(
      cells.find((cell) => cell.metric === 'sim_accuracy' && cell.branch === '*'),
    ).toMatchObject({ students: 30 });
  });

  it('los retos y las sesiones sin tipo no cuentan para el acierto', () => {
    const data = students('r', 30, null);
    const challenge = data.answers.map((entry) => ({
      ...entry,
      seq: entry.seq + 50_000,
      sessionKind: 'challenge' as const,
    }));
    const base = build(data).cells.find(
      (cell) => cell.metric === 'sim_accuracy' && cell.branch === '*',
    );
    const withChallenge = build({ ...data, answers: [...data.answers, ...challenge] }).cells.find(
      (cell) => cell.metric === 'sim_accuracy' && cell.branch === '*',
    );
    expect(withChallenge).toEqual(base);
  });

  it('el día del corte menos 30 todavía entra', () => {
    expect(addDays(AS_OF, -30)).toBe('2026-09-15');
    const data = students('b', 30, null);
    const edge = data.people.map((person, index) =>
      answer({ person: person.person, key: 'c1', seq: 70_000 + index, daysBefore: 30 }),
    );
    const { cells } = build({ ...data, answers: [...data.answers, ...edge] });
    expect(
      cells.find((cell) => cell.metric === 'consistency' && cell.branch === '*')?.cuts,
    ).toHaveLength(19);
  });
});
