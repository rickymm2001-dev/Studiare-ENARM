// Rendimiento del índice de duplicados con 20,000 notas (criterio de la Fase C2, Explorar y revisión
// de calidad). Los tiempos son holgados a propósito para que no sean frágiles en el CI. Medido en el
// entorno de desarrollo con 20,000 notas de 8 a 20 palabras, el índice tarda unos 400 ms con toda la
// normalización incluida y cada consulta unos 0.1 ms en promedio y menos de 1 ms como máximo. El
// peor caso, una candidata hecha solo de palabras comunes, tardó unos 15 ms. Los límites de la
// prueba, 2 segundos y 50 ms, dejan un margen de 5 y de 50 veces en el caso normal.
import { describe, expect, it } from 'vitest';
import { createRng, type Rng } from './random';
import {
  buildDuplicateIndex,
  findDuplicates,
  type DuplicateCandidate,
  type DuplicateNote,
} from './duplicates';

const NOTES = 20_000;
const BUILD_LIMIT_MS = 2_000;
const QUERY_LIMIT_MS = 50;

const SYLLABLES = [
  'ma',
  'ne',
  'ti',
  'co',
  'su',
  'ra',
  'pe',
  'lo',
  'di',
  'ga',
  'fa',
  'zu',
  'be',
  'ka',
  'ho',
  'vi',
  'sa',
];
/** Palabras muy comunes, que aparecen en la mitad de las notas y hacen largos los listados */
const COMMON = ['de', 'la', 'el', 'que', 'en', 'un', 'y', 'con', 'por', 'es', 'se', 'tipo'];

/** Un vocabulario de 4,913 palabras inventadas */
function makeVocabulary(): string[] {
  const words = new Set<string>();
  for (const first of SYLLABLES) {
    for (const second of SYLLABLES) {
      for (const third of SYLLABLES) words.add(`${first}${second}${third}`);
    }
  }
  return [...words];
}

/** Una frase de 8 a 20 palabras donde las primeras del vocabulario salen mucho más que las demás */
function makeSentence(rng: Rng, vocabulary: readonly string[]): string[] {
  const length = rng.int(8, 20);
  return Array.from({ length }, () =>
    rng.chance(0.4)
      ? rng.pick(COMMON)
      : (vocabulary[Math.floor(vocabulary.length * rng.next() ** 3)] ?? 'ma'),
  );
}

function makeNotes(): { notes: DuplicateNote[]; sentences: string[][] } {
  const rng = createRng('duplicados-rendimiento');
  const vocabulary = makeVocabulary();
  const sentences = Array.from({ length: NOTES }, () => makeSentence(rng, vocabulary));
  const notes = sentences.map((words, position): DuplicateNote => {
    const text = words.join(' ');
    const id = `n${position}`;
    if (position % 5 === 0) {
      // Una de cada cinco es cloze, con HTML y un hueco
      return { id, kind: 'cloze', text: `<p>${words[0]} {{c1::${words.slice(1).join(' ')}}}</p>` };
    }
    return {
      id,
      kind: 'basic',
      front: `<p>¿${text}?</p>`,
      deletedAt: position % 50 === 1 ? '2026-10-07T00:00:00.000Z' : null,
    };
  });
  return { notes, sentences };
}

describe('rendimiento con 20,000 notas', () => {
  it('arma el índice en menos de 2 segundos y consulta cada candidata en menos de 50 ms', () => {
    const { notes, sentences } = makeNotes();

    const buildStart = performance.now();
    const index = buildDuplicateIndex(notes);
    const buildMs = performance.now() - buildStart;
    expect(index.size).toBe(NOTES - NOTES / 50);
    expect(buildMs).toBeLessThan(BUILD_LIMIT_MS);

    // Tres tipos de consulta. Exactas con otro formato, con una palabra de más y sin nada parecido
    const rng = createRng('consultas');
    const queries: { candidate: DuplicateCandidate; expect: 'exact' | 'near' | 'none' }[] = [];
    while (queries.length < 90) {
      // Notas que no están borradas y con 7 palabras distintas o más, para que una palabra de
      // más siga dando una similitud de 7 entre 8, que es 0.875
      const position = rng.int(0, NOTES - 1);
      const words = sentences[position] ?? [];
      if (position % 50 === 1 || new Set(words).size < 7) continue;
      queries.push({
        candidate: { kind: 'basic', front: `<b>${words.join(' ').toUpperCase()}</b>.` },
        expect: 'exact',
      });
      queries.push({
        candidate: { kind: 'basic', front: `${words.join(' ')} extraordinario` },
        expect: 'near',
      });
      queries.push({
        candidate: { kind: 'basic', front: 'palabras nunca vistas en ningún lado jamás xyzzy' },
        expect: 'none',
      });
    }
    // Calentamiento, para que el compilador de V8 no cuente como lenta a la primera
    findDuplicates({ kind: 'basic', front: 'calentamiento ma ne' }, index);

    const times: number[] = [];
    for (const query of queries) {
      const start = performance.now();
      const result = findDuplicates(query.candidate, index);
      times.push(performance.now() - start);
      if (query.expect === 'exact') expect(result.totalExact).toBeGreaterThanOrEqual(1);
      if (query.expect === 'near')
        expect(result.totalExact + result.totalNear).toBeGreaterThanOrEqual(1);
      if (query.expect === 'none') expect(result.totalExact + result.totalNear).toBe(0);
    }
    const average = times.reduce((sum, time) => sum + time, 0) / times.length;
    expect(average).toBeLessThan(QUERY_LIMIT_MS);
    // Ninguna consulta sola se acerca al límite, ni con una pausa del recolector de basura
    expect(Math.max(...times)).toBeLessThan(QUERY_LIMIT_MS * 5);
  });

  it('una consulta con muchas palabras comunes tampoco se vuelve lenta', () => {
    const { notes } = makeNotes();
    const index = buildDuplicateIndex(notes);
    const common = Array.from({ length: 24 }, (_, position) => COMMON[position % COMMON.length]);
    findDuplicates({ kind: 'basic', front: 'de la el' }, index);
    const start = performance.now();
    const result = findDuplicates({ kind: 'basic', front: common.join(' ') }, index);
    expect(performance.now() - start).toBeLessThan(QUERY_LIMIT_MS * 5);
    expect(result.totalExact).toBe(0);
  });
});
