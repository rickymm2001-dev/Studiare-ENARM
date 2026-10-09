/**
 * Núcleo de anclaje (D-098).
 *
 * Qué hace. Las funciones puras que comparan un texto generado contra el texto de donde dice que
 * sale. Normalizan el texto, buscan una cita tal cual, sacan cifras y fármacos. Las usan el
 * validador de tarjetas, las guardas de los motores de IA y el servidor.
 * Entradas. Cadenas de texto.
 * Salidas. Texto comparable, listas de cifras y de fármacos, y si una cita aparece en la fuente.
 * Método. Sin importaciones ni alias, para que el servidor las cargue por ruta relativa sin
 * transpilar nada. No hay estado ni red.
 * Umbrales. Ninguno. Los umbrales viven en quien las llama.
 */

// ---------------------------------------------------------------------------------------------
// Texto comparable

/** Minúsculas, sin acentos, con comillas y guiones unificados y los espacios colapsados */
export function normalizeForMatch(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .toLowerCase()
      .replace(/­/g, '')
      .replace(/[‘’‚′]/g, "'")
      .replace(/[“”„″]/g, '"')
      .replace(/[‐‑‒–—−]/g, '-')
      // Una palabra partida por un guion al final del renglón vuelve a ser una sola
      .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, '$1$2')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function wordsOf(text: string): string[] {
  return normalizeForMatch(text).match(/\p{L}{2,}/gu) ?? [];
}

/** Si la cita aparece tal cual en el texto, sin importar mayúsculas, acentos ni espacios */
export function containsQuote(source: string, quote: string): boolean {
  const needle = normalizeForMatch(quote);
  return needle !== '' && normalizeForMatch(source).includes(needle);
}

// ---------------------------------------------------------------------------------------------
// Cifras y fármacos

/** Cifras de un texto como texto normalizado, con la coma decimal convertida a punto */
export function numbersIn(text: string): string[] {
  const cleaned = text.replace(/\{\{c\d+::/g, ' ');
  const found = cleaned.match(/(?<![\p{L}\d.,])\d+(?:[.,]\d+)*(?!\d)/gu) ?? [];
  return [
    ...new Set(
      found.map((token) => token.replace(/,(?=\d{1,2}(?!\d))/g, '.').replace(/[.,]$/, '')),
    ),
  ];
}

const DRUG_LEXICON = new Set(
  [
    'metformina',
    'insulina',
    'aspirina',
    'warfarina',
    'heparina',
    'enoxaparina',
    'furosemida',
    'hidroclorotiazida',
    'clortalidona',
    'espironolactona',
    'digoxina',
    'amiodarona',
    'adrenalina',
    'epinefrina',
    'norepinefrina',
    'dopamina',
    'dobutamina',
    'atropina',
    'morfina',
    'fentanilo',
    'tramadol',
    'paracetamol',
    'ibuprofeno',
    'naproxeno',
    'diclofenaco',
    'ketorolaco',
    'omeprazol',
    'ranitidina',
    'ceftriaxona',
    'cefalexina',
    'amoxicilina',
    'ampicilina',
    'penicilina',
    'azitromicina',
    'claritromicina',
    'doxiciclina',
    'vancomicina',
    'gentamicina',
    'amikacina',
    'clindamicina',
    'metronidazol',
    'ciprofloxacino',
    'levofloxacino',
    'rifampicina',
    'isoniazida',
    'etambutol',
    'pirazinamida',
    'oxitocina',
    'misoprostol',
    'metilergonovina',
    'nifedipino',
    'labetalol',
    'hidralazina',
    'metildopa',
    'nitroglicerina',
    'nitroprusiato',
    'salbutamol',
    'ipratropio',
    'budesonida',
    'prednisona',
    'prednisolona',
    'dexametasona',
    'hidrocortisona',
    'metilprednisolona',
    'levotiroxina',
    'metimazol',
    'propiltiouracilo',
    'litio',
    'haloperidol',
    'risperidona',
    'olanzapina',
    'fluoxetina',
    'sertralina',
    'diazepam',
    'lorazepam',
    'midazolam',
    'fenitoina',
    'carbamazepina',
    'valproato',
    'levetiracetam',
    'naloxona',
    'flumazenil',
    'glucagon',
    'alopurinol',
    'colchicina',
    'metotrexato',
    'ciclofosfamida',
    'tamoxifeno',
    'sulfato',
    'bicarbonato',
    'gluconato',
    'ondansetron',
    'metoclopramida',
    'loperamida',
    'tamsulosina',
    'finasterida',
    'sildenafil',
    'clopidogrel',
    'ticagrelor',
    'alteplasa',
    'tenecteplasa',
    'surfactante',
    'cafeina',
    'glibenclamida',
    'glimepirida',
    'glipizida',
    'pioglitazona',
    'acarbosa',
    'cefazolina',
    'ceftazidima',
    'cefotaxima',
    'cefepime',
    'cefuroxima',
    'meropenem',
    'imipenem',
    'eritromicina',
    'tetraciclina',
    'aciclovir',
    'oseltamivir',
    'rituximab',
    'imatinib',
  ].map((name) => name),
);

// Terminaciones de nombres de fármacos. Solo las específicas, para no confundir un fármaco con una
// palabra común como hormona, alcohol o colesterol
const DRUG_SUFFIX =
  /(?:olol|pril|sartan|statina|micina|cilina|ciclina|oxacino|prazol|tidina|dipino|moterol|meterol|fibrato|gliptina|gliflozina|parina|xaban|tinib|setron|zolam|barbital|caina|profeno|coxib|triptan|platino|rubicina|taxel|fosfamida|vudina|penem|mab|azol|vir)$/;

/** Fármacos que menciona un texto, normalizados y sin repetir */
export function drugsIn(text: string): string[] {
  const found = new Set<string>();
  for (const word of wordsOf(text.replace(/\{\{c\d+::/g, ' '))) {
    if (word.length < 4) continue;
    if (DRUG_LEXICON.has(word) || (word.length >= 7 && DRUG_SUFFIX.test(word))) found.add(word);
  }
  return [...found];
}

// ---------------------------------------------------------------------------------------------
// Revisiones de anclaje

export const MIN_QUOTE_CHARS = 20;
export const MIN_QUOTE_WORDS = 4;
export const ANSWER_GROUNDED_RATIO = 0.6;

export type GroundingIssue =
  | 'quote_too_short'
  | 'quote_not_in_source'
  | 'number_not_in_quote'
  | 'drug_not_in_quote'
  | 'answer_not_grounded';

/** Si la cita es lo bastante larga y aparece tal cual en la fuente. Lista vacía es que pasó */
export function quoteIssues(quote: string, source: string): GroundingIssue[] {
  const clean = quote.trim();
  if (clean.length < MIN_QUOTE_CHARS || wordsOf(clean).length < MIN_QUOTE_WORDS) {
    return ['quote_too_short'];
  }
  return containsQuote(source, clean) ? [] : ['quote_not_in_source'];
}

/** Cifras y fármacos de `content` que no aparecen en `support`. Un texto nuevo no puede traer datos nuevos */
export function unsupportedFacts(
  content: string,
  support: string,
): { numbers: string[]; drugs: string[] } {
  const supportedNumbers = new Set(numbersIn(support));
  const supportedDrugs = new Set(drugsIn(support));
  return {
    numbers: numbersIn(content).filter((number) => !supportedNumbers.has(number)),
    drugs: drugsIn(content).filter((drug) => !supportedDrugs.has(drug)),
  };
}

/** Qué parte de las palabras de la respuesta están en el texto de apoyo. Sin palabras evaluables da 1 */
export function groundedRatio(answer: string, support: string): number {
  const answerWords = wordsOf(answer).filter((word) => word.length >= 4);
  if (answerWords.length === 0) return 1;
  const inSupport = new Set(wordsOf(support));
  return answerWords.filter((word) => inSupport.has(word)).length / answerWords.length;
}
