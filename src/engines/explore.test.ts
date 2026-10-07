import { describe, expect, it } from 'vitest';
import type { FsrsCardState } from '@/data/schemas/common';
import {
  NO_FILTERS,
  buildExploreRows,
  filterRows,
  foldText,
  parseTextQuery,
  plainText,
  sortRows,
  statusCounts,
  type ExploreFilters,
  type ExploreSource,
} from './explore';

const NOW = new Date('2026-10-08T12:00:00.000Z');

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

function source(id: string, overrides: Partial<ExploreSource> = {}): ExploreSource {
  return {
    cardId: id,
    noteId: `note-${id}`,
    deckId: 'd1',
    kind: 'basic',
    ordinal: 0,
    tags: ['Medicina-Interna::Infectología::Sepsis'],
    front: '<p>¿Qué es la <b>sepsis</b>?</p>',
    back: 'Disfunción orgánica por infección',
    origin: 'preloaded',
    isDemo: true,
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    state: null,
    ...overrides,
  };
}

const rowsOf = (sources: ExploreSource[], suspended: string[] = []) =>
  buildExploreRows(sources, new Set(suspended), 8);
const filters = (patch: Partial<ExploreFilters>): ExploreFilters => ({ ...NO_FILTERS, ...patch });
const ids = (rows: { cardId: string }[]) => rows.map((row) => row.cardId).sort();

describe('texto de las tarjetas', () => {
  it('quita el HTML, decodifica entidades y muestra los huecos entre corchetes', () => {
    expect(plainText('<p>Una&nbsp;{{c1::dosis &amp; vía::pista}} y {{c2::otra}}</p>')).toBe(
      'Una [dosis & vía] y [otra]',
    );
    expect(plainText('uno<br>dos<ul><li>a</li><li>b</li></ul>')).toBe('uno dos a b');
  });

  it('busca sin importar acentos ni mayúsculas', () => {
    expect(foldText('Infectología')).toBe('infectologia');
  });
});

describe('estados', () => {
  const sources = [
    source('nueva'),
    source('repaso', { state: state() }),
    source('futura', { state: state({ due: '2026-10-20T12:00:00.000Z' }) }),
    source('aprendiendo', { state: state({ state: 'learning' }) }),
    source('sanguijuela', { state: state({ lapses: 8 }) }),
    source('suspendida', { state: state() }),
  ];
  const rows = rowsOf(sources, ['suspendida']);

  it('una tarjeta nueva no tiene vencimiento y una suspendida no cuenta como vencida', () => {
    const byId = new Map(rows.map((row) => [row.cardId, row]));
    expect(byId.get('nueva')?.due).toBeNull();
    expect(byId.get('nueva')?.fsrs).toBe('new');
    const due = filterRows(rows, filters({ status: new Set(['due']) }), NOW);
    expect(ids(due)).toEqual(['aprendiendo', 'repaso', 'sanguijuela']);
  });

  it('la sanguijuela es la que llega a 8 olvidos', () => {
    expect(ids(filterRows(rows, filters({ status: new Set(['leech']) }), NOW))).toEqual([
      'sanguijuela',
    ]);
    expect(rowsOf([source('x', { state: state({ lapses: 7 }) })])[0]?.leech).toBe(false);
  });

  it('varios estados se aceptan con O', () => {
    const found = filterRows(rows, filters({ status: new Set(['new', 'suspended']) }), NOW);
    expect(ids(found)).toEqual(['nueva', 'suspendida']);
  });

  it('cuenta cada estado', () => {
    expect(statusCounts(rows, NOW)).toEqual({
      new: 1,
      learning: 1,
      review: 4,
      relearning: 0,
      due: 3,
      suspended: 1,
      leech: 1,
    });
  });
});

describe('filtros', () => {
  const rows = rowsOf([
    source('a', { deckId: 'd1', tags: ['Medicina-Interna::Infectología::Sepsis'] }),
    source('b', { deckId: 'd2', tags: ['Medicina-Interna::Neurología'], front: 'Epilepsia' }),
    source('c', { deckId: 'd2', tags: ['Medicina-InternaX'], kind: 'cloze', origin: 'manual' }),
  ]);

  it('por mazos incluidos', () => {
    expect(ids(filterRows(rows, filters({ deckIds: new Set(['d2']) }), NOW))).toEqual(['b', 'c']);
    expect(filterRows(rows, filters({ deckIds: new Set() }), NOW)).toHaveLength(0);
  });

  it('por ruta de etiqueta con todo lo que cuelga de ella, sin confundir prefijos de texto', () => {
    expect(ids(filterRows(rows, filters({ tag: 'Medicina-Interna' }), NOW))).toEqual(['a', 'b']);
    expect(ids(filterRows(rows, filters({ tag: 'medicina-interna::infectología' }), NOW))).toEqual([
      'a',
    ]);
  });

  it('por tipo y por origen', () => {
    expect(ids(filterRows(rows, filters({ kinds: new Set(['cloze']) }), NOW))).toEqual(['c']);
    expect(ids(filterRows(rows, filters({ origin: 'own' }), NOW))).toEqual(['c']);
    expect(ids(filterRows(rows, filters({ origin: 'preloaded' }), NOW))).toEqual(['a', 'b']);
  });

  it('todos los filtros juntos se aplican con Y', () => {
    const found = filterRows(
      rows,
      filters({ deckIds: new Set(['d2']), tag: 'Medicina-Interna', text: 'epilepsia' }),
      NOW,
    );
    expect(ids(found)).toEqual(['b']);
  });
});

describe('búsqueda de texto', () => {
  const rows = rowsOf([
    source('a', {
      front: 'Tratamiento de la <b>Sepsis</b>',
      back: 'Antibióticos en la primera hora',
    }),
    source('b', { front: 'Tratamiento del choque', back: 'Líquidos y vasopresores' }),
    source('c', { front: 'Infección urinaria', back: 'Antibióticos según urocultivo' }),
  ]);

  it('todas las palabras deben estar, sin importar acentos ni mayúsculas', () => {
    expect(ids(filterRows(rows, filters({ text: 'tratamiento antibioticos' }), NOW))).toEqual([
      'a',
    ]);
    expect(ids(filterRows(rows, filters({ text: 'LIQUIDOS' }), NOW))).toEqual(['b']);
  });

  it('las comillas buscan una frase y el guion excluye', () => {
    expect(ids(filterRows(rows, filters({ text: '"primera hora"' }), NOW))).toEqual(['a']);
    expect(ids(filterRows(rows, filters({ text: 'antibioticos -urocultivo' }), NOW))).toEqual([
      'a',
    ]);
    expect(parseTextQuery('uno "dos tres" -cuatro')).toEqual({
      must: ['uno', 'dos tres'],
      mustNot: ['cuatro'],
    });
  });

  it('busca también en las etiquetas', () => {
    const withTags = rowsOf([
      source('t', { tags: ['Cardiologia::Infarto'], front: 'x', back: 'y' }),
    ]);
    expect(filterRows(withTags, filters({ text: 'infarto' }), NOW)).toHaveLength(1);
  });

  it('una búsqueda vacía o de solo espacios no filtra nada', () => {
    expect(filterRows(rows, filters({ text: '   ' }), NOW)).toHaveLength(3);
  });
});

describe('orden', () => {
  const rows = rowsOf([
    source('a', { front: 'Beta', state: state({ due: '2026-10-09T00:00:00.000Z', lapses: 2 }) }),
    source('b', { front: 'Alfa', state: state({ due: '2026-10-08T00:00:00.000Z', lapses: 5 }) }),
    source('c', { front: 'Gamma' }),
  ]);

  it('por texto, en español', () => {
    expect(sortRows(rows, { key: 'front', direction: 'asc' }).map((row) => row.front)).toEqual([
      'Alfa',
      'Beta',
      'Gamma',
    ]);
  });

  it('por vencimiento, con las nuevas siempre al final', () => {
    expect(sortRows(rows, { key: 'due', direction: 'asc' }).map((row) => row.cardId)).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(sortRows(rows, { key: 'due', direction: 'desc' }).map((row) => row.cardId)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('por olvidos, y no cambia la lista original', () => {
    const copy = [...rows];
    expect(sortRows(rows, { key: 'lapses', direction: 'desc' }).map((row) => row.cardId)).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(rows).toEqual(copy);
  });
});

describe('rendimiento con 20,000 tarjetas', () => {
  const WORDS = [
    'sepsis',
    'choque',
    'infarto',
    'diabetes',
    'asma',
    'epilepsia',
    'cirrosis',
    'anemia',
  ];
  const sources = Array.from({ length: 20_000 }, (_, index) =>
    source(`c${index}`, {
      deckId: `d${index % 40}`,
      tags: [`Rama${index % 3}::Materia${index % 40}::Tema${index % 200}`],
      front: `<p>${WORDS[index % 8]} caso ${index} y ${WORDS[(index * 3) % 8]}</p>`,
      back: `Respuesta de la tarjeta ${index} sobre ${WORDS[(index * 5) % 8]}`,
      state: index % 4 === 0 ? null : state({ lapses: index % 11 }),
    }),
  );

  it('arma las filas y filtra con todo combinado en tiempos holgados', () => {
    const t0 = performance.now();
    const rows = buildExploreRows(sources, new Set(['c1', 'c2', 'c3']), 8);
    const built = performance.now() - t0;
    expect(rows).toHaveLength(20_000);

    const t1 = performance.now();
    for (let index = 0; index < 20; index += 1) {
      filterRows(
        rows,
        filters({
          deckIds: new Set(['d1', 'd2', 'd3', 'd4']),
          tag: 'Rama1',
          status: new Set(['review', 'leech']),
          text: 'sepsis caso -asma',
        }),
        NOW,
      );
    }
    const perFilter = (performance.now() - t1) / 20;
    sortRows(rows, { key: 'front', direction: 'asc' });
    // Holgados para que no sean frágiles en el CI. En una máquina normal son unos pocos milisegundos
    expect(built).toBeLessThan(4000);
    expect(perFilter).toBeLessThan(150);
  });
});
