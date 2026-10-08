/**
 * Tarjetas desde un texto del alumno (D-085, fila 10, opción B).
 *
 * Qué hace. Tres cosas puras para el generador de tarjetas con IA. Divide un texto largo en
 * secciones, revisa cada tarjeta que propone un modelo contra el texto de donde dice que sale, y
 * trae un generador simulado y determinista que se usa cuando no hay clave de IA.
 * Entradas. El texto del alumno, ya sin datos personales, y las tarjetas propuestas.
 * Salidas. Secciones, la lista de problemas de cada tarjeta y tarjetas propuestas de ejemplo.
 * Método. La regla es que nada que un modelo invente llega al alumno. Cada tarjeta cita una frase
 * y esa frase tiene que existir tal cual en el texto, sin importar mayúsculas, espacios ni acentos
 * de más. Las cifras, dosis y fármacos de la tarjeta tienen que estar en la cita, y la respuesta
 * tiene que apoyarse en las palabras de la cita. Una controversia solo puede citar los textos de la
 * lista cerrada y nunca cambia el texto de la tarjeta, porque la IA señala y no corrige.
 * Umbrales. Cita de 20 caracteres y 4 palabras como mínimo, secciones de hasta 1,800 caracteres,
 * de 5 a 7 tarjetas por sección y respuesta apoyada en la cita desde 60% de sus palabras.
 */
import { ACADEMIC_SOURCE_KEYS, type AcademicSourceKey } from '@/config/academicSources';
import { clozeHoles, clozeOpenings } from './cloze';

export const MIN_QUOTE_CHARS = 20;
export const MIN_QUOTE_WORDS = 4;
export const SECTION_MAX_CHARS = 1800;
export const SECTION_MIN_CHARS = 350;
export const SECTIONS_MAX = 40;
export const CARDS_PER_SECTION_MAX = 7;
export const ANSWER_GROUNDED_RATIO = 0.6;
export const FIELD_MAX_CHARS = 3000;
export const CONTROVERSY_REASON_MIN = 20;
export const CONTROVERSY_REASON_MAX = 600;

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
// Revisión de una tarjeta propuesta

export type CardIssue =
  | 'empty_field'
  | 'too_long'
  | 'cloze_invalid'
  | 'quote_too_short'
  | 'quote_not_in_source'
  | 'number_not_in_quote'
  | 'drug_not_in_quote'
  | 'answer_not_grounded'
  | 'controversy_reason_missing'
  | 'controversy_source_missing'
  | 'controversy_source_not_allowed';

export interface ProposedControversy {
  reason: string;
  sources: readonly { key: string; locator?: string | null }[];
}

export interface ProposedCard {
  kind: 'basic' | 'cloze';
  /** Frente, o el texto con huecos si es cloze */
  front: string;
  /** Reverso, o la nota extra si es cloze */
  back: string;
  quote: string;
  controversy?: ProposedControversy | null;
}

/** Lo que la tarjeta responde, que es lo que tiene que apoyarse en la cita */
function answerOf(card: ProposedCard): string {
  if (card.kind === 'basic') return card.back;
  return clozeHoles(card.front)
    .map((hole) => hole.answer)
    .join(' ');
}

const ALLOWED_KEYS = new Set<string>(ACADEMIC_SOURCE_KEYS);

/** Los problemas de una tarjeta contra el texto de donde dice que sale. Sin problemas es que pasó */
export function checkCard(card: ProposedCard, source: string): CardIssue[] {
  const issues: CardIssue[] = [];
  const add = (issue: CardIssue) => {
    if (!issues.includes(issue)) issues.push(issue);
  };

  if (card.front.trim() === '' || (card.kind === 'basic' && card.back.trim() === '')) {
    add('empty_field');
  }
  if (card.front.length > FIELD_MAX_CHARS || card.back.length > FIELD_MAX_CHARS) add('too_long');
  if (card.kind === 'cloze') {
    const opened = clozeOpenings(card.front);
    const complete = clozeHoles(card.front).filter(
      (hole) => hole.ordinal >= 1 && hole.ordinal <= 100 && hole.answer.trim() !== '',
    );
    if (opened === 0 || complete.length !== opened) add('cloze_invalid');
  }

  const quote = card.quote.trim();
  if (quote.length < MIN_QUOTE_CHARS || wordsOf(quote).length < MIN_QUOTE_WORDS) {
    add('quote_too_short');
  } else if (!containsQuote(source, quote)) {
    add('quote_not_in_source');
  }

  // Cifras, dosis y fármacos de la tarjeta, que deben estar todos en la cita
  const content = `${card.front} ${card.back}`;
  const quoted = new Set(numbersIn(quote));
  if (numbersIn(content).some((number) => !quoted.has(number))) add('number_not_in_quote');
  const quotedDrugs = new Set(drugsIn(quote));
  if (drugsIn(content).some((drug) => !quotedDrugs.has(drug))) add('drug_not_in_quote');

  const answerWords = wordsOf(answerOf(card)).filter((word) => word.length >= 4);
  if (answerWords.length > 0) {
    const inQuote = new Set(wordsOf(quote));
    const grounded = answerWords.filter((word) => inQuote.has(word)).length;
    if (grounded / answerWords.length < ANSWER_GROUNDED_RATIO) add('answer_not_grounded');
  }

  const controversy = card.controversy;
  if (controversy) {
    const reason = controversy.reason.trim();
    if (reason.length < CONTROVERSY_REASON_MIN || reason.length > CONTROVERSY_REASON_MAX) {
      add('controversy_reason_missing');
    }
    if (controversy.sources.length === 0) add('controversy_source_missing');
    if (controversy.sources.some((entry) => !ALLOWED_KEYS.has(entry.key))) {
      add('controversy_source_not_allowed');
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------------------------
// Secciones

export interface SourceSection {
  index: number;
  /** El título que la precede en el texto, si lo tiene */
  title: string | null;
  text: string;
}

const SENTENCE_BREAK = /(?<=[.!?;])\s+(?=[\p{Lu}¿¡\d])/u;

function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(SENTENCE_BREAK)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '');
}

/** Un párrafo corto sin punto final y seguido de más texto es un título */
function looksLikeHeading(paragraph: string): boolean {
  const line = paragraph.trim();
  return line.length > 0 && line.length <= 80 && !/[.;,]$/.test(line) && !line.includes('\n');
}

/**
 * Parte un texto en secciones de tamaño manejable. Junta párrafos hasta el máximo, parte un párrafo
 * demasiado largo por oraciones y toma los títulos sueltos como nombre de la sección que sigue
 */
export function splitSections(
  text: string,
  options: { maxChars?: number; minChars?: number; maxSections?: number } = {},
): SourceSection[] {
  const maxChars = options.maxChars ?? SECTION_MAX_CHARS;
  const minChars = options.minChars ?? SECTION_MIN_CHARS;
  const maxSections = options.maxSections ?? SECTIONS_MAX;
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    // Un salto de renglón dentro del párrafo es un espacio, como lo deja un PDF
    .map((paragraph) =>
      paragraph
        .replace(/(\p{L})-\n(\p{L})/gu, '$1$2')
        .replace(/\s*\n\s*/g, ' ')
        .trim(),
    )
    .filter((paragraph) => paragraph !== '');

  const sections: SourceSection[] = [];
  let title: string | null = null;
  let pending: string[] = [];
  let pendingTitle: string | null = null;
  let length = 0;
  const flush = () => {
    if (pending.length === 0) return;
    sections.push({ index: sections.length, title: pendingTitle, text: pending.join('\n\n') });
    pending = [];
    pendingTitle = null;
    length = 0;
  };

  paragraphs.forEach((paragraph, position) => {
    if (looksLikeHeading(paragraph) && position < paragraphs.length - 1) {
      // Un título nuevo cierra la sección anterior si ya tiene lo suficiente
      if (length >= minChars) flush();
      title = paragraph;
      return;
    }
    const pieces = paragraph.length > maxChars ? packSentences(paragraph, maxChars) : [paragraph];
    for (const piece of pieces) {
      if (length > 0 && length + piece.length + 2 > maxChars) flush();
      if (pending.length === 0) pendingTitle = title;
      pending.push(piece);
      length += piece.length + 2;
    }
  });
  flush();
  return sections.slice(0, maxSections);
}

function packSentences(paragraph: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const sentence of splitSentences(paragraph)) {
    // Una oración más larga que el máximo se corta en palabras para que nada se pierda
    for (const chunk of sentence.length > maxChars ? hardSplit(sentence, maxChars) : [sentence]) {
      if (current !== '' && current.length + chunk.length + 1 > maxChars) {
        pieces.push(current);
        current = '';
      }
      current = current === '' ? chunk : `${current} ${chunk}`;
    }
  }
  if (current !== '') pieces.push(current);
  return pieces;
}

function hardSplit(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    if (current !== '' && current.length + word.length + 1 > maxChars) {
      out.push(current);
      current = '';
    }
    current = current === '' ? word : `${current} ${word}`;
  }
  if (current !== '') out.push(current);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Generador simulado

const DEFINITIONS: readonly { pattern: RegExp; front: (subject: string) => string }[] = [
  { pattern: /^(.{3,70}?) se define como (.{12,})$/iu, front: (x) => `¿Cómo se define ${x}?` },
  {
    pattern: /^(.{3,70}?) se caracteriza por (.{12,})$/iu,
    front: (x) => `¿Qué caracteriza a ${x}?`,
  },
  { pattern: /^(.{3,70}?) consiste en (.{12,})$/iu, front: (x) => `¿En qué consiste ${x}?` },
];

const ABSOLUTE =
  /\b(siempre|nunca|jam[aá]s|todos los pacientes|todas las pacientes|el [uú]nico|la [uú]nica|en todos los casos|sin excepci[oó]n)\b/iu;
const DOSE =
  /\b\d+(?:[.,]\d+)?\s?(?:mg\/kg|mcg|µg|mg|ml|mL|UI|mEq|mmol|mmHg|kg|g|%|horas|h|minutos|min|días|semanas|meses|años)(?![\p{L}])/u;
const STOPWORDS = new Set(
  'porque cuando mientras aunque además también durante después antes entre sobre desde hasta según pacientes paciente puede pueden debe deben tiene tienen tratamiento enfermedad síndrome diagnóstico'.split(
    ' ',
  ),
);

function pickKeyTerm(sentence: string): string | null {
  const dose = DOSE.exec(sentence);
  if (dose) return dose[0].trim();
  const drug = sentence.split(/[\s,.;:()]+/).find((word) => drugsIn(word).length > 0);
  if (drug) return drug;
  const longest = sentence
    .split(/[\s,.;:()¿?¡!]+/)
    .filter((word) => /^\p{L}{8,}$/u.test(word) && !STOPWORDS.has(normalizeForMatch(word)))
    .sort((a, b) => b.length - a.length)[0];
  return longest ?? null;
}

function scoreOf(sentence: string): number {
  let score = 0;
  if (DOSE.test(sentence) || /\d/.test(sentence)) score += 3;
  if (drugsIn(sentence).length > 0) score += 2;
  if (DEFINITIONS.some((definition) => definition.pattern.test(sentence))) score += 2;
  if (sentence.includes(':')) score += 1;
  if (sentence.length > 200) score -= 2;
  return score;
}

/** Las tarjetas de ejemplo de una sección, siempre las mismas para el mismo texto */
export function simulateCards(
  section: SourceSection,
  max: number = CARDS_PER_SECTION_MAX,
): ProposedCard[] {
  const candidates = section.text
    .split(/\n\s*\n/)
    .flatMap(splitSentences)
    .filter((sentence) => sentence.length >= 40 && sentence.length <= 260)
    .map((sentence, order) => ({ sentence, order, score: scoreOf(sentence) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, max)
    .sort((a, b) => a.order - b.order);

  const cards: ProposedCard[] = [];
  for (const { sentence } of candidates) {
    const quote = sentence;
    const bare = sentence.replace(/[.;:]+$/, '');
    const controversy = ABSOLUTE.exec(sentence);
    const flag: ProposedControversy | null = controversy
      ? {
          reason: `La frase usa "${controversy[0]}", una afirmación absoluta. En medicina casi toda regla tiene excepciones y las guías suelen matizarla. Compárala con lo que dicen las fuentes de abajo antes de estudiarla.`,
          sources: [
            { key: 'gpc_cenetec', locator: null },
            { key: 'harrison', locator: null },
          ],
        }
      : null;
    let card: ProposedCard | null = null;
    for (const definition of DEFINITIONS) {
      const match = definition.pattern.exec(bare);
      if (match?.[1] && match[2]) {
        card = {
          kind: 'basic',
          front: definition.front(match[1].trim()),
          back: match[2].trim(),
          quote,
        };
        break;
      }
    }
    if (!card) {
      const term = pickKeyTerm(bare);
      const at = term ? bare.indexOf(term) : -1;
      if (term && at >= 0) {
        card = {
          kind: 'cloze',
          front: `${bare.slice(0, at)}{{c1::${term}}}${bare.slice(at + term.length)}`,
          back: '',
          quote,
        };
      }
    }
    if (card) cards.push(flag ? { ...card, controversy: flag } : card);
  }
  return cards;
}

export type { AcademicSourceKey };
