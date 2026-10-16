import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { groupCaseUnits, pickCaseUnits, type CaseMember } from './caseUnits';

/** Casos con las preguntas que se pidan. Un 1 es una pregunta suelta, sin caso */
function bank(sizes: readonly number[]): CaseMember[] {
  return sizes.flatMap((size, caseIndex) =>
    Array.from({ length: size }, (_, order) => ({
      id: `q-${caseIndex}-${order + 1}`,
      caseId: size === 1 ? null : `caso-${caseIndex}`,
      caseOrder: size === 1 ? null : order + 1,
    })),
  );
}

const ids = (list: readonly CaseMember[]) => list.map((question) => question.id);

describe('casos completos', () => {
  it('junta las preguntas por caso y las ordena por su lugar en el caso, sin importar cómo lleguen', () => {
    const questions = bank([3, 1, 2]);
    const shuffled = [...questions].reverse();
    const units = groupCaseUnits(shuffled);
    expect(units.map(ids)).toEqual(groupCaseUnits(questions).map(ids));
    expect(units.map((unit) => unit.length).toSorted()).toEqual([1, 2, 3]);
    for (const unit of units) {
      const orders = unit.map((question) => question.caseOrder ?? 0);
      expect(orders).toEqual(orders.toSorted((a, b) => a - b));
    }
  });

  it('elige los casos pedidos con todas sus preguntas y en orden', () => {
    const questions = bank([3, 2, 3, 2, 3]);
    const result = pickCaseUnits(questions, 'semilla', 3);
    expect(result.units).toBe(3);
    expect(result.available).toBe(5);
    // Cada caso entra completo y sus preguntas van seguidas y en orden
    let cursor = 0;
    while (cursor < result.picked.length) {
      const head = result.picked[cursor] as CaseMember;
      const caseSize = questions.filter((question) => question.caseId === head.caseId).length;
      const unit = result.picked.slice(cursor, cursor + caseSize);
      expect(unit.map((question) => question.caseOrder)).toEqual(
        Array.from({ length: caseSize }, (_, index) => index + 1),
      );
      expect(new Set(unit.map((question) => question.caseId)).size).toBe(1);
      cursor += caseSize;
    }
  });

  it('una pregunta suelta cuenta como un caso de una', () => {
    const result = pickCaseUnits(bank([1, 1, 1]), 'sueltas', 2);
    expect(result.picked).toHaveLength(2);
    expect(result.units).toBe(2);
    expect(result.available).toBe(3);
  });

  it('si piden más casos de los que hay toma todos y lo dice', () => {
    const result = pickCaseUnits(bank([2, 3]), 'todos', 10);
    expect(result.picked).toHaveLength(5);
    expect(result.units).toBe(2);
    expect(result.available).toBe(2);
  });

  it('pedir cero, menos de cero o un número que no es número no elige nada', () => {
    for (const cases of [0, -3, Number.NaN, Number.POSITIVE_INFINITY * 0]) {
      expect(pickCaseUnits(bank([2, 3]), 'nada', cases).picked).toEqual([]);
    }
    expect(pickCaseUnits([], 'vacío', 3)).toEqual({ picked: [], units: 0, available: 0 });
  });

  it('con un tope de preguntas salta el caso que no cabe y sigue con el siguiente', () => {
    // Solo caben 4 preguntas. Los casos de 3 no caben juntos, pero uno de 3 más la suelta sí
    const questions = bank([3, 3, 1]);
    const result = pickCaseUnits(questions, 'tope', 3, { maxItems: 4 });
    expect(result.picked.length).toBeLessThanOrEqual(4);
    expect(result.picked).toHaveLength(4);
    expect(result.units).toBe(2);
    // Si ninguno cabe no sale nada, y lo que había se sigue contando
    const none = pickCaseUnits(bank([3, 3]), 'tope', 2, { maxItems: 2 });
    expect(none.picked).toEqual([]);
    expect(none.available).toBe(2);
    expect(pickCaseUnits(bank([3, 3]), 'tope', 2, { maxItems: 0 }).picked).toEqual([]);
  });

  it('el mismo resultado con la misma semilla, aunque cambie el orden de entrada', () => {
    const questions = bank([2, 3, 2, 3, 2, 3]);
    const first = pickCaseUnits(questions, 'misma', 3);
    expect(pickCaseUnits(questions, 'misma', 3)).toEqual(first);
    expect(pickCaseUnits([...questions].reverse(), 'misma', 3)).toEqual(first);
    const others = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((seed) =>
        ids(pickCaseUnits(questions, seed, 3).picked).join(),
      ),
    );
    expect(others.size).toBeGreaterThan(1);
  });

  it('propiedad. Nunca repite, nunca parte un caso y nunca pasa del tope ni de lo pedido', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 0, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.integer({ min: 0, max: 25 }),
        fc.option(fc.integer({ min: 0, max: 30 }), { nil: undefined }),
        (sizes, seed, cases, maxItems) => {
          const questions = bank(sizes);
          const result = pickCaseUnits(questions, seed, cases, { maxItems });
          expect(new Set(ids(result.picked)).size).toBe(result.picked.length);
          expect(result.available).toBe(sizes.length);
          expect(result.units).toBeLessThanOrEqual(Math.min(cases, sizes.length));
          if (maxItems !== undefined) expect(result.picked.length).toBeLessThanOrEqual(maxItems);
          // Lo que no tiene tope y cabe en lo pedido sale completo
          if (maxItems === undefined) expect(result.units).toBe(Math.min(cases, sizes.length));
          // Cada caso que salió trae todas sus preguntas
          const byCase = new Map<string, number>();
          for (const question of result.picked) {
            const key = question.caseId ?? question.id;
            byCase.set(key, (byCase.get(key) ?? 0) + 1);
          }
          for (const [key, count] of byCase) {
            const total = questions.filter((question) => (question.caseId ?? question.id) === key);
            expect(count).toBe(total.length);
          }
          expect(byCase.size).toBe(result.units);
        },
      ),
    );
  });
});
