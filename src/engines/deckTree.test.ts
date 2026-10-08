import { describe, expect, it } from 'vitest';
import {
  MAX_DECK_DEPTH,
  buildDeckTree,
  canMoveDeck,
  deckChain,
  deckDepth,
  deckPath,
  flattenDeckTree,
  descendantIds,
  rollupCounts,
  selectionUnitId,
  type DeckLike,
} from './deckTree';

const deck = (id: string, name: string, parentId: string | null = null): DeckLike => ({
  id,
  name,
  parentId,
});

const TREE: DeckLike[] = [
  deck('root', 'ENARM 2027'),
  deck('mi', 'Medicina interna', 'root'),
  deck('gyo', 'Ginecología', 'root'),
  deck('inf', 'Infectología', 'mi'),
  deck('car', 'Cardiología', 'mi'),
  deck('own', 'Mis errores'),
];

describe('árbol de mazos', () => {
  it('arma el árbol ordenado por nombre con la profundidad de cada mazo', () => {
    const tree = buildDeckTree(TREE);
    expect(tree.map((node) => node.deck.id)).toEqual(['root', 'own']);
    const root = tree[0];
    expect(root?.children.map((node) => node.deck.id)).toEqual(['gyo', 'mi']);
    const mi = root?.children[1];
    expect(mi?.children.map((node) => node.deck.id)).toEqual(['car', 'inf']);
    expect(mi?.children[0]?.depth).toBe(2);
  });

  it('un padre que no existe o él mismo deja el mazo en primer nivel', () => {
    const tree = buildDeckTree([deck('a', 'A', 'no-existe'), deck('b', 'B', 'b')]);
    expect(tree.map((node) => node.deck.id)).toEqual(['a', 'b']);
  });

  it('un ciclo no hace perder mazos ni se cuelga', () => {
    const cyclic = [deck('a', 'A', 'b'), deck('b', 'B', 'a'), deck('c', 'C', 'b')];
    const tree = buildDeckTree(cyclic);
    const ids: string[] = [];
    const walk = (nodes: typeof tree) => {
      for (const node of nodes) {
        ids.push(node.deck.id);
        walk(node.children);
      }
    };
    walk(tree);
    expect(ids.sort()).toEqual(['a', 'b', 'c']);
  });

  it('da el mazo con todos sus descendientes', () => {
    expect([...descendantIds(TREE, 'mi')].sort()).toEqual(['car', 'inf', 'mi']);
    expect([...descendantIds(TREE, 'own')]).toEqual(['own']);
    expect(descendantIds(TREE, 'root').size).toBe(5);
  });

  it('da la ruta y la profundidad', () => {
    expect(deckPath(TREE, 'inf')).toEqual(['ENARM 2027', 'Medicina interna', 'Infectología']);
    expect(deckChain(TREE, 'inf').map((item) => item.id)).toEqual(['root', 'mi', 'inf']);
    expect(deckDepth(TREE, 'inf')).toBe(2);
    expect(deckDepth(TREE, 'root')).toBe(0);
    expect(deckPath(TREE, 'no-existe')).toEqual([]);
  });

  it('la ruta de un ciclo termina', () => {
    expect(deckChain([deck('a', 'A', 'b'), deck('b', 'B', 'a')], 'a')).toHaveLength(2);
  });
});

describe('mover un mazo', () => {
  it('acepta mover a otro mazo y a primer nivel', () => {
    expect(canMoveDeck(TREE, 'own', 'mi')).toBe('ok');
    expect(canMoveDeck(TREE, 'inf', null)).toBe('ok');
  });

  it('rechaza mover un mazo dentro de sí mismo o de uno de sus descendientes', () => {
    expect(canMoveDeck(TREE, 'mi', 'mi')).toBe('self');
    expect(canMoveDeck(TREE, 'mi', 'inf')).toBe('cycle');
    expect(canMoveDeck(TREE, 'root', 'car')).toBe('cycle');
  });

  it('rechaza lo que no existe', () => {
    expect(canMoveDeck(TREE, 'no-existe', 'mi')).toBe('missing');
    expect(canMoveDeck(TREE, 'mi', 'no-existe')).toBe('missing');
  });

  it('rechaza pasar del máximo de niveles contando lo que cuelga del mazo', () => {
    const chain: DeckLike[] = Array.from({ length: MAX_DECK_DEPTH }, (_, index) =>
      deck(`n${index}`, `N${index}`, index === 0 ? null : `n${index - 1}`),
    );
    const extra = [...chain, deck('x', 'X'), deck('y', 'Y', 'x')];
    // Colgar x, que trae a y, bajo el último nivel pasa del máximo
    expect(canMoveDeck(extra, 'x', `n${MAX_DECK_DEPTH - 1}`)).toBe('too_deep');
    // Colgar solo y bajo el penúltimo cabe justo
    expect(canMoveDeck(extra, 'y', `n${MAX_DECK_DEPTH - 2}`)).toBe('ok');
  });
});

describe('unidad de selección y conteos', () => {
  it('el mazo de primer nivel es su propia unidad y los de abajo cuentan como el del segundo nivel', () => {
    // ENARM 2027 solo agrupa, así que se elige por rama
    const containers = new Set(['root']);
    expect(selectionUnitId(TREE, 'own', containers)).toBe('own');
    expect(selectionUnitId(TREE, 'root', containers)).toBe('root');
    expect(selectionUnitId(TREE, 'mi', containers)).toBe('mi');
    expect(selectionUnitId(TREE, 'inf', containers)).toBe('mi');
    expect(selectionUnitId(TREE, 'no-existe', containers)).toBe('no-existe');
  });

  it('en un mazo propio la unidad es el de primer nivel, con todos sus submazos', () => {
    const own = [
      deck('a', 'Medicina interna'),
      deck('b', 'Nefrología', 'a'),
      deck('c', 'Glomerulopatías', 'b'),
    ];
    for (const id of ['a', 'b', 'c']) expect(selectionUnitId(own, id)).toBe('a');
  });

  it('acumula los conteos de los mazos que cuelgan de cada uno', () => {
    const totals = rollupCounts(
      TREE,
      new Map([
        ['inf', 10],
        ['car', 5],
        ['gyo', 7],
        ['own', 2],
      ]),
    );
    expect(totals.get('mi')).toBe(15);
    expect(totals.get('root')).toBe(22);
    expect(totals.get('own')).toBe(2);
    expect(totals.get('car')).toBe(5);
  });
});

describe('rollupCounts con muchos mazos', () => {
  it('es lineal y no se cuelga con un ciclo', () => {
    const many = Array.from({ length: 3000 }, (_, index) =>
      deck(`d${index}`, `Mazo ${index}`, index === 0 ? null : `d${Math.floor((index - 1) / 2)}`),
    );
    const own = new Map(many.map((entry) => [entry.id, 1]));
    const started = performance.now();
    const totals = rollupCounts(many, own);
    expect(performance.now() - started).toBeLessThan(500);
    expect(totals.get('d0')).toBe(3000);
    // Un ciclo no se repite ni se cuelga
    const loop = [deck('x', 'X', 'y'), deck('y', 'Y', 'x')];
    expect(
      rollupCounts(
        loop,
        new Map([
          ['x', 1],
          ['y', 2],
        ]),
      ).size,
    ).toBe(2);
  });
});

describe('flattenDeckTree', () => {
  it('lista los mazos en orden de árbol con su nivel', () => {
    const decks = [
      { id: 'b', name: 'B', parentId: null },
      { id: 'a1', name: 'A1', parentId: 'a' },
      { id: 'a', name: 'A', parentId: null },
      { id: 'a1x', name: 'X', parentId: 'a1' },
    ];
    expect(flattenDeckTree(decks).map(({ deck, depth }) => `${depth}:${deck.id}`)).toEqual([
      '0:a',
      '1:a1',
      '2:a1x',
      '0:b',
    ]);
  });
});
