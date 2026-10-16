// El recorte del título de la fuente del texto (B13, hallazgo 4 de la revisión). La versión anterior quitaba una
// letra a la vez y juntaba el título otra vez en cada vuelta, así que costaba más con cada letra de más (medio
// segundo con 8,000 caracteres y 30 con 50,000). La de ahora calcula cuánto cabe y corta una sola vez. Estas
// pruebas comparan la de ahora contra una copia de la anterior, que queda aquí solo como referencia, y miden
// el tiempo con títulos enormes. Todo el texto es simulado.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  composePassageSource,
  PASSAGE_SOURCE_MAX_LENGTH,
  PASSAGE_SOURCE_PREFIX,
  PASSAGE_TITLE_READ_MAX,
  splitPassageSource,
} from './passageSource';

/**
 * Los espacios que cuenta passageSource.ts al leer la fuente (hallazgo 7 de la revisión). El recorte no
 * cambió con eso, así que la versión anterior de aquí abajo usa los mismos para que solo se compare el recorte
 */
const SPACE_CHARS = ' \\t\\n\\v\\f\\r\\u00a0\\ufeff';

/** Un texto de una sola línea, sin puntos al final. Igual que el de passageSource.ts */
function tidy(text: string): string {
  return text
    .replace(new RegExp(`[${SPACE_CHARS}]+`, 'g'), ' ')
    .replace(/^ | $/g, '')
    .replace(/[. ]+$/, '');
}

/**
 * La versión anterior de composePassageSource, tal cual estaba. Quita una letra a la vez y arma la
 * referencia completa en cada vuelta. Es la referencia del comportamiento y nada más la usa esta prueba
 */
function composeOneLetterAtATime(parts: {
  title: string;
  license: string;
  url: string;
}): string | null {
  const license = tidy(parts.license);
  const written = parts.url.trim();
  const url = new RegExp(`^https?://[^${SPACE_CHARS}]+$`, 'i').test(written) ? written : '';
  let title = tidy(parts.title);
  if (title === '' && license === '' && url === '') return null;
  const build = (shownTitle: string) => {
    const body = [shownTitle, license].filter((part) => part !== '').join('. ');
    const sentence = body === '' ? '' : `${body}.`;
    return `${PASSAGE_SOURCE_PREFIX}${[sentence, url].filter((part) => part !== '').join(' ')}`;
  };
  let reference = build(title);
  if (reference.length > PASSAGE_SOURCE_MAX_LENGTH && title !== '') {
    const letters = Array.from(title);
    while (letters.length > 0 && build(`${letters.join('')}…`).length > PASSAGE_SOURCE_MAX_LENGTH)
      letters.pop();
    title = letters.length > 0 ? `${tidy(letters.join(''))}…` : '';
    reference = build(title);
  }
  return reference;
}

const LICENSES = [
  'CC BY',
  'CC BY-SA',
  'CC0',
  'Dominio público',
  'Texto propio del equipo Studiare',
];
const URLS = [
  '',
  'https://example.org/a',
  'https://example.org/un/camino/largo/de/una/pagina?x=1&y=2#parte',
  `https://example.org/${'a'.repeat(120)}`,
];

/** Un título de palabras separadas por espacios o saltos, con puntos, acentos y algún carácter fuera del plano básico */
const words = fc.array(
  fc.constantFrom(
    'Título',
    'muy',
    'largo.',
    'de',
    'artículo,',
    'MedlinePlus.gov',
    '(NLM)',
    'niños',
    '🩺',
    'Smith J.',
    'et al.',
    '…',
    'a',
  ),
  { minLength: 0, maxLength: 120 },
);
const separator = fc.constantFrom(' ', ' ', ' ', '  ', '\n', ' \n ');
const titleOf = fc
  .tuple(words, fc.array(separator, { minLength: 120, maxLength: 120 }))
  .map(([list, seps]) => list.map((word, at) => `${word}${seps[at] ?? ' '}`).join(''));

describe('recortar el título de la fuente (300 caracteres)', () => {
  it('da lo mismo que la versión que quitaba una letra a la vez, con cualquier título hasta 500 caracteres', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          titleOf,
          fc.string({ maxLength: 500 }),
          fc.string({ unit: 'binary', maxLength: 400 }),
        ),
        fc.oneof(fc.constantFrom(...LICENSES), fc.string({ maxLength: 40 })),
        fc.constantFrom(...URLS),
        (title, license, url) => {
          if (Array.from(title).length > PASSAGE_TITLE_READ_MAX) return;
          expect(composePassageSource({ title, license, url })).toBe(
            composeOneLetterAtATime({ title, license, url }),
          );
        },
      ),
      { numRuns: 4000 },
    );
  });

  it('da lo mismo con un título de miles de caracteres, que es cuando se recorta', () => {
    // La versión anterior es cuadrática, así que con más de unos 3,000 caracteres tardaría minutos
    for (const repeat of [6, 20, 65]) {
      for (const license of LICENSES) {
        for (const url of URLS) {
          const title = 'Título muy largo de un artículo, con puntos. '.repeat(repeat);
          expect(composePassageSource({ title, license, url }), `${repeat} ${license}`).toBe(
            composeOneLetterAtATime({ title, license, url }),
          );
        }
      }
    }
  });

  it('en cada largo alrededor del límite da lo mismo y la referencia nunca pasa de 300', () => {
    const url = 'https://example.org/a';
    for (let length = 230; length <= 330; length += 1) {
      for (const filler of ['a', '🩺', 'á b']) {
        // Por puntos de código, para que el título de prueba no nazca con un carácter partido
        const title = Array.from(filler.repeat(length)).slice(0, length).join('');
        const parts = { title, license: 'CC BY', url };
        const reference = composePassageSource(parts);
        expect(reference, `${length} ${filler}`).toBe(composeOneLetterAtATime(parts));
        expect(reference?.length ?? 0).toBeLessThanOrEqual(PASSAGE_SOURCE_MAX_LENGTH);
        // Un carácter fuera del plano básico nunca queda partido por la mitad
        expect(reference).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
        expect(reference).not.toMatch(/(?<![\ud800-\udbff])[\udc00-\udfff]/);
      }
    }
  });

  it('un título que cabe queda entero y sin puntos suspensivos', () => {
    const title = 'Heart Attack, MedlinePlus.gov (NLM)';
    expect(composePassageSource({ title, license: 'Dominio público', url: URLS[1] ?? '' })).toBe(
      `Fuente del texto. ${title}. Dominio público. https://example.org/a`,
    );
  });

  it('da lo mismo que antes sobre las fuentes de la lista compartida con la base (EN9)', () => {
    const file = resolve(import.meta.dirname, '../../../tests/fixtures/passage-sources.json');
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
      cases: { name: string; refs: string[] }[];
    };
    let compared = 0;
    for (const item of parsed.cases) {
      for (const ref of item.refs) {
        const parts = splitPassageSource(ref);
        if (parts === null) continue;
        const input = { title: parts.title, license: parts.licenseText, url: parts.url };
        expect(composePassageSource(input), item.name).toBe(composeOneLetterAtATime(input));
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThanOrEqual(30);
  });

  it('un título larguísimo se arma en milisegundos y no en medio minuto', () => {
    const url = 'https://example.org/a';
    for (const length of [8_000, 50_000, 500_000]) {
      const title = 'Título muy largo '.repeat(Math.ceil(length / 17)).slice(0, length);
      const started = performance.now();
      const reference = composePassageSource({ title, license: 'CC BY-SA', url });
      const elapsed = performance.now() - started;
      expect(reference?.length, String(length)).toBeLessThanOrEqual(PASSAGE_SOURCE_MAX_LENGTH);
      expect(reference).toContain('…. CC BY-SA. ');
      expect(reference?.endsWith(` CC BY-SA. ${url}`)).toBe(true);
      // La anterior tardaba 0.5 s con 8,000 y 30 s con 50,000. Esto le da cien veces más de lo que usa
      expect(elapsed, `${length} caracteres`).toBeLessThan(250);
    }
  });

  it('un título de puros puntos o espacios tampoco se vuelve lento', () => {
    // Quitar los puntos finales con una expresión regular sobre 50,000 puntos y una letra al final es
    // cuadrático, así que la celda se recorta antes de leerla
    for (const title of [
      `${'.'.repeat(50_000)}x`,
      `${' .'.repeat(25_000)}x`,
      '\n'.repeat(50_000),
    ]) {
      const started = performance.now();
      composePassageSource({ title, license: 'CC BY', url: 'https://example.org/a' });
      expect(performance.now() - started).toBeLessThan(250);
    }
  });

  it('solo lee los primeros caracteres de la celda del título', () => {
    const head = 'Título al principio. '.repeat(40).slice(0, PASSAGE_TITLE_READ_MAX);
    const long = composePassageSource({
      title: `${head}${'z'.repeat(40_000)}`,
      license: 'CC BY',
      url: 'https://example.org/a',
    });
    expect(long).toBe(
      composePassageSource({ title: head, license: 'CC BY', url: 'https://example.org/a' }),
    );
    expect(long).not.toContain('zzz');
  });
});
