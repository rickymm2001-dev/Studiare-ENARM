// Propiedades del cloze anidado con fast-check. Se arma un texto con huecos anidados a partir de una
// lista de fichas y, a la vez, un modelo del texto que no usa el analizador. Con el modelo se
// comprueba, para cada número de hueco, que la cara de la pregunta no deja ver nada de lo que
// queda oculto y que la cara de la respuesta lo muestra todo.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clozeHoles, clozeOpenings, parseCloze, renderClozeFace } from './cloze';

const render = (text: string, ordinal: number, reveal: boolean) =>
  renderClozeFace(parseCloze(text).nodes, ordinal, reveal);

interface Leaf {
  type: 'text';
  /** Palabra única, w12w, para buscarla en lo que se pinta */
  word: string;
  content: string;
}
interface Hole {
  type: 'hole';
  ordinal: number;
  hint: string | undefined;
  children: Item[];
}
type Item = Leaf | Hole;

type Token =
  | { t: 'text'; deco: '' | '{' | '}' | ':' }
  | { t: 'open'; ordinal: number }
  | { t: 'close'; hint: boolean };

const tokenArbitrary: fc.Arbitrary<Token> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({
      t: fc.constant('text' as const),
      deco: fc.constantFrom('' as const, '{' as const, '}' as const, ':' as const),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      t: fc.constant('open' as const),
      ordinal: fc.integer({ min: 1, max: 3 }),
    }),
  },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('close' as const), hint: fc.boolean() }) },
);

/** Texto de una ficha con llaves y dos puntos sueltos, que nunca forman {{, }} ni :: con lo vecino */
function leafOf(id: number, deco: '' | '{' | '}' | ':'): Leaf {
  const word = `w${id}w`;
  const content = {
    '': ` ${word} `,
    '{': ` ${word} {`,
    '}': `} ${word} `,
    ':': ` a: ${word} `,
  }[deco];
  return { type: 'text', word, content };
}

/**
 * Arma el texto y su modelo. Los huecos que quedan abiertos se cierran al final si closeAll es true
 * y si no se dejan sin cerrar. Un close sin hueco abierto no hace nada
 */
function build(tokens: readonly Token[], closeAll: boolean) {
  const root: Item[] = [];
  const stack: Hole[] = [];
  const holes: Hole[] = [];
  let source = '';
  let counter = 0;
  const into = (item: Item) => {
    (stack.at(-1)?.children ?? root).push(item);
  };
  for (const token of tokens) {
    if (token.t === 'text') {
      const leaf = leafOf((counter += 1), token.deco);
      into(leaf);
      source += leaf.content;
    } else if (token.t === 'open') {
      const hole: Hole = { type: 'hole', ordinal: token.ordinal, hint: undefined, children: [] };
      into(hole);
      holes.push(hole);
      stack.push(hole);
      source += `{{c${token.ordinal}::`;
    } else if (stack.length > 0) {
      const hole = stack.pop();
      if (token.hint && hole) {
        counter += 1;
        hole.hint = `pista${counter}`;
        source += `::${hole.hint}`;
      }
      source += '}}';
    }
  }
  if (closeAll) source += '}}'.repeat(stack.length);
  return { source, root, holes, open: stack.length };
}

/** Lo que debe pintar cada cara, calculado desde el modelo con la regla de Anki escrita a mano */
function expected(
  items: readonly Item[],
  ordinal: number,
  reveal: boolean,
  marked = false,
): string {
  return items
    .map((item) => {
      if (item.type === 'text') return item.content;
      if (item.ordinal !== ordinal) return expected(item.children, ordinal, reveal, marked);
      if (!reveal) return `<mark>[${item.hint ?? '…'}]</mark>`;
      const inside = expected(item.children, ordinal, reveal, true);
      return marked ? inside : `<mark>${inside}</mark>`;
    })
    .join('');
}

/** Cada palabra con los números de los huecos que la rodean */
function wordsWithAncestors(items: readonly Item[], ancestors: readonly number[] = []) {
  const found: { word: string; ancestors: readonly number[] }[] = [];
  for (const item of items) {
    if (item.type === 'text') found.push({ word: item.word, ancestors });
    else found.push(...wordsWithAncestors(item.children, [...ancestors, item.ordinal]));
  }
  return found;
}

const allOrdinals = [1, 2, 3, 4];
const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

describe('propiedades del cloze anidado', () => {
  it('la pregunta nunca deja a la vista lo que queda oculto, con o sin huecos sin cerrar', () => {
    fc.assert(
      fc.property(fc.array(tokenArbitrary, { maxLength: 40 }), fc.boolean(), (tokens, closeAll) => {
        const { source, root } = build(tokens, closeAll);
        for (const ordinal of allOrdinals) {
          const question = render(source, ordinal, false);
          for (const { word, ancestors } of wordsWithAncestors(root)) {
            // Una palabra se ve solo si ningún hueco que la rodea tiene el número que se pregunta
            expect(question.includes(word)).toBe(!ancestors.includes(ordinal));
          }
          // Lo que se ve es exactamente lo que dice la regla, con las pistas en su lugar
          expect(question).toBe(expected(root, ordinal, false));
          // Ninguna marca del hueco queda en pantalla
          expect(question).not.toMatch(/\{\{c\d+::|::pista/);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('la respuesta muestra todo lo que estaba oculto y resalta solo los huecos de ese número', () => {
    fc.assert(
      fc.property(fc.array(tokenArbitrary, { maxLength: 40 }), fc.boolean(), (tokens, closeAll) => {
        const { source, root, holes } = build(tokens, closeAll);
        for (const ordinal of allOrdinals) {
          const answer = render(source, ordinal, true);
          for (const { word } of wordsWithAncestors(root)) expect(answer).toContain(word);
          expect(answer).toBe(expected(root, ordinal, true));
          expect(answer).not.toMatch(/\{\{c\d+::|::pista|pista\d/);
          // Un resalte por cada hueco de ese número que no va dentro de otro del mismo número
          const outermost = holes.filter(
            (hole) => hole.ordinal === ordinal && !isInside(root, hole, ordinal),
          );
          expect(count(answer, /<mark>/g)).toBe(outermost.length);
          expect(count(answer, /<\/mark>/g)).toBe(outermost.length);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('cuenta las aperturas y los huecos completos y nunca lanza un error', () => {
    fc.assert(
      fc.property(fc.array(tokenArbitrary, { maxLength: 40 }), fc.boolean(), (tokens, closeAll) => {
        const { source, holes, open } = build(tokens, closeAll);
        expect(clozeOpenings(source)).toBe(holes.length);
        // Sin cerrar todo, los últimos huecos abiertos no son completos
        expect(clozeHoles(source)).toHaveLength(closeAll ? holes.length : holes.length - open);
      }),
      { numRuns: 500 },
    );
  });
});

/** Si el hueco va dentro de otro con el mismo número */
function isInside(root: readonly Item[], target: Hole, ordinal: number): boolean {
  const visit = (items: readonly Item[], inside: boolean): boolean | undefined => {
    for (const item of items) {
      if (item.type !== 'hole') continue;
      if (item === target) return inside;
      const found = visit(item.children, inside || item.ordinal === ordinal);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return visit(root, false) ?? false;
}

// Texto cualquiera, con llaves y dos puntos por todas partes y sin estructura garantizada
type Fuzz =
  { t: 'word' } | { t: 'open'; ordinal: number } | { t: 'close' } | { t: 'junk'; text: string };

const fuzzArbitrary: fc.Arbitrary<Fuzz> = fc.oneof(
  { weight: 4, arbitrary: fc.constant<Fuzz>({ t: 'word' }) },
  {
    weight: 2,
    arbitrary: fc.record({
      t: fc.constant('open' as const),
      ordinal: fc.integer({ min: 1, max: 3 }),
    }),
  },
  { weight: 3, arbitrary: fc.constant<Fuzz>({ t: 'close' }) },
  {
    weight: 2,
    arbitrary: fc.record({
      t: fc.constant('junk' as const),
      // Ninguno lleva :: porque dentro de un hueco lo que sigue a :: es la pista, y esa sí se ve
      text: fc.constantFrom(
        ' { ',
        ' } ',
        ' {{ ',
        ' {{c ',
        ' {{c1: ',
        ' {{C1 ',
        ' : ',
        '<b>',
        '</b>',
      ),
    }),
  },
);

describe('texto cualquiera, con llaves sueltas y huecos sin cerrar', () => {
  it('nunca deja a la vista una palabra que está dentro de un hueco que se pregunta', () => {
    fc.assert(
      fc.property(fc.array(fuzzArbitrary, { maxLength: 50 }), (tokens) => {
        // Se simula el texto con una pila. Un }} sin hueco abierto es texto normal
        const stack: number[] = [];
        const words: { word: string; hiddenFor: ReadonlySet<number> }[] = [];
        let source = '';
        for (const token of tokens) {
          if (token.t === 'word') {
            const word = `w${words.length}w`;
            words.push({ word, hiddenFor: new Set(stack) });
            source += ` ${word} `;
          } else if (token.t === 'open') {
            stack.push(token.ordinal);
            source += ` {{c${token.ordinal}:: `;
          } else if (token.t === 'close') {
            stack.pop();
            source += ' }} ';
          } else {
            source += token.text;
          }
        }
        for (const ordinal of [1, 2, 3, 4]) {
          const question = render(source, ordinal, false);
          const answer = render(source, ordinal, true);
          for (const { word, hiddenFor } of words) {
            expect(question.includes(word)).toBe(!hiddenFor.has(ordinal));
            expect(answer).toContain(word);
          }
          expect(question).not.toMatch(/\{\{c\d+::/);
          expect(answer).not.toMatch(/\{\{c\d+::/);
        }
      }),
      { numRuns: 1000 },
    );
  });
});
