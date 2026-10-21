// Dificultad de la noche (B14, 3.4 del plan de B14). Estados de PC 5.5 en sus bordes, enlace de escala
// con y sin 20 anclas, preguntas extremas y Elo
import { describe, expect, it } from 'vitest';
import { FACTORY_MODEL_SETTINGS } from '@/config/modelSettings';
import { FACTORY_THRESHOLDS } from '@/config/thresholds';
import { physicianToLogit } from '@/engines/difficulty';
import { createRng } from '@/engines/random';
import { bankItem } from '../../../tests/calibration/builders';
import { MIN_ANCHORS, calibrateItems } from './items';
import type { BankItemRow, FirstAttempt } from './types';

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function attempt(
  person: string,
  item: BankItemRow,
  correct: boolean,
  seq: number,
  daysBefore = 3,
): FirstAttempt {
  return {
    person,
    questionId: item.questionId,
    versionId: item.versionId,
    optionId: correct ? 'ok' : 'no',
    correct,
    daysBefore,
    seq,
    exposed: null,
  };
}

const run = (attempts: FirstAttempt[], items: BankItemRow[]) =>
  calibrateItems({
    attempts,
    bank: new Map(items.map((item) => [item.versionId, item])),
    thresholds: FACTORY_THRESHOLDS,
    settings: FACTORY_MODEL_SETTINGS,
  });

/**
 * Respuestas de un modelo de Rasch con una semilla. Cada pregunta la contestan los primeros n alumnos
 * de 100 con habilidad normal, y todos contestan además 12 preguntas de relleno
 */
function raschData(sizes: Record<string, number>, truth: Record<string, number> = {}) {
  const rng = createRng('items-estados');
  const abilities = Array.from({ length: 100 }, () => rng.normal(0, 1));
  const fillers = Array.from({ length: 12 }, (_, index) => bankItem(`f${index}`, { physician: 3 }));
  const tested = Object.keys(sizes).map((key) => bankItem(key, { physician: 3 }));
  const attempts: FirstAttempt[] = [];
  let seq = 0;
  const add = (item: BankItemRow, count: number, difficulty: number) => {
    for (let person = 0; person < count; person += 1) {
      seq += 1;
      attempts.push(
        attempt(
          `p${person}`,
          item,
          rng.chance(sigmoid((abilities[person] as number) - difficulty)),
          seq,
        ),
      );
    }
  };
  fillers.forEach((item, index) => {
    add(item, 100, -1 + (2 * index) / 11);
  });
  tested.forEach((item) => {
    add(item, sizes[item.versionId.slice(2)] as number, truth[item.versionId.slice(2)] ?? 0);
  });
  return { attempts, items: [...fillers, ...tested] };
}

describe('estados de calibración de PC 5.5', () => {
  const { attempts, items } = raschData({ a29: 29, b30: 30, c99: 99, d100: 100 });
  const result = run(attempts, items);
  const state = (key: string) => result.items.find((item) => item.versionId === `v-${key}`);

  it('29 alumnos es la estimada por el médico y 30 ya es provisional', () => {
    expect(state('a29')).toMatchObject({ students: 29, state: 'physician_estimate' });
    expect(state('b30')).toMatchObject({ students: 30, state: 'provisional' });
  });

  it('99 alumnos es provisional y 100 con error estándar chico es calibrada', () => {
    expect(state('c99')).toMatchObject({ students: 99, state: 'provisional' });
    expect(state('d100')).toMatchObject({ students: 100, state: 'calibrated' });
    expect(state('d100')?.se).toBeLessThanOrEqual(0.3);
    expect(state('b30')?.se).toBeLessThanOrEqual(0.5);
  });

  it('cada fila trae dificultad, error estándar, Elo y los alumnos distintos', () => {
    for (const item of result.items) {
      expect(item.students).toBeGreaterThan(0);
      expect(item.difficulty).not.toBeNull();
      expect(item.se).not.toBeNull();
      expect(item.elo).not.toBeNull();
      expect(item.eloResponses).toBe(item.students);
      expect(item.variantReady).toBeNull();
    }
    expect(result.items).toHaveLength(items.length);
    expect(result.counts.raschConverged).toBe(1);
  });

  it('un alumno que contesta dos veces la misma versión cuenta una vez', () => {
    const doubled = [...attempts, { ...(attempts[0] as FirstAttempt), seq: 99_999 }];
    const again = run(doubled, items);
    expect(again.items.find((item) => item.versionId === attempts[0]?.versionId)?.students).toBe(
      result.items.find((item) => item.versionId === attempts[0]?.versionId)?.students,
    );
  });

  it('con los umbrales de alumnos del admin cambiados, cambian los estados, pero el error estándar sigue mandando', () => {
    const custom = calibrateItems({
      attempts,
      bank: new Map(items.map((item) => [item.versionId, item])),
      thresholds: {
        ...FACTORY_THRESHOLDS,
        difficulty: { provisionalResponses: 20, calibratedResponses: 30 },
      },
      settings: FACTORY_MODEL_SETTINGS,
    });
    const stateOf = (key: string) =>
      custom.items.find((item) => item.versionId === `v-${key}`)?.state;
    // 29 alumnos ya alcanzan los 20 nuevos
    expect(stateOf('a29')).toBe('provisional');
    // 30 alumnos alcanzan los 30 nuevos, pero su error estándar pasa de 0.3
    expect(stateOf('b30')).toBe('provisional');
    expect(stateOf('d100')).toBe('calibrated');
  });

  it('un error estándar más estricto deja la pregunta en provisional', () => {
    const strict = calibrateItems({
      attempts,
      bank: new Map(items.map((item) => [item.versionId, item])),
      thresholds: FACTORY_THRESHOLDS,
      settings: {
        thresholds: {
          ...FACTORY_MODEL_SETTINGS.thresholds,
          calibratedMaxSe: 0.05,
          provisionalMaxSe: 0.1,
        },
      },
    });
    expect(strict.items.every((item) => item.state === 'physician_estimate')).toBe(true);
  });

  it('la misma entrada da la misma salida', () => {
    expect(run(attempts, items)).toEqual(result);
  });
});

describe('preguntas extremas', () => {
  it('todos acertaron o todos fallaron, con 30 alumnos o más, no tiene estimación finita', () => {
    const base = raschData({});
    const easy = bankItem('easy', { physician: 1 });
    const hard = bankItem('hard', { physician: 5 });
    const fewEasy = bankItem('few', { physician: 1 });
    const attempts = [...base.attempts];
    let seq = 100_000;
    for (let person = 0; person < 40; person += 1) {
      attempts.push(attempt(`p${person}`, easy, true, (seq += 1)));
      attempts.push(attempt(`p${person}`, hard, false, (seq += 1)));
    }
    for (let person = 0; person < 20; person += 1) {
      attempts.push(attempt(`p${person}`, fewEasy, true, (seq += 1)));
    }
    const { items, counts } = run(attempts, [...base.items, easy, hard, fewEasy]);
    const byKey = (key: string) => items.find((item) => item.versionId === `v-${key}`);
    expect(byKey('easy')).toMatchObject({
      students: 40,
      difficulty: null,
      se: null,
      state: 'physician_estimate',
      extreme: true,
    });
    expect(byKey('hard')).toMatchObject({
      students: 40,
      difficulty: null,
      state: 'physician_estimate',
      extreme: true,
    });
    // Con 20 alumnos todavía no hay con qué decir que es extrema
    expect(byKey('few')).toMatchObject({ students: 20, difficulty: null, extreme: false });
    // Elo sí se calcula, y sube la dificultad de la pregunta que todos fallan
    expect(byKey('hard')?.elo).toBeGreaterThan(physicianToLogit(5));
    expect(byKey('easy')?.elo).toBeLessThan(physicianToLogit(1));
    expect(counts.raschExcluded).toBe(3);
  });
});

describe('enlace de escala', () => {
  /** 30 preguntas de 40 alumnos. Las primeras `anchored` traen la calibración de la noche anterior */
  function anchored(
    anchors: number,
    previousState: 'provisional' | 'calibrated' | 'physician_estimate',
  ) {
    const rng = createRng(`enlace-${anchors}-${previousState}`);
    const abilities = Array.from({ length: 60 }, () => rng.normal(0, 1));
    const items: BankItemRow[] = [];
    const attempts: FirstAttempt[] = [];
    let seq = 0;
    for (let index = 0; index < 30; index += 1) {
      const difficulty = -1.5 + (3 * index) / 29;
      const item = bankItem(`k${index}`, {
        physician: (index % 5) + 1,
        previous:
          index < anchors ? { difficulty: difficulty + 0.7, se: 0.2, state: previousState } : null,
      });
      items.push(item);
      for (let person = 0; person < 40; person += 1) {
        seq += 1;
        attempts.push(
          attempt(
            `p${person}`,
            item,
            rng.chance(sigmoid((abilities[person] as number) - difficulty)),
            seq,
          ),
        );
      }
    }
    return { items, attempts };
  }
  const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;

  it('con 20 anclas la media coincide con la de la noche anterior', () => {
    const { items, attempts } = anchored(MIN_ANCHORS, 'calibrated');
    const { items: results, counts } = run(attempts, items);
    expect(counts.anchors).toBe(20);
    const published = items
      .slice(0, 20)
      .map((item) => results.find((row) => row.versionId === item.versionId)?.difficulty as number);
    const previous = items.slice(0, 20).map((item) => item.previous?.difficulty as number);
    // Redondeado a 3 decimales cada una
    expect(Math.abs(mean(published) - mean(previous))).toBeLessThan(0.002);
    // La escala de la noche anterior estaba 0.7 más arriba, así que el desplazamiento es positivo
    expect(counts.scaleShift).toBeGreaterThan(0.3);
  });

  it('con 19 anclas no alcanza y se enlaza con la escala del médico', () => {
    const { items, attempts } = anchored(MIN_ANCHORS - 1, 'calibrated');
    const { items: results, counts } = run(attempts, items);
    expect(counts.anchors).toBe(0);
    const logits = items.map((item) => physicianToLogit(item.physician));
    const published = results.map((item) => item.difficulty as number);
    expect(published).toHaveLength(30);
    expect(Math.abs(mean(published) - mean(logits))).toBeLessThan(0.002);
  });

  it('una calibración anterior que solo era la estimada por el médico no es ancla', () => {
    const { items, attempts } = anchored(30, 'physician_estimate');
    expect(run(attempts, items).counts.anchors).toBe(0);
  });

  it('sin respuestas no hay filas ni desplazamiento', () => {
    const { items, counts } = run([], [bankItem('x')]);
    expect(items).toEqual([]);
    expect(counts).toMatchObject({ scaleShift: 0, anchors: 0, raschExcluded: 0 });
  });
});

describe('diseño desconectado (revisión de B14, hallazgo 4)', () => {
  /**
   * Una isla de alumnos y preguntas que no comparte nada con las demás. Cada alumno contesta todas las
   * preguntas de su isla, con dificultades repartidas alrededor de `center`. `previousShift` pone en cada
   * pregunta la calibración de la noche anterior, esa cantidad por encima de la verdad
   */
  function island(
    name: string,
    input: { items: number; students: number; center: number; previousShift?: number },
  ) {
    const rng = createRng(`isla-${name}`);
    const abilities = Array.from({ length: input.students }, () => rng.normal(0, 1));
    const items: BankItemRow[] = [];
    const attempts: FirstAttempt[] = [];
    let seq = 0;
    for (let index = 0; index < input.items; index += 1) {
      const difficulty = input.center - 1 + (2 * index) / Math.max(input.items - 1, 1);
      const item = bankItem(`${name}${index}`, {
        physician: Math.max(1, Math.min(5, Math.round(difficulty + 3))),
        previous:
          input.previousShift === undefined
            ? null
            : { difficulty: difficulty + input.previousShift, se: 0.2, state: 'calibrated' },
      });
      items.push(item);
      for (let person = 0; person < input.students; person += 1) {
        seq += 1;
        attempts.push(
          attempt(
            `${name}-p${person}`,
            item,
            rng.chance(sigmoid((abilities[person] as number) - difficulty)),
            seq,
          ),
        );
      }
    }
    return { items, attempts };
  }
  const merge = (...islands: ReturnType<typeof island>[]) => ({
    items: islands.flatMap((entry) => entry.items),
    attempts: islands.flatMap((entry) => entry.attempts),
  });
  const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;

  it('dos grupos chicos sin nada en común no publican dificultades que no se pueden comparar', () => {
    // El caso de la revisión. Dos grupos de 80 alumnos y 12 preguntas, uno fácil y otro difícil
    const { items, attempts } = merge(
      island('f', { items: 12, students: 80, center: -2 }),
      island('d', { items: 12, students: 80, center: 2 }),
    );
    const { items: results, counts } = run(attempts, items);
    expect(counts).toMatchObject({ raschComponents: 2, raschUnlinked: 24, raschConverged: 1 });
    for (const row of results) {
      expect(row).toMatchObject({ difficulty: null, se: null, state: 'physician_estimate' });
    }
  });

  it('un grupo conectado de 20 preguntas o más se enlaza y el grupo suelto no publica nada', () => {
    const { items, attempts } = merge(
      island('m', { items: 30, students: 40, center: 0 }),
      island('s', { items: 8, students: 40, center: 1.5 }),
    );
    const { items: results, counts } = run(attempts, items);
    expect(counts).toMatchObject({ raschComponents: 2, raschUnlinked: 8 });
    const main = results.filter((row) => row.versionId.startsWith('v-m'));
    const stray = results.filter((row) => row.versionId.startsWith('v-s'));
    expect(main).toHaveLength(30);
    expect(main.every((row) => row.difficulty !== null && row.state !== 'physician_estimate')).toBe(
      true,
    );
    // El grupo principal se enlaza con la escala del médico, como un diseño conectado
    const logits = items
      .filter((item) => item.versionId.startsWith('v-m'))
      .map((item) => physicianToLogit(item.physician));
    expect(Math.abs(mean(main.map((row) => row.difficulty as number)) - mean(logits))).toBeLessThan(
      0.002,
    );
    expect(stray.every((row) => row.difficulty === null && row.se === null)).toBe(true);
    expect(stray.every((row) => row.state === 'physician_estimate')).toBe(true);
  });

  it('dos grupos grandes sin anclas no se publican porque no se pueden poner uno respecto del otro', () => {
    const { items, attempts } = merge(
      island('a', { items: 25, students: 40, center: -1 }),
      island('b', { items: 25, students: 40, center: 1 }),
    );
    const { items: results, counts } = run(attempts, items);
    expect(counts).toMatchObject({ raschComponents: 2, raschUnlinked: 50, anchors: 0 });
    expect(results.every((row) => row.difficulty === null)).toBe(true);
  });

  it('dos grupos grandes con sus propias anclas se enlazan cada uno por su cuenta', () => {
    // Los dos traen la calibración de ayer, uno 0.7 arriba y otro 0.3 abajo de lo de hoy
    const { items, attempts } = merge(
      island('a', { items: 25, students: 40, center: -1, previousShift: 0.7 }),
      island('b', { items: 25, students: 40, center: 1, previousShift: -0.3 }),
    );
    const { items: results, counts } = run(attempts, items);
    expect(counts).toMatchObject({ raschComponents: 2, raschUnlinked: 0 });
    expect(counts.anchors).toBeGreaterThanOrEqual(2 * MIN_ANCHORS);
    for (const key of ['a', 'b']) {
      // La media de las anclas de cada grupo, las que ya eran al menos provisionales hoy, coincide con la de ayer
      const anchors = results.filter(
        (row) => row.versionId.startsWith(`v-${key}`) && row.state !== 'physician_estimate',
      );
      const previous = anchors.map(
        (row) => items.find((item) => item.versionId === row.versionId)?.previous?.difficulty,
      );
      expect(anchors.length).toBeGreaterThanOrEqual(MIN_ANCHORS);
      expect(
        Math.abs(mean(anchors.map((row) => row.difficulty as number)) - mean(previous as number[])),
      ).toBeLessThan(0.003);
    }
  });

  it('un diseño conectado queda igual que antes, con un solo grupo', () => {
    const { items, attempts } = island('c', { items: 30, students: 60, center: 0 });
    const { counts } = run(attempts, items);
    expect(counts).toMatchObject({ raschComponents: 1, raschUnlinked: 0, raschConverged: 1 });
  });

  it('si Rasch no convergió no publica ninguna dificultad', () => {
    const { items, attempts } = island('n', { items: 30, students: 60, center: 0 });
    const bank = new Map(items.map((item) => [item.versionId, item]));
    const result = calibrateItems({
      attempts,
      bank,
      thresholds: FACTORY_THRESHOLDS,
      settings: FACTORY_MODEL_SETTINGS,
      rasch: { maxIterations: 2 },
    });
    expect(result.counts.raschConverged).toBe(0);
    for (const row of result.items) {
      expect(row).toMatchObject({ difficulty: null, se: null, state: 'physician_estimate' });
      // Elo no depende de Rasch y sigue
      expect(row.elo).not.toBeNull();
    }
  });
});

describe('Elo', () => {
  it('parte de la dificultad del médico y se mueve con la primera respuesta', () => {
    const item = bankItem('elo1', { physician: 5 });
    const { items } = run([attempt('a', item, true, 1)], [item]);
    // p = 1 / (1 + e^2) = 0.1192 y el factor K inicial es 0.4, así que 2 - 0.4 * 0.8808
    expect(items[0]).toMatchObject({ elo: 1.648, eloResponses: 1 });
  });

  it('una dificultad del médico fuera de 1 a 5 se toma como 3 y no lanza', () => {
    const item = bankItem('elo2', { physician: 9 });
    const { items } = run([attempt('a', item, true, 1)], [item]);
    // p = 0.5 y 0 - 0.4 * 0.5
    expect(items[0]?.elo).toBe(-0.2);
  });

  it('se reproduce en el orden del tiempo y no en el de llegada', () => {
    const item = bankItem('elo3', { physician: 3 });
    const forward = run([attempt('a', item, true, 1, 5), attempt('b', item, false, 2, 1)], [item]);
    const swapped = run([attempt('a', item, true, 9, 5), attempt('b', item, false, 3, 1)], [item]);
    // En la segunda, el seq de a es mayor, pero su día queda más lejos y se reproduce primero
    expect(swapped.items[0]?.elo).toBe(forward.items[0]?.elo);
  });
});
