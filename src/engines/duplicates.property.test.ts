// Propiedades de la normalización de duplicados y del índice, con fast-check
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildDuplicateIndex,
  duplicateKey,
  findDuplicates,
  normalizeForDuplicates,
  type DuplicateNote,
} from './duplicates';

const LETTERS = Array.from('abcdefghijklmnñopqrstuvwxyz');
const word = fc
  .array(fc.constantFrom(...LETTERS), { minLength: 1, maxLength: 8 })
  .map((letters) => letters.join(''));
/** Palabras de letras latinas separadas por un espacio */
const sentence = fc.array(word, { minLength: 1, maxLength: 10 });

const ACCENTED: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', n: 'ñ' };
/** Puntuación sin & ni < >, que forman entidades y etiquetas y sí cambian el texto */
const PUNCTUATION = Array.from('.,;:!?¿¡()"\'-…«»[]{}/_');
const INLINE_TAGS = ['b', 'i', 'u', 'em', 'strong', 'sup', 'sub', 'mark', 'span'];
const SEPARATORS = [' ', '  ', '\n', '<br>', '<br/>', '</p><p>', '</div><div>', '<br> '];

describe('propiedades de normalizeForDuplicates', () => {
  it('es idempotente con cualquier texto', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 60 }), (text) => {
        const once = normalizeForDuplicates(text);
        expect(normalizeForDuplicates(once)).toBe(once);
      }),
      { numRuns: 1000 },
    );
  });

  it('es idempotente con HTML, entidades, cloze y símbolos', () => {
    const piece = fc.constantFrom(
      '<p>',
      '</p>',
      '<br>',
      '<b>',
      '</b>',
      '&amp;',
      '&lt;',
      '&gt;',
      '&aacute;',
      '&#241;',
      '&nbsp;',
      '{{c1::',
      '{{c2::',
      '::',
      '}}',
      '<',
      '>',
      '&',
      ';',
      ' ',
      'metformina',
      'b',
      'br',
      '/',
      // Etiquetas escapadas, que son texto y no deben volverse etiquetas en una segunda pasada
      '&lt;b&gt;',
      '&lt;/p&gt;',
      '&#60;br&#62;',
      '&#x3C;span class=x&#x3E;',
      'Ñandú',
      '40%',
      '<img src="a.png">',
      '<!--x-->',
    );
    fc.assert(
      fc.property(fc.array(piece, { maxLength: 14 }), (pieces) => {
        const once = normalizeForDuplicates(pieces.join(''));
        expect(normalizeForDuplicates(once)).toBe(once);
      }),
      { numRuns: 1000 },
    );
  });

  it('la clave no tiene mayúsculas, acentos, puntuación, etiquetas ni espacios de más', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 60 }), (text) => {
        const key = normalizeForDuplicates(text);
        expect(key).toBe(key.trim());
        expect(key).not.toMatch(/\s{2,}/);
        expect(key).not.toMatch(/[\p{P}\p{M}<>]/u);
      }),
      { numRuns: 500 },
    );
  });

  it('ignora las mayúsculas', () => {
    fc.assert(
      fc.property(sentence, (words) => {
        const text = words.join(' ');
        expect(normalizeForDuplicates(text.toUpperCase())).toBe(normalizeForDuplicates(text));
      }),
      { numRuns: 300 },
    );
  });

  it('ignora los acentos y la ñ', () => {
    fc.assert(
      fc.property(
        sentence,
        fc.array(fc.boolean(), { minLength: 80, maxLength: 80 }),
        (words, mask) => {
          const text = words.join(' ');
          let position = 0;
          const accented = text.replace(/[aeioun]/g, (letter) => {
            position += 1;
            return mask[position] ? (ACCENTED[letter] ?? letter) : letter;
          });
          expect(normalizeForDuplicates(accented)).toBe(normalizeForDuplicates(text));
          expect(normalizeForDuplicates(accented.normalize('NFD'))).toBe(
            normalizeForDuplicates(text),
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it('ignora la puntuación, también la que va dentro de una palabra', () => {
    fc.assert(
      fc.property(
        sentence,
        fc.array(fc.tuple(fc.nat(100), fc.constantFrom(...PUNCTUATION)), { maxLength: 12 }),
        (words, insertions) => {
          const text = words.join(' ');
          let punctuated = text;
          for (const [at, mark] of insertions) {
            const place = at % (punctuated.length + 1);
            punctuated = punctuated.slice(0, place) + mark + punctuated.slice(place);
          }
          expect(normalizeForDuplicates(punctuated)).toBe(normalizeForDuplicates(text));
        },
      ),
      { numRuns: 400 },
    );
  });

  it('ignora el HTML y las entidades', () => {
    fc.assert(
      fc.property(
        sentence,
        fc.array(fc.constantFrom(...INLINE_TAGS), { minLength: 10, maxLength: 10 }),
        fc.array(fc.constantFrom(...SEPARATORS), { minLength: 10, maxLength: 10 }),
        fc.array(fc.boolean(), { minLength: 10, maxLength: 10 }),
        (words, tags, separators, encoded) => {
          const html = words
            .map((item, position) => {
              const tag = tags[position] ?? 'b';
              const letters = encoded[position]
                ? Array.from(item)
                    .map((char) => `&#${char.codePointAt(0)};`)
                    .join('')
                : item;
              return `<${tag}>${letters}</${tag}>`;
            })
            .reduce((all, piece, position) => all + (separators[position] ?? ' ') + piece, '<p>');
          expect(normalizeForDuplicates(`${html}</p>`)).toBe(
            normalizeForDuplicates(words.join(' ')),
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it('dos textos que solo difieren en mayúsculas, acentos, puntuación y HTML tienen la misma clave', () => {
    fc.assert(
      fc.property(
        sentence,
        fc.constantFrom(...PUNCTUATION),
        fc.constantFrom(...INLINE_TAGS),
        (words, mark, tag) => {
          const plain = words.join(' ');
          const dressed = `<div>${words
            .map(
              (item) => `<${tag}>${mark}${item.replaceAll('n', 'ñ').toUpperCase()}${mark}</${tag}>`,
            )
            .join(' ')}</div>`;
          expect(duplicateKey({ kind: 'basic', front: dressed })).toBe(
            duplicateKey({ kind: 'basic', front: plain }),
          );
          expect(duplicateKey({ kind: 'cloze', text: dressed })).toBe(
            duplicateKey({ kind: 'basic_reverse', front: plain }),
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it('un cloze tiene la misma clave que su texto con las respuestas puestas, sin la pista', () => {
    fc.assert(
      fc.property(sentence, sentence, sentence, (before, answer, after) => {
        const cloze = `${before.join(' ')} {{c1::${answer.join(' ')}::pista}} ${after.join(' ')}`;
        const flat = [...before, ...answer, ...after].join(' ');
        expect(normalizeForDuplicates(cloze)).toBe(normalizeForDuplicates(flat));
      }),
      { numRuns: 200 },
    );
  });
});

describe('propiedades del índice contra una búsqueda por fuerza bruta', () => {
  const VOCABULARY = [
    'alfa',
    'beta',
    'gama',
    'delta',
    'eps',
    'zeta',
    'eta',
    'theta',
    'iota',
    'kappa',
  ];
  const text = fc
    .array(fc.constantFrom(...VOCABULARY), { minLength: 1, maxLength: 9 })
    .map((words) => words.join(' '));

  function reference(
    candidate: string,
    notes: readonly DuplicateNote[],
    threshold: number,
  ): { exact: string[]; near: string[] } {
    const words = (value: string) => new Set(normalizeForDuplicates(value).split(' '));
    const own = words(candidate);
    const ownKey = normalizeForDuplicates(candidate);
    const exact: string[] = [];
    const near: string[] = [];
    for (const note of notes) {
      const front = note.kind === 'cloze' ? note.text : note.front;
      if (note.deletedAt) continue;
      if (normalizeForDuplicates(front) === ownKey) {
        exact.push(note.id);
        continue;
      }
      const other = words(front);
      const shared = [...own].filter((item) => other.has(item)).length;
      if (shared / (own.size + other.size - shared) >= threshold) near.push(note.id);
    }
    return { exact, near };
  }

  it('encuentra exactamente los mismos exactos y casi iguales que comparar contra todas', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(text, fc.boolean()), { minLength: 0, maxLength: 40 }),
        text,
        fc.constantFrom(0.3, 0.5, 0.66, 0.75, 0.85, 0.9, 1),
        (rows, candidate, threshold) => {
          const notes: DuplicateNote[] = rows.map(([front, deleted], position) => ({
            id: `n${position}`,
            kind: 'basic',
            front,
            deletedAt: deleted ? '2026-10-07T00:00:00.000Z' : null,
          }));
          const result = findDuplicates(
            { kind: 'basic', front: candidate },
            buildDuplicateIndex(notes),
            {
              nearSimilarity: threshold,
              maxMatches: 1000,
            },
          );
          const expected = reference(candidate, notes, threshold);
          expect(result.exact.map((match) => match.id)).toEqual(expected.exact);
          expect([...result.near.map((match) => match.id)].sort()).toEqual(
            [...expected.near].sort(),
          );
          expect(result.totalExact).toBe(expected.exact.length);
          expect(result.totalNear).toBe(expected.near.length);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('la similitud de cada coincidencia está entre el umbral y 1 y va de mayor a menor', () => {
    fc.assert(
      fc.property(
        fc.array(text, { maxLength: 40 }),
        text,
        fc.constantFrom(0.5, 0.85),
        (fronts, candidate, threshold) => {
          const notes = fronts.map((front, position): DuplicateNote => ({
            id: `n${position}`,
            kind: 'basic',
            front,
          }));
          const { near } = findDuplicates(
            { kind: 'basic', front: candidate },
            buildDuplicateIndex(notes),
            { nearSimilarity: threshold, maxMatches: 1000 },
          );
          for (const match of near) {
            expect(match.similarity).toBeGreaterThanOrEqual(threshold);
            expect(match.similarity).toBeLessThanOrEqual(1);
          }
          const sorted = [...near].sort((a, b) => b.similarity - a.similarity);
          expect(near.map((match) => match.similarity)).toEqual(
            sorted.map((match) => match.similarity),
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
