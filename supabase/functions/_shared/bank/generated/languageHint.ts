// Generado por scripts/content/sync-bank-shared.ts desde src/data/content/languageHint.ts. No lo edites a mano. Cambia el
// original y corre npm run bank:shared.
// Aviso de idioma dudoso (B13, hallazgo 2 de la revisión independiente). El idioma de una pregunta sale de
// su rama y de la celda Idioma, y la fuente y la licencia del texto solo se piden si es inglés. Un texto de
// lectura en inglés que llega a una rama de español con el Idioma vacío entra como español, sin pedir
// fuente ni licencia. Esta lectura detecta ese caso para que el reporte avise. Nunca rechaza ni cambia
// el idioma (D-080): el Sheet puede traer un texto en español con términos en inglés, y quien decide es el
// médico. Por eso solo avisa cuando el texto es largo y, además de tener muchas palabras vacías del inglés,
// casi no tiene las del español. Funciones puras, sin Node ni React. Lo comparte la función bank-sync con
// una copia generada (scripts/content/sync-bank-shared.ts)

/** Desde cuántos caracteres un texto cuenta como largo. Uno más corto, como un término, no se juzga */
export const LANGUAGE_HINT_MIN_CHARS = 200;
/** De las palabras del texto, la parte mínima que son palabras vacías del inglés. La prosa en inglés pasa de 0.25 */
export const LANGUAGE_HINT_MIN_ENGLISH_SHARE = 0.2;
/** La parte máxima de palabras vacías del español. La prosa en español pasa de 0.2, y un texto en español con términos o frases en inglés casi nunca baja de eso */
export const LANGUAGE_HINT_MAX_SPANISH_SHARE = 0.05;

// Solo palabras que no son del otro idioma. Quedan fuera a, e, o, no, he, has, can y or, que existen en los
// dos idiomas o son siglas comunes en medicina (OR de odds ratio, ALL de leucemia linfoblástica aguda)
const ENGLISH_WORDS: ReadonlySet<string> = new Set(
  (
    'the of and is are was were be been to in that this these those with for from by on at as it its ' +
    'which who whom what when where how if than then there their they them she his her you your we our ' +
    'will would should might also more most other some such only into about after before during between ' +
    'because while any each both many much very all but not have had'
  ).split(' '),
);

const SPANISH_WORDS: ReadonlySet<string> = new Set(
  (
    'de la el en y con que los las un una por se del al para su es lo como más pero sus ya este esta ' +
    'entre cuando muy sin sobre también hasta hay donde desde todo durante nos ni contra otros ese ante ' +
    'antes son fue ser han tiene tienen porque'
  ).split(' '),
);

/** Cuántas palabras tiene el texto y qué parte son palabras vacías del inglés y del español */
export function wordShares(text: string): { words: number; english: number; spanish: number } {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  let english = 0;
  let spanish = 0;
  for (const word of words) {
    if (ENGLISH_WORDS.has(word)) english += 1;
    if (SPANISH_WORDS.has(word)) spanish += 1;
  }
  const total = Math.max(1, words.length);
  return { words: words.length, english: english / total, spanish: spanish / total };
}

/**
 * Si un texto largo parece estar en inglés. Un texto corto, uno en español con términos en inglés, una lista
 * de cifras y siglas o uno mezclado no avisan. Se prefiere no avisar a avisar de más, porque el aviso solo
 * le pide al médico que mire el Idioma
 */
export function looksEnglish(text: string): boolean {
  if (text.trim().length <= LANGUAGE_HINT_MIN_CHARS) return false;
  const { english, spanish } = wordShares(text);
  return english >= LANGUAGE_HINT_MIN_ENGLISH_SHARE && spanish <= LANGUAGE_HINT_MAX_SPANISH_SHARE;
}
