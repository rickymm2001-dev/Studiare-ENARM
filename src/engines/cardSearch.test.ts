import { describe, expect, it } from 'vitest';
import type { FsrsCardState } from '@/data/schemas/common';
import {
  EMPTY_QUERY,
  buildSearchRows,
  compareSortKeys,
  foldText,
  parseTextQuery,
  plainText,
  searchCards,
  sortCards,
  sortKey,
  topicKey,
  type CardSearchQuery,
  type CardSearchSource,
} from './cardSearch';

const NOW = new Date('2026-10-08T12:00:00.000Z').getTime();

const state = (overrides: Partial<FsrsCardState> = {}): FsrsCardState => ({
  due: '2026-10-07T12:00:00.000Z',
  stability: 3,
  difficulty: 5,
  scheduledDays: 3,
  learningSteps: 0,
  reps: 4,
  lapses: 0,
  state: 'review',
  lastReview: '2026-10-04T12:00:00.000Z',
  ...overrides,
});

function source(id: string, overrides: Partial<CardSearchSource> = {}): CardSearchSource {
  return {
    cardId: id,
    noteId: `note-${id}`,
    deckId: 'd1',
    kind: 'basic',
    tags: ['Medicina-Interna::Infectología::Sepsis'],
    front: '<p>¿Qué es la <b>sepsis</b>?</p>',
    back: 'Disfunción orgánica por infección',
    origin: 'preloaded',
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    state: null,
    deckPath: ['Medicina interna (Paco)', 'Infectología'],
    topicPath: ['Medicina interna', 'Infectología', 'Sepsis'],
    ...overrides,
  };
}

const rowsOf = (sources: CardSearchSource[], suspended: string[] = []) =>
  buildSearchRows(sources, new Set(suspended), 8);
const query = (patch: Partial<CardSearchQuery>): CardSearchQuery => ({ ...EMPTY_QUERY, ...patch });
const ids = (rows: readonly { cardId: string }[]) => rows.map((row) => row.cardId).sort();
const found = (rows: ReturnType<typeof rowsOf>, patch: Partial<CardSearchQuery>) =>
  ids(searchCards(rows, query(patch), NOW).rows);

describe('texto de las tarjetas', () => {
  it('quita el HTML, decodifica entidades y deja los huecos dibujados como vienen', () => {
    expect(plainText('<p>Una&nbsp;dosis &amp; vía <mark>[pista]</mark></p>')).toBe(
      'Una dosis & vía [pista]',
    );
    expect(plainText('uno<br>dos<ul><li>a</li><li>b</li></ul>')).toBe('uno dos a b');
  });

  it('un campo enorme y hostil se lee rápido', () => {
    const hostile = ['<'.repeat(20_000), `{{c1::${':'.repeat(20_000)}`, '&'.repeat(20_000)];
    for (const text of hostile) {
      const started = performance.now();
      plainText(text);
      expect(performance.now() - started).toBeLessThan(100);
    }
  });

  it('busca y ordena sin importar acentos ni mayúsculas, con la ñ después de la n', () => {
    expect(foldText('Infectología')).toBe('infectologia');
    expect(compareSortKeys(sortKey('Ñandú'), sortKey('Nube'))).toBeGreaterThan(0);
    expect(compareSortKeys(sortKey('Ñandú'), sortKey('Oído'))).toBeLessThan(0);
    expect(compareSortKeys(sortKey('Álamo'), sortKey('alamo'))).toBe(0);
    expect(topicKey(['Medicina interna', 'Reumatología'])).toBe('medicina interna › reumatologia');
  });

  it('la clave de orden no lleva la puntuación del principio ni la marca de los huecos', () => {
    expect(sortKey('¿Cuál es el tratamiento?')).toBe('Cuál es el tratamiento?');
    expect(sortKey('¡Atención! Dosis')).toBe('Atención! Dosis');
    expect(sortKey('{{c1::Amiodarona}} en arritmias')).toBe('Amiodarona en arritmias');
    expect(sortKey('[…] es el fármaco de elección')).toBe('es el fármaco de elección');
    expect(sortKey('5 mg de {{c2::haloperidol}}')).toBe('5 mg de haloperidol');
  });
});

describe('filas', () => {
  it('trae el intervalo, el tema más fino y la ruta del mazo', () => {
    const [row] = rowsOf([source('a', { state: state() })]);
    expect(row?.interval).toBe(3);
    expect(row?.topic).toBe('Sepsis');
    expect(row?.deckLabel).toBe('Medicina interna (Paco) › Infectología');
    expect(row?.topicKeys).toEqual([
      'medicina interna',
      'medicina interna › infectologia',
      'medicina interna › infectologia › sepsis',
    ]);
    const [fresh] = rowsOf([source('n', { topicPath: [] })]);
    expect(fresh?.interval).toBeNull();
    expect(fresh?.due).toBeNull();
    expect(fresh?.topic).toBe('');
  });

  it('el tema llega hasta el tercer nivel, como los temas de cada mazo, y los de abajo se buscan', () => {
    const rows = rowsOf([
      source('h', {
        front: 'Patrón de incidencia',
        topicPath: ['Medicina interna', 'Hematología', 'Linfomas', ' ', 'Linfoma de Hodgkin'],
      }),
    ]);
    const [row] = rows;
    expect(row?.topicPath).toEqual(['Medicina interna', 'Hematología', 'Linfomas']);
    expect(row?.topic).toBe('Linfomas');
    expect(row?.topicKeys).toEqual([
      'medicina interna',
      'medicina interna › hematologia',
      'medicina interna › hematologia › linfomas',
    ]);
    // El nivel de abajo no es un tema que se filtre, pero sí se encuentra al buscarlo
    expect(found(rows, { text: 'hodgkin' })).toEqual(['h']);
  });

  it('el intervalo sigue a un cambio de fecha y sin último repaso usa el programado', () => {
    const moved = rowsOf([source('m', { state: state({ due: '2026-10-14T12:00:00.000Z' }) })]);
    expect(moved[0]?.interval).toBe(10);
    const plain = rowsOf([source('p', { state: state({ lastReview: null, scheduledDays: 6 }) })]);
    expect(plain[0]?.interval).toBe(6);
  });
});

describe('estados y chips que se prenden', () => {
  const sources = [
    source('nueva'),
    source('repaso', { state: state() }),
    source('futura', { state: state({ due: '2026-10-20T12:00:00.000Z' }) }),
    source('aprendiendo', { state: state({ state: 'learning' }) }),
    source('sanguijuela', { state: state({ lapses: 8 }) }),
    source('suspendida', { state: state() }),
    source('marcada', {
      controversy: { reason: 'Afirmación absoluta', sources: [], simulated: true },
    }),
  ];
  const rows = rowsOf(sources, ['suspendida']);

  it('vencidas son las que ya tocan, sin las nuevas ni las suspendidas', () => {
    expect(found(rows, { due: true })).toEqual(['aprendiendo', 'repaso', 'sanguijuela']);
  });

  it('la sanguijuela es la que llega a 8 olvidos', () => {
    expect(found(rows, { leech: true })).toEqual(['sanguijuela']);
    expect(rowsOf([source('x', { state: state({ lapses: 7 }) })])[0]?.leech).toBe(false);
  });

  it('marcadas son las que tienen señal de la IA', () => {
    expect(found(rows, { flagged: true })).toEqual(['marcada']);
  });

  it('varios estados se aceptan con O y los chips que se prenden se suman con Y', () => {
    expect(found(rows, { states: new Set(['new', 'suspended']) })).toEqual([
      'marcada',
      'nueva',
      'suspendida',
    ]);
    expect(found(rows, { states: new Set(['review']), due: true })).toEqual([
      'repaso',
      'sanguijuela',
    ]);
    expect(found(rows, { leech: true, flagged: true })).toEqual([]);
  });

  it('cuenta cada chip con los demás filtros puestos', () => {
    const { facets } = searchCards(rows, query({ states: new Set(['review']) }), NOW);
    // Los estados cuentan como si el chip de estado no estuviera puesto
    expect(facets.states).toEqual({
      new: 2,
      learning: 1,
      review: 4,
      relearning: 0,
      suspended: 1,
    });
    // Los demás cuentan dentro de lo que hay en repaso
    expect(facets.due).toBe(2);
    expect(facets.leech).toBe(1);
    expect(facets.flagged).toBe(0);
  });

  it('con un chip prendido su conteo es el de los resultados', () => {
    const { rows: shown, facets } = searchCards(rows, query({ due: true }), NOW);
    expect(facets.due).toBe(shown.length);
    expect(facets.leech).toBe(1);
  });
});

describe('mazo, tema y filtros raros', () => {
  const rows = rowsOf([
    source('a', { deckId: 'd1' }),
    source('b', {
      deckId: 'd2',
      tags: ['Medicina-Interna::Neurología'],
      front: 'Epilepsia',
      topicPath: ['Medicina interna', 'Neurología'],
    }),
    source('c', {
      deckId: 'd2',
      tags: ['Medicina-InternaX'],
      kind: 'cloze',
      origin: 'manual',
      topicPath: [],
    }),
    source('d', {
      deckId: 'd3',
      tags: [],
      topicPath: ['Ginecología', 'Amenorreas', 'Amenorreas primarias'],
    }),
  ]);

  it('por mazos incluidos', () => {
    expect(found(rows, { deckIds: new Set(['d2']) })).toEqual(['b', 'c']);
    expect(found(rows, { deckIds: new Set() })).toEqual([]);
  });

  it('por cualquier tramo de la ruta de temas', () => {
    expect(found(rows, { topic: topicKey(['Medicina interna']) })).toEqual(['a', 'b']);
    expect(found(rows, { topic: topicKey(['Medicina interna', 'Neurología']) })).toEqual(['b']);
    expect(found(rows, { topic: topicKey(['Ginecología']) })).toEqual(['d']);
  });

  it('cuenta los temas y los mazos con los demás filtros puestos', () => {
    const { facets } = searchCards(
      rows,
      query({ deckIds: new Set(['d2']), topic: topicKey(['Medicina interna']) }),
      NOW,
    );
    expect(Object.fromEntries(facets.topics)).toEqual({
      'medicina interna': 1,
      'medicina interna › neurologia': 1,
    });
    expect(Object.fromEntries(facets.decks)).toEqual({ d1: 1, d2: 1 });
  });

  it('por ruta de etiqueta con todo lo que cuelga de ella, sin confundir prefijos de texto', () => {
    expect(found(rows, { tag: 'Medicina-Interna' })).toEqual(['a', 'b']);
    expect(found(rows, { tag: 'medicina-interna::infectología' })).toEqual(['a']);
  });

  it('por tipo y por origen', () => {
    expect(found(rows, { kinds: new Set(['cloze']) })).toEqual(['c']);
    expect(found(rows, { origin: 'own' })).toEqual(['c']);
    expect(found(rows, { origin: 'preloaded' })).toEqual(['a', 'b', 'd']);
  });

  it('todos los filtros juntos se aplican con Y', () => {
    expect(
      found(rows, { deckIds: new Set(['d2']), tag: 'Medicina-Interna', text: 'epilepsia' }),
    ).toEqual(['b']);
  });
});

describe('búsqueda de texto', () => {
  const rows = rowsOf([
    source('a', {
      front: 'Tratamiento de la <b>Sepsis</b>',
      back: 'Antibióticos en la primera hora',
    }),
    source('b', { front: 'Tratamiento del choque', back: 'Líquidos y vasopresores' }),
    source('c', {
      front: 'Infección urinaria',
      back: 'Antibióticos según urocultivo',
      topicPath: ['Medicina interna', 'Reumatología', 'Lupus eritematoso sistémico'],
      tags: ['Medicina-Interna::Reumatología::LES'],
    }),
  ]);

  it('todas las palabras deben estar, sin importar acentos ni mayúsculas', () => {
    expect(found(rows, { text: 'tratamiento antibioticos' })).toEqual(['a']);
    expect(found(rows, { text: 'LIQUIDOS' })).toEqual(['b']);
  });

  it('las comillas buscan una frase y el guion excluye', () => {
    expect(found(rows, { text: '"primera hora"' })).toEqual(['a']);
    expect(found(rows, { text: 'antibioticos -urocultivo' })).toEqual(['a']);
    expect(parseTextQuery('uno "dos tres" -cuatro')).toEqual({
      must: ['uno', 'dos tres'],
      mustNot: ['cuatro'],
    });
  });

  it('busca también en las etiquetas y en el nombre legible del tema', () => {
    expect(found(rows, { text: 'lupus' })).toEqual(['c']);
    expect(found(rows, { text: 'les' })).toEqual(['c']);
  });

  it('una búsqueda vacía o de solo espacios no filtra nada', () => {
    expect(found(rows, { text: '   ' })).toHaveLength(3);
  });
});

describe('orden por columna', () => {
  const rows = rowsOf([
    source('a', {
      front: 'Beta',
      state: state({ due: '2026-10-09T00:00:00.000Z', lapses: 2 }),
      deckPath: ['Urgencias (Paco)'],
      topicPath: ['Urgencias', 'Toxíndromes'],
    }),
    source('b', {
      front: 'Álamo',
      state: state({ due: '2026-10-08T00:00:00.000Z', lapses: 5, state: 'learning' }),
      deckPath: ['Medicina interna (Paco)'],
      topicPath: ['Medicina interna', 'Reumatología'],
    }),
    source('c', { front: 'Gamma', deckPath: ['Ñu'], topicPath: [] }),
  ]);
  const order = (key: Parameters<typeof sortCards>[1]['key'], direction: 'asc' | 'desc') =>
    sortCards(rows, { key, direction }).map((row) => row.cardId);

  it('por texto en español, sin importar acentos', () => {
    expect(order('front', 'asc')).toEqual(['b', 'a', 'c']);
    expect(order('front', 'desc')).toEqual(['c', 'a', 'b']);
    // Ñu va después de Medicina y antes de Urgencias
    expect(order('deck', 'asc')).toEqual(['b', 'c', 'a']);
  });

  it('el frente sigue el orden del español aunque empiece con ¿ o con un hueco', () => {
    const fronts = rowsOf([
      source('zinc', { front: 'Zinc en la dieta' }),
      source('cual', { front: '<p>¿Cuál es el tratamiento de elección?</p>' }),
      source('hueco', { front: '{{c1::Amiodarona}} en la fibrilación auricular' }),
      source('arbol', { front: 'árbol bronquial' }),
      source('nandu', { front: 'Ñandú' }),
      source('nube', { front: 'Nube' }),
    ]);
    expect(sortCards(fronts, { key: 'front', direction: 'asc' }).map((row) => row.cardId)).toEqual([
      'hueco',
      'arbol',
      'cual',
      'nube',
      'nandu',
      'zinc',
    ]);
    expect(sortCards(fronts, { key: 'front', direction: 'desc' }).map((row) => row.cardId)).toEqual(
      ['zinc', 'nandu', 'nube', 'cual', 'arbol', 'hueco'],
    );
  });

  it('por tema, con las tarjetas sin tema siempre al final', () => {
    expect(order('topic', 'asc')).toEqual(['b', 'a', 'c']);
    expect(order('topic', 'desc')).toEqual(['a', 'b', 'c']);
  });

  it('por próxima fecha y por intervalo, con las nuevas siempre al final', () => {
    expect(order('due', 'asc')).toEqual(['b', 'a', 'c']);
    expect(order('due', 'desc')).toEqual(['a', 'b', 'c']);
    expect(order('interval', 'desc')).toEqual(['a', 'b', 'c']);
  });

  it('por estado y por fallos, sin cambiar la lista original', () => {
    const copy = [...rows];
    expect(order('status', 'asc')).toEqual(['c', 'b', 'a']);
    expect(order('lapses', 'desc')).toEqual(['b', 'a', 'c']);
    expect(rows).toEqual(copy);
  });

  it('por creación y modificación, con el ID para desempatar', () => {
    expect(order('created', 'asc')).toEqual(['a', 'b', 'c']);
    // A igual fecha desempata el ID, en el mismo sentido siempre
    expect(order('updated', 'desc')).toEqual(['a', 'b', 'c']);
  });
});
