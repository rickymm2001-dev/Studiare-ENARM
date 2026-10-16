// Motor de comparación (B14, 5 del plan). Cortes contra valores calculados a mano, percentil con
// empates, la ventana de 30 días y los mínimos de respuestas
import { describe, expect, it } from 'vitest';
import {
  COMPARISON_METRICS,
  CUT_PERCENTILES,
  MAX_REVIEWS_PER_DAY,
  distributionCuts,
  percentileFromCuts,
  studentMetrics,
  type ComparisonFact,
} from './comparison';
import { addDays } from './studyDay';

const AS_OF = '2026-10-15';
const options = { asOfDay: AS_OF, windowDays: 30, minBranchAnswers: 20 };

const answer = (
  day: string,
  branch: string,
  correct: boolean,
  sessionKind: ComparisonFact['sessionKind'] = 'practice',
  count?: number,
): ComparisonFact => ({
  day,
  kind: 'answer',
  branch,
  correct,
  sessionKind,
  ...(count === undefined ? {} : { count }),
});
const review = (day: string, count?: number): ComparisonFact => ({
  day,
  kind: 'review',
  ...(count === undefined ? {} : { count }),
});

/** n respuestas de una rama el mismo día, con k aciertos */
function answers(day: string, branch: string, n: number, k: number): ComparisonFact[] {
  return Array.from({ length: n }, (_, index) => answer(day, branch, index < k));
}

describe('constantes', () => {
  it('son tres métricas y 19 percentiles de 5 en 5 sin el mínimo ni el máximo', () => {
    expect(COMPARISON_METRICS).toEqual(['sim_accuracy', 'reviews', 'consistency']);
    expect(CUT_PERCENTILES).toHaveLength(19);
    expect(CUT_PERCENTILES[0]).toBe(5);
    expect(CUT_PERCENTILES[18]).toBe(95);
  });
});

describe('studentMetrics, la ventana', () => {
  it('cuenta los 30 días completos anteriores al corte y deja fuera el día del corte', () => {
    const facts = [
      review(AS_OF, 50),
      review(addDays(AS_OF, -1), 1),
      review(addDays(AS_OF, -30), 2),
      review(addDays(AS_OF, -31), 100),
    ];
    const metrics = studentMetrics(facts, options);
    expect(metrics.reviews['*']).toBe(3);
    expect(metrics.consistency['*']).toBe(2);
  });

  it('una ventana de 7 días cambia lo que entra', () => {
    const facts = [review(addDays(AS_OF, -7), 4), review(addDays(AS_OF, -8), 9)];
    const metrics = studentMetrics(facts, { ...options, windowDays: 7 });
    expect(metrics.reviews['*']).toBe(4);
    expect(metrics.consistency['*']).toBe(1);
  });

  it('el orden de los hechos no cambia nada', () => {
    const facts = [
      ...answers('2026-10-10', 'pediatrics', 25, 18),
      review('2026-10-11', 30),
      review('2026-10-09', 12),
    ];
    expect(studentMetrics([...facts].reverse(), options)).toEqual(studentMetrics(facts, options));
  });
});

describe('studentMetrics, aciertos en simuladores', () => {
  it('redondea a 0.01 por rama y en total, con el mínimo de 20 respuestas por rama', () => {
    const facts = [
      ...answers('2026-10-10', 'pediatrics', 25, 18),
      ...answers('2026-10-11', 'general_surgery', 19, 19),
      ...answers('2026-10-12', 'internal_medicine', 20, 7),
    ];
    const metrics = studentMetrics(facts, options);
    expect(metrics.sim_accuracy.pediatrics).toBe(0.72);
    // 19 respuestas no llegan al mínimo, la rama calibra
    expect(metrics.sim_accuracy.general_surgery).toBeNull();
    expect(metrics.sim_accuracy.internal_medicine).toBe(0.35);
    // 18 + 19 + 7 = 44 aciertos de 25 + 19 + 20 = 64 respuestas
    expect(metrics.sim_accuracy['*']).toBe(0.69);
  });

  it('en total también pide el mínimo de respuestas', () => {
    const metrics = studentMetrics(answers('2026-10-10', 'pediatrics', 19, 10), options);
    expect(metrics.sim_accuracy['*']).toBeNull();
    expect(metrics.sim_accuracy.pediatrics).toBeNull();
  });

  it('solo cuentan la práctica y el examen. Los retos y las sesiones sin tipo no', () => {
    const facts = [
      ...answers('2026-10-10', 'pediatrics', 20, 10),
      ...Array.from({ length: 30 }, () => answer('2026-10-10', 'pediatrics', true, 'challenge')),
      ...Array.from({ length: 30 }, () => answer('2026-10-10', 'pediatrics', true, null)),
      ...Array.from({ length: 5 }, () => answer('2026-10-10', 'pediatrics', false, 'exam')),
    ];
    const metrics = studentMetrics(facts, options);
    // 10 de 25 entre práctica y examen
    expect(metrics.sim_accuracy.pediatrics).toBe(0.4);
  });

  it('una respuesta sin rama cuenta en el total y no en una rama', () => {
    const facts: ComparisonFact[] = Array.from({ length: 20 }, () => ({
      day: '2026-10-10',
      kind: 'answer' as const,
      correct: true,
      sessionKind: 'exam' as const,
    }));
    const metrics = studentMetrics(facts, options);
    expect(metrics.sim_accuracy['*']).toBe(1);
    expect(Object.keys(metrics.sim_accuracy)).toEqual(['*']);
  });

  it('una respuesta sin saber si fue correcta no cuenta', () => {
    const facts: ComparisonFact[] = Array.from({ length: 30 }, () => ({
      day: '2026-10-10',
      kind: 'answer' as const,
      branch: 'pediatrics',
      sessionKind: 'practice' as const,
    }));
    expect(studentMetrics(facts, options).sim_accuracy['*']).toBeNull();
  });

  it('count suma varias respuestas iguales y uno inválido no suma nada', () => {
    const facts = [
      answer('2026-10-10', 'pediatrics', true, 'practice', 15),
      answer('2026-10-10', 'pediatrics', false, 'practice', 5),
      answer('2026-10-10', 'pediatrics', false, 'practice', 0),
      answer('2026-10-10', 'pediatrics', false, 'practice', -4),
      answer('2026-10-10', 'pediatrics', false, 'practice', Number.NaN),
    ];
    const metrics = studentMetrics(facts, options);
    expect(metrics.sim_accuracy.pediatrics).toBe(0.75);
  });
});

describe('studentMetrics, repasos y constancia', () => {
  it('suma los repasos de la ventana y cuenta los días distintos con actividad', () => {
    const facts = [
      review('2026-10-10', 40),
      review('2026-10-10', 10),
      review('2026-10-11', 5),
      answer('2026-10-12', 'pediatrics', true, 'challenge'),
      answer('2026-10-12', 'pediatrics', false, null),
    ];
    const metrics = studentMetrics(facts, options);
    expect(metrics.reviews['*']).toBe(55);
    // 10, 11 y 12 de octubre
    expect(metrics.consistency['*']).toBe(3);
  });

  it('quien no tuvo ni un día con actividad no entra a repasos ni a constancia', () => {
    const metrics = studentMetrics([review(AS_OF, 99), review('2026-08-01', 99)], options);
    expect(metrics.reviews['*']).toBeNull();
    expect(metrics.consistency['*']).toBeNull();
    expect(metrics.sim_accuracy['*']).toBeNull();
  });

  it('quien solo contestó preguntas tiene cero repasos, no sin datos', () => {
    const metrics = studentMetrics(answers('2026-10-10', 'pediatrics', 3, 1), options);
    expect(metrics.reviews['*']).toBe(0);
    expect(metrics.consistency['*']).toBe(1);
  });

  it('los repasos de un día se recortan a lo posible', () => {
    const metrics = studentMetrics([review('2026-10-10', 1_000_000)], options);
    expect(metrics.reviews['*']).toBe(MAX_REVIEWS_PER_DAY);
  });

  it('la constancia nunca pasa de la ventana', () => {
    const facts = Array.from({ length: 30 }, (_, index) => review(addDays(AS_OF, -(index + 1))));
    expect(studentMetrics(facts, options).consistency['*']).toBe(30);
  });
});

describe('distributionCuts', () => {
  it('de 0 a 100 los cortes son los propios percentiles', () => {
    const values = Array.from({ length: 101 }, (_, index) => index);
    expect(distributionCuts(values, 'reviews')).toEqual(CUT_PERCENTILES);
  });

  it('el acierto se redondea a 0.01', () => {
    const values = Array.from({ length: 101 }, (_, index) => index / 100);
    expect(distributionCuts(values, 'sim_accuracy')).toEqual(
      CUT_PERCENTILES.map((percentile) => percentile / 100),
    );
  });

  it('interpola entre valores y redondea según la métrica, a mano con 10 y 20', () => {
    // Posición = p / 100 entre 10 y 20, así p5 da 10.5, p50 da 15 y p95 da 19.5
    const reviews = distributionCuts([20, 10], 'reviews');
    const consistency = distributionCuts([10, 20], 'consistency');
    expect(consistency[0]).toBe(10.5);
    expect(consistency[9]).toBe(15);
    expect(consistency[18]).toBe(19.5);
    // Sin decimales, 10.5 sube a 11 y 19.5 sube a 20
    expect(reviews[0]).toBe(11);
    expect(reviews[9]).toBe(15);
    expect(reviews[18]).toBe(20);
  });

  it('con un solo valor todos los cortes valen lo mismo', () => {
    expect(distributionCuts([0.5], 'sim_accuracy')).toEqual(Array<number>(19).fill(0.5));
  });

  it('con valores repetidos los cortes se repiten', () => {
    const values = [...Array<number>(60).fill(3), ...Array<number>(40).fill(9)];
    const cuts = distributionCuts(values, 'consistency');
    expect(cuts.slice(0, 11)).toEqual(Array<number>(11).fill(3));
    expect(cuts.slice(12)).toEqual(Array<number>(7).fill(9));
  });

  it('ignora lo que no es un número y falla sin nada que cortar', () => {
    expect(distributionCuts([Number.NaN, 1, Number.POSITIVE_INFINITY], 'reviews')).toEqual(
      Array<number>(19).fill(1),
    );
    expect(() => distributionCuts([], 'reviews')).toThrow(RangeError);
    expect(() => distributionCuts([Number.NaN], 'reviews')).toThrow(RangeError);
  });

  it('no publica el mínimo ni el máximo', () => {
    const values = Array.from({ length: 200 }, (_, index) => index);
    const cuts = distributionCuts(values, 'reviews');
    expect(Math.min(...cuts)).toBeGreaterThan(0);
    expect(Math.max(...cuts)).toBeLessThan(199);
  });
});

describe('percentileFromCuts', () => {
  const cuts = Array.from({ length: 19 }, (_, index) => index + 1);

  it('abajo del primer corte es menos del 5 y arriba del último es más del 95', () => {
    expect(percentileFromCuts(0.5, cuts)).toEqual({ band: 0, below5: true, above95: false });
    expect(percentileFromCuts(19.5, cuts)).toEqual({ band: 100, below5: false, above95: true });
  });

  it('sobre un corte da su percentil y entre dos da el del corte de abajo', () => {
    expect(percentileFromCuts(1, cuts).band).toBe(5);
    expect(percentileFromCuts(10, cuts).band).toBe(50);
    expect(percentileFromCuts(19, cuts)).toEqual({ band: 95, below5: false, above95: false });
    expect(percentileFromCuts(1.5, cuts).band).toBe(5);
    expect(percentileFromCuts(10.99, cuts).band).toBe(50);
  });

  it('con cortes empatados da el rango medio de los empatados', () => {
    // Todos iguales, del 5 al 95, el medio es 50
    expect(percentileFromCuts(0.5, Array<number>(19).fill(0.5)).band).toBe(50);
    // Tres cortes iguales al principio, percentiles 5, 10 y 15, el medio es 10
    const tied = [0.2, 0.2, 0.2, ...Array.from({ length: 16 }, (_, index) => 0.3 + index / 100)];
    expect(percentileFromCuts(0.2, tied).band).toBe(10);
    // Dos empatados en 50 y 55, el medio 52.5 se entrega de 5 en 5
    const middle = [...cuts.slice(0, 9), 10, 10, ...cuts.slice(11)];
    expect(percentileFromCuts(10, middle).band).toBe(55);
  });

  it('el valor igual al último corte no es más del 95', () => {
    expect(percentileFromCuts(19, Array<number>(19).fill(19)).above95).toBe(false);
  });

  it('exige 19 cortes y un valor numérico', () => {
    expect(() => percentileFromCuts(1, cuts.slice(0, 18))).toThrow(RangeError);
    expect(() => percentileFromCuts(1, [...cuts, 20])).toThrow(RangeError);
    expect(() => percentileFromCuts(Number.NaN, cuts)).toThrow(RangeError);
  });
});

describe('del alumno a su percentil', () => {
  it('un alumno con 18 de 25 en Pediatría queda donde dice la tabla de cortes', () => {
    // Un grupo de 101 alumnos con aciertos de 0.00 a 1.00, el 0.72 es el percentil 72, o sea 70 de 5 en 5
    const cuts = distributionCuts(
      Array.from({ length: 101 }, (_, index) => index / 100),
      'sim_accuracy',
    );
    const metrics = studentMetrics(answers('2026-10-10', 'pediatrics', 25, 18), options);
    const value = metrics.sim_accuracy.pediatrics as number;
    expect(value).toBe(0.72);
    expect(percentileFromCuts(value, cuts).band).toBe(70);
  });
});
