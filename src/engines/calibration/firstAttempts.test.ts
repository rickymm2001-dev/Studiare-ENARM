// Primeros intentos válidos y defensa contra datos falsos (B14, 3.4 y 3.10 del plan de B14)
import { describe, expect, it } from 'vitest';
import { FACTORY_THRESHOLDS } from '@/config/thresholds';
import { answer, bankItem, exposure } from '../../../tests/calibration/builders';
import { chronological, indexExposures, lastBefore, selectFirstAttempts } from './firstAttempts';
import type { AnswerRow, BankItemRow, ExposureRow } from './types';

const bank = (...items: BankItemRow[]) => new Map(items.map((item) => [item.versionId, item]));

function select(
  answers: AnswerRow[],
  items: BankItemRow[],
  exposures: ExposureRow[] = [],
  maxDailyFirstAttempts = 400,
) {
  return selectFirstAttempts({
    answers,
    bank: bank(...items),
    exposures,
    thresholds: FACTORY_THRESHOLDS,
    maxDailyFirstAttempts,
  });
}

describe('primer intento de cada alumno en cada pregunta estable', () => {
  const q1 = bankItem('q1');
  const q2 = bankItem('q2');

  it('solo cuenta la primera respuesta de cada alumno a cada pregunta', () => {
    const { attempts, counts } = select(
      [
        answer({ person: 'a', key: 'q1', seq: 10, letter: 'B' }),
        answer({ person: 'a', key: 'q1', seq: 20, letter: 'A' }),
        answer({ person: 'a', key: 'q2', seq: 30, letter: 'A' }),
        answer({ person: 'b', key: 'q1', seq: 40, letter: 'A' }),
      ],
      [q1, q2],
    );
    expect(
      attempts.map((attempt) => [attempt.person, attempt.questionId, attempt.correct]),
    ).toEqual([
      ['a', 'q-q1', false],
      ['a', 'q-q2', true],
      ['b', 'q-q1', true],
    ]);
    expect(counts).toMatchObject({ answers: 4, repeatAttempts: 1, firstAttempts: 3 });
  });

  it('si vio la v1 y después la v2, cuenta la primera respuesta y para la versión que contestó', () => {
    const v2 = bankItem('q1b', { questionId: 'q-q1' });
    const { attempts, counts } = select(
      [
        answer({ person: 'a', key: 'q1', seq: 10, letter: 'B' }),
        answer({ person: 'a', key: 'q1', versionKey: 'q1b', seq: 20, letter: 'A' }),
      ],
      [q1, v2],
    );
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ versionId: 'v-q1', correct: false });
    expect(counts.repeatAttempts).toBe(1);
  });

  it('si la v2 se contestó primero, esa es la que cuenta', () => {
    const v2 = bankItem('q1b', { questionId: 'q-q1' });
    const { attempts } = select(
      [
        answer({ person: 'a', key: 'q1', versionKey: 'q1b', seq: 5 }),
        answer({ person: 'a', key: 'q1', seq: 6 }),
      ],
      [q1, v2],
    );
    expect(attempts.map((attempt) => attempt.versionId)).toEqual(['v-q1b']);
  });

  it('el orden es el del tiempo, el día más lejano primero aunque su seq sea mayor', () => {
    const { attempts } = select(
      [
        // Subió después, pero se contestó 5 días antes que la otra
        answer({ person: 'a', key: 'q1', seq: 90, daysBefore: 5, letter: 'B' }),
        answer({ person: 'a', key: 'q1', seq: 10, daysBefore: 1, letter: 'A' }),
      ],
      [q1],
    );
    expect(attempts[0]).toMatchObject({ seq: 90, correct: false });
    const rows = [
      answer({ person: 'a', key: 'q1', seq: 2, daysBefore: 3 }),
      answer({ person: 'a', key: 'q1', seq: 1, daysBefore: 3 }),
      answer({ person: 'a', key: 'q1', seq: 3, daysBefore: 9 }),
    ];
    expect([...rows].sort(chronological).map((row) => row.seq)).toEqual([3, 1, 2]);
  });

  it('una versión que no está en el banco se deja fuera y se cuenta', () => {
    const { attempts, counts } = select(
      [answer({ person: 'a', key: 'q1', seq: 1 }), answer({ person: 'a', key: 'zz', seq: 2 })],
      [q1],
    );
    expect(attempts).toHaveLength(1);
    expect(counts.unknownVersion).toBe(1);
  });
});

describe('tope de primeros intentos por alumno y día', () => {
  const items = Array.from({ length: 6 }, (_, index) => bankItem(`t${index}`));
  const rows = (person: string, daysBefore: number, count: number, seq0: number) =>
    items
      .slice(0, count)
      .map((item, index) =>
        answer({ person, key: item.versionId.slice(2), seq: seq0 + index, daysBefore }),
      );

  it('un día arriba del tope no cuenta y uno justo en el tope sí', () => {
    const { attempts, counts } = select(
      [...rows('a', 3, 5, 100), ...rows('b', 3, 4, 200), ...rows('a', 2, 4, 300)],
      items,
      [],
      4,
    );
    // a el día 3 llegó a 5, arriba del tope de 4. b el día 3 y a el día 2 llegaron a 4
    expect(attempts.filter((attempt) => attempt.person === 'a').map((a) => a.daysBefore)).toEqual(
      [],
    );
    expect(counts).toMatchObject({ cappedDays: 1, cappedAttempts: 5 });
    // Las 4 de a el día 2 son repetidas de las que ya contestó el día 3 y salen como repetidas
    expect(counts.repeatAttempts).toBe(4);
    expect(attempts.filter((attempt) => attempt.person === 'b')).toHaveLength(4);
  });

  it('el tope cuenta solo primeros intentos, no repeticiones', () => {
    const repeats = Array.from({ length: 10 }, (_, index) =>
      answer({ person: 'a', key: 't0', seq: 10 + index }),
    );
    const { attempts, counts } = select(repeats, items, [], 2);
    expect(attempts).toHaveLength(1);
    expect(counts).toMatchObject({ cappedDays: 0, repeatAttempts: 9 });
  });
});

describe('respuestas más rápidas que la lectura plausible', () => {
  const item = bankItem('r1', { words: 60 });

  it('quita las que bajan de 6 palabras por segundo y deja la que está justo en el borde', () => {
    // 60 palabras del enunciado y 4 opciones de 8 palabras: 92 palabras, 15.33 s a 6 por segundo
    const exposures = [exposure('a', 'r1', 1), exposure('b', 'r1', 3), exposure('c', 'r1', 5)];
    const { attempts, counts } = select(
      [
        answer({ person: 'a', key: 'r1', seq: 2, ms: 15_000 }),
        answer({ person: 'b', key: 'r1', seq: 4, ms: 15_334 }),
        answer({ person: 'c', key: 'r1', seq: 6, ms: 60_000 }),
      ],
      [item],
      exposures,
    );
    expect(attempts.map((attempt) => attempt.person)).toEqual(['b', 'c']);
    expect(counts.rapidExcluded).toBe(1);
  });

  it('sin la pantalla de opciones usa solo las palabras del enunciado', () => {
    const { attempts, counts } = select(
      [
        // 60 palabras son 10 s
        answer({ person: 'a', key: 'r1', seq: 2, ms: 9_900 }),
        answer({ person: 'b', key: 'r1', seq: 4, ms: 10_100 }),
        answer({ person: 'c', key: 'r1', seq: 6, ms: null }),
      ],
      [item],
    );
    expect(attempts.map((attempt) => attempt.person)).toEqual(['b', 'c']);
    expect(counts.rapidExcluded).toBe(1);
  });

  it('una respuesta rápida es un primer intento que no cuenta y la siguiente ya es repetida', () => {
    const { attempts, counts } = select(
      [
        answer({ person: 'a', key: 'r1', seq: 2, ms: 1_000 }),
        answer({ person: 'a', key: 'r1', seq: 4, ms: 60_000 }),
      ],
      [item],
    );
    expect(attempts).toHaveLength(0);
    expect(counts).toMatchObject({ rapidExcluded: 1, repeatAttempts: 1 });
  });
});

describe('la pantalla de opciones del primer intento', () => {
  const item = bankItem('e1');

  it('es la última question_shown de ese alumno y esa versión antes de la respuesta', () => {
    const { attempts, counts } = select(
      [answer({ person: 'a', key: 'e1', seq: 50, letter: 'C' })],
      [item],
      [
        exposure('a', 'e1', 10, ['A', 'B', 'D']),
        exposure('a', 'e1', 40, ['A', 'C', 'D']),
        exposure('a', 'e1', 60, ['A', 'B', 'C']),
        exposure('b', 'e1', 45, ['A', 'B']),
      ],
    );
    expect(attempts[0]?.exposed).toEqual(['o-e1-A', 'o-e1-C', 'o-e1-D']);
    expect(counts.noExposure).toBe(0);
  });

  it('sin pantalla, o con una donde no estaba la opción elegida, el intento sirve pero sin opciones', () => {
    const { attempts, counts } = select(
      [
        answer({ person: 'a', key: 'e1', seq: 50 }),
        answer({ person: 'b', key: 'e1', seq: 52, letter: 'D' }),
      ],
      [item],
      [exposure('b', 'e1', 51, ['A', 'B', 'C'])],
    );
    expect(attempts).toHaveLength(2);
    expect(attempts.map((attempt) => attempt.exposed)).toEqual([null, null]);
    expect(counts).toMatchObject({ noExposure: 1, inconsistentExposure: 1 });
  });

  it('lastBefore e indexExposures trabajan con listas ordenadas por seq', () => {
    const index = indexExposures([
      exposure('a', 'e1', 30),
      exposure('a', 'e1', 10),
      exposure('b', 'e1', 20),
    ]);
    expect(index.get('a|v-e1')?.map((row) => row.seq)).toEqual([10, 30]);
    expect(lastBefore(index.get('a|v-e1'), 10)).toBeNull();
    expect(lastBefore(index.get('a|v-e1'), 11)?.seq).toBe(10);
    expect(lastBefore(index.get('a|v-e1'), 99)?.seq).toBe(30);
    expect(lastBefore(undefined, 5)).toBeNull();
  });
});
