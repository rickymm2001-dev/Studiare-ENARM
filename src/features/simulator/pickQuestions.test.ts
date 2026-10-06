import { describe, expect, it } from 'vitest';
import { pickQuestions } from './pickQuestions';

interface Item {
  id: string;
  caseId: string | null;
  caseOrder: number | null;
}
const single = (id: string): Item => ({ id, caseId: null, caseOrder: null });
const serial = (id: string, caseId: string, caseOrder: number): Item => ({
  id,
  caseId,
  caseOrder,
});
const bank = Array.from({ length: 30 }, (_, index) => single(`q${index}`));
const ids = (items: readonly Item[]) => items.map((item) => item.id);

describe('elegir preguntas con semilla', () => {
  it('la misma semilla da la misma lista y otra semilla da otra', () => {
    const first = ids(pickQuestions(bank, 'duelo|a', 10));
    expect(ids(pickQuestions(bank, 'duelo|a', 10))).toEqual(first);
    expect(ids(pickQuestions(bank, 'duelo|b', 10))).not.toEqual(first);
  });

  it('respeta la cantidad y no repite preguntas', () => {
    const picked = ids(pickQuestions(bank, 'x', 20));
    expect(picked).toHaveLength(20);
    expect(new Set(picked).size).toBe(20);
  });

  it('con menos preguntas que las pedidas entrega las que hay, y con cero ninguna', () => {
    expect(pickQuestions(bank.slice(0, 5), 'x', 20)).toHaveLength(5);
    expect(pickQuestions(bank, 'x', 0)).toEqual([]);
    expect(pickQuestions([], 'x', 10)).toEqual([]);
  });

  it('un caso seriado queda junto y en su orden donde salió la primera pregunta', () => {
    const items = [
      ...bank.slice(0, 6),
      serial('c3', 'caso', 3),
      serial('c1', 'caso', 1),
      serial('c2', 'caso', 2),
    ];
    const picked = ids(pickQuestions(items, 'seriado', items.length));
    const first = picked.indexOf('c1');
    expect(picked.slice(first, first + 3)).toEqual(['c1', 'c2', 'c3']);
    expect(picked).toHaveLength(items.length);
  });
});
