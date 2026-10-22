import { describe, expect, it } from 'vitest';
import { clockOf, MAX_RECALL_CARDS, recallCardDrafts, recallLines } from './recall';
import type { OutlineNode } from './outlineLimits';

const node = (id: string, text: string, children: OutlineNode[] = []): OutlineNode => ({
  id,
  text,
  children,
});

const tree: OutlineNode[] = [
  node('a', 'Choque séptico', [
    node('b', 'Antibióticos en la primera hora'),
    node('c', 'Lactato :: Mayor de 2 mmol/L'),
    node('d', ''),
  ]),
  node('e', 'Líquidos #urgencias'),
];

describe('recallLines', () => {
  it('lista las líneas con texto, su nivel y de qué cuelgan, sin las etiquetas', () => {
    const lines = recallLines('Sepsis', tree);
    expect(lines.map((l) => [l.id, l.depth, l.context])).toEqual([
      ['a', 0, 'Sepsis'],
      ['b', 1, 'Choque séptico'],
      ['c', 1, 'Choque séptico'],
      ['e', 0, 'Sepsis'],
    ]);
    expect(lines.find((l) => l.id === 'e')?.text).toBe('Líquidos');
    expect(lines.find((l) => l.id === 'c')?.hasCard).toBe(true);
    expect(lines.find((l) => l.id === 'b')?.hasCard).toBe(false);
  });

  it('un apunte vacío no da líneas', () => {
    expect(recallLines('Nada', [])).toEqual([]);
  });
});

describe('recallCardDrafts', () => {
  const lines = recallLines('Sepsis', tree);

  it('arma una tarjeta básica con el contexto al frente y la línea al reverso', () => {
    const { drafts, skipped } = recallCardDrafts(lines, new Set(['b', 'e']));
    expect(drafts).toEqual([
      { id: 'b', front: 'Choque séptico', back: 'Antibióticos en la primera hora' },
      { id: 'e', front: 'Sepsis', back: 'Líquidos' },
    ]);
    expect(skipped).toBe(0);
  });

  it('una línea que se marca con tarjeta ya creada no se vuelve a crear', () => {
    // La pantalla marca como hasCard cada línea que guarda, así reintentar no duplica
    const created = lines.map((line) => (line.id === 'b' ? { ...line, hasCard: true } : line));
    const { drafts, skipped } = recallCardDrafts(created, new Set(['b', 'e']));
    expect(drafts.map((draft) => draft.id)).toEqual(['e']);
    expect(skipped).toBe(1);
  });

  it('una línea que ya tiene tarjeta no se repite y se cuenta aparte', () => {
    const { drafts, skipped } = recallCardDrafts(lines, new Set(['b', 'c']));
    expect(drafts).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('sin marcadas no hay tarjetas y las marcadas que no existen se ignoran', () => {
    expect(recallCardDrafts(lines, new Set())).toEqual({ drafts: [], skipped: 0 });
    expect(recallCardDrafts(lines, new Set(['zzz']))).toEqual({ drafts: [], skipped: 0 });
  });

  it('se corta en el tope de tarjetas por sprint', () => {
    const many = Array.from({ length: MAX_RECALL_CARDS + 10 }, (_, i) =>
      node(`n${i}`, `Dato ${i}`),
    );
    const all = recallLines('Tema', many);
    const { drafts } = recallCardDrafts(all, new Set(all.map((l) => l.id)));
    expect(drafts).toHaveLength(MAX_RECALL_CARDS);
  });
});

describe('clockOf', () => {
  it('da minutos y segundos y nunca baja de cero', () => {
    expect(clockOf(180)).toBe('3:00');
    expect(clockOf(59)).toBe('0:59');
    expect(clockOf(5)).toBe('0:05');
    expect(clockOf(-3)).toBe('0:00');
  });
});
