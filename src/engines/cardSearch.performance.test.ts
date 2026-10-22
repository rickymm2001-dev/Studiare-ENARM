// Rendimiento de Buscar tarjetas con 10,000 tarjetas (B4 del plan del cambio, criterio de aceptación).
// Filtrar, con la búsqueda de texto, los chips y sus conteos, tarda menos de 100 ms. Cada caso se mide
// varias veces después de calentar y vale la mediana, así una pausa del recolector de basura o una
// máquina ocupada en el CI no tumban la prueba, pero el tope de 100 ms es el mismo del plan. Medido en
// el entorno de desarrollo, una búsqueda completa tarda pocos milisegundos.
import { describe, expect, it } from 'vitest';
import type { FsrsCardState } from '@/data/schemas/common';
import { createRng } from './random';
import {
  EMPTY_QUERY,
  buildSearchRows,
  searchCards,
  sortCards,
  topicKey,
  type CardSearchQuery,
  type CardSearchSource,
  type CardSort,
} from './cardSearch';

const CARDS = 10_000;
const LIMIT_MS = 100;
const WARMUP = 2;
const RUNS = 9;
const NOW = Date.UTC(2026, 9, 8, 12);

const WORDS = [
  'sepsis',
  'choque',
  'infarto',
  'diabetes',
  'asma',
  'epilepsia',
  'cirrosis',
  'anemia',
  'lupus',
  'artritis',
  'preeclampsia',
  'tratamiento',
  'diagnóstico',
  'dosis',
  'criterios',
  'primera',
  'línea',
  'niño',
  'embarazo',
  'fármaco',
];
const BRANCHES = ['Medicina interna', 'Ginecología', 'Obstetricia', 'Urgencias', 'Pediatría'];

function makeSources(): CardSearchSource[] {
  const rng = createRng('buscar-tarjetas-rendimiento');
  const sentence = (min: number, max: number) =>
    Array.from({ length: rng.int(min, max) }, () => rng.pick(WORDS)).join(' ');
  return Array.from({ length: CARDS }, (_, index): CardSearchSource => {
    const branch = BRANCHES[index % BRANCHES.length] as string;
    const subject = `Materia ${String(index % 37)}`;
    const topic = `Tema ${String(index % 211)}`;
    const reviewed = index % 4 !== 0;
    const state: FsrsCardState | null = reviewed
      ? {
          due: new Date(NOW + rng.int(-20, 40) * 86_400_000).toISOString(),
          stability: 4,
          difficulty: 5,
          scheduledDays: rng.int(1, 60),
          learningSteps: 0,
          reps: rng.int(1, 20),
          lapses: rng.int(0, 11),
          state: index % 9 === 0 ? 'learning' : 'review',
          lastReview: new Date(NOW - rng.int(1, 30) * 86_400_000).toISOString(),
        }
      : null;
    return {
      cardId: `c${String(index).padStart(5, '0')}`,
      noteId: `n${String(index)}`,
      deckId: `d${String(index % 40)}`,
      kind: index % 5 === 0 ? 'cloze' : 'basic',
      tags: [
        `${branch.replace(/ /g, '-')}::${subject.replace(/ /g, '_')}::${topic.replace(/ /g, '_')}`,
      ],
      front: `<p>¿${sentence(8, 20)} caso ${String(index)}?</p>`,
      back: `<p>${sentence(5, 15)}</p>`,
      origin: index % 3 === 0 ? 'manual' : 'preloaded',
      createdAt: new Date(NOW - index * 60_000).toISOString(),
      updatedAt: new Date(NOW - index * 30_000).toISOString(),
      state,
      controversy:
        index % 20 === 0 ? { reason: 'Afirmación absoluta', sources: [], simulated: true } : null,
      aiDraft: index % 20 === 0,
      deckPath: [`Mazo ${String(index % 8)}`, subject],
      topicPath: [branch, subject, topic],
    };
  });
}

/** La mediana de varias corridas después de calentar, en milisegundos */
function medianMs(run: () => unknown): number {
  for (let index = 0; index < WARMUP; index += 1) run();
  const times: number[] = [];
  for (let index = 0; index < RUNS; index += 1) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] ?? Number.POSITIVE_INFINITY;
}

describe('rendimiento de Buscar tarjetas con 10,000 tarjetas', () => {
  const sources = makeSources();
  const rows = buildSearchRows(sources, new Set(['c00001', 'c00002', 'c00003']), 8);
  const sorted = sortCards(rows, { key: 'created', direction: 'desc' });
  const query = (patch: Partial<CardSearchQuery>): CardSearchQuery => ({
    ...EMPTY_QUERY,
    ...patch,
  });

  const cases: [string, CardSearchQuery][] = [
    ['sin filtros, con todos los conteos', EMPTY_QUERY],
    ['una palabra', query({ text: 'lupus' })],
    ['palabras, frase y exclusión', query({ text: 'tratamiento "primera línea" -embarazo' })],
    [
      'todo junto',
      query({
        text: 'dosis caso',
        deckIds: new Set(['d1', 'd2', 'd3', 'd4', 'd5']),
        topic: topicKey(['Medicina interna']),
        states: new Set(['review', 'suspended']),
        due: true,
        leech: true,
        kinds: new Set(['basic']),
        origin: 'preloaded',
        tag: 'Medicina-Interna',
      }),
    ],
    ['nada coincide', query({ text: 'zzzzxqj' })],
  ];

  it.each(cases)('filtra %s en menos de 100 ms', (name, current) => {
    let shown = -1;
    const ms = medianMs(() => {
      shown = searchCards(sorted, current, NOW).rows.length;
    });
    expect(shown).toBeGreaterThanOrEqual(0);
    expect(ms, `${name}, mediana ${ms.toFixed(1)} ms`).toBeLessThan(LIMIT_MS);
  });

  it('los resultados y los conteos son los esperados', () => {
    const all = searchCards(sorted, EMPTY_QUERY, NOW);
    expect(all.rows).toHaveLength(CARDS);
    expect([...all.facets.decks.values()].reduce((sum, count) => sum + count, 0)).toBe(CARDS);
    expect(all.facets.topics.get(topicKey(['Medicina interna']))).toBe(CARDS / BRANCHES.length);
    expect(all.facets.flagged).toBe(CARDS / 20);
    expect(searchCards(sorted, query({ text: 'zzzzxqj' }), NOW).rows).toHaveLength(0);
    const combined = searchCards(sorted, cases[3]?.[1] ?? EMPTY_QUERY, NOW).rows;
    for (const row of combined) {
      expect(row.deckId).toMatch(/^d[1-5]$/);
      expect(row.topicPath[0]).toBe('Medicina interna');
      expect(row.leech).toBe(true);
    }
  });

  it('los campos con texto tardan menos de 100 ms, porque ya vienen plegados', () => {
    const fields = [
      'frente:lupus',
      'reverso:asma',
      'mazo:materia',
      'tema:medicina',
      'etiqueta:interna',
      'frente:lupus mazo:materia tema:medicina etiqueta:interna',
    ];
    for (const text of fields) {
      const ms = medianMs(() => searchCards(sorted, query({ text }), NOW));
      expect(ms, `${text}, mediana ${ms.toFixed(1)} ms`).toBeLessThan(LIMIT_MS);
    }
  });

  it('ordenar por cualquier columna también tarda menos de 100 ms', () => {
    const sorts: CardSort[] = [
      { key: 'front', direction: 'asc' },
      { key: 'deck', direction: 'desc' },
      { key: 'topic', direction: 'asc' },
      { key: 'due', direction: 'asc' },
      { key: 'interval', direction: 'desc' },
      { key: 'lapses', direction: 'desc' },
    ];
    for (const sort of sorts) {
      const ms = medianMs(() => sortCards(rows, sort));
      expect(ms, `${sort.key}, mediana ${ms.toFixed(1)} ms`).toBeLessThan(LIMIT_MS);
    }
  });
});

describe('rendimiento de los campos con 50,000 tarjetas', () => {
  // Cinco copias de las mismas tarjetas con otro id, para no armar 50,000 distintas
  const base = makeSources();
  const many = Array.from({ length: 5 }, (_, copy) =>
    base.map((source) => ({ ...source, cardId: `${source.cardId}-${String(copy)}` })),
  ).flat();
  const rows = buildSearchRows(many, new Set(), 8);

  it('buscar con campo y valor mientras se teclea tarda menos de 100 ms', () => {
    expect(rows).toHaveLength(CARDS * 5);
    for (const text of ['frente:lupus', 'mazo:materia', 'tema:medicina', 'etiqueta:interna']) {
      const ms = medianMs(() => searchCards(rows, { ...EMPTY_QUERY, text }, NOW));
      expect(ms, `${text}, mediana ${ms.toFixed(1)} ms`).toBeLessThan(LIMIT_MS);
    }
  });
});
