/**
 * Secciones y tarjetas simuladas (D-085, D-098).
 *
 * Qué hace. Parte un texto en secciones y propone tarjetas de ejemplo siempre iguales para el mismo
 * texto. Es el generador que se usa sin clave de IA y el que responde el proxy en modo simulado.
 * Entradas. El texto del alumno, ya sin datos personales.
 * Salidas. Secciones con título y tarjetas propuestas con la cita que las respalda.
 * Método. Sin alias de la app, para que el servidor lo cargue por ruta relativa. El validador vive en
 * cardGen.ts y es quien decide si una tarjeta pasa.
 * Umbrales. Secciones de hasta 1,800 caracteres y hasta 7 tarjetas por sección.
 */
import { drugsIn, normalizeForMatch } from './grounding';

export const SECTION_MAX_CHARS = 1800;
export const SECTION_MIN_CHARS = 350;
export const SECTIONS_MAX = 40;
export const CARDS_PER_SECTION_MAX = 7;

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
