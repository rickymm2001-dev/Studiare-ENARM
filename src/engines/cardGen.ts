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
import {
  CARDS_PER_SECTION_MAX,
  SECTIONS_MAX,
  SECTION_MAX_CHARS,
  SECTION_MIN_CHARS,
  simulateCards,
  splitSections,
  type ProposedCard,
  type ProposedControversy,
  type SourceSection,
} from './cardSim';
import {
  ANSWER_GROUNDED_RATIO,
  MIN_QUOTE_CHARS,
  MIN_QUOTE_WORDS,
  containsQuote,
  drugsIn,
  groundedRatio,
  normalizeForMatch,
  numbersIn,
  quoteIssues,
  unsupportedFacts,
  wordsOf,
} from './grounding';

export {
  ANSWER_GROUNDED_RATIO,
  MIN_QUOTE_CHARS,
  MIN_QUOTE_WORDS,
  containsQuote,
  drugsIn,
  normalizeForMatch,
  numbersIn,
  wordsOf,
};

export const FIELD_MAX_CHARS = 3000;
export const CONTROVERSY_REASON_MIN = 20;
export const CONTROVERSY_REASON_MAX = 600;

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
  for (const issue of quoteIssues(quote, source)) add(issue);

  // Cifras, dosis y fármacos de la tarjeta, que deben estar todos en la cita
  const missing = unsupportedFacts(`${card.front} ${card.back}`, quote);
  if (missing.numbers.length > 0) add('number_not_in_quote');
  if (missing.drugs.length > 0) add('drug_not_in_quote');

  if (groundedRatio(answerOf(card), quote) < ANSWER_GROUNDED_RATIO) add('answer_not_grounded');

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

export {
  CARDS_PER_SECTION_MAX,
  SECTIONS_MAX,
  SECTION_MAX_CHARS,
  SECTION_MIN_CHARS,
  simulateCards,
  splitSections,
};
export type { AcademicSourceKey, ProposedCard, ProposedControversy, SourceSection };
