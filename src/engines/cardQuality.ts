/**
 * Revisión de calidad de tarjetas (fila 9 de D-085).
 *
 * Qué hace. Mira el borrador de una tarjeta y devuelve avisos para que sea corta, de una sola idea
 * y sin pistas de más, que es lo que pide la guía de Anki. Sirve igual a lo que escribe el alumno,
 * a las tarjetas que genera la IA y a las que traen los importadores.
 * Entradas. Un borrador, básica o básica con inversa con frente y respuesta, o cloze con texto y
 * nota extra. Los textos pueden traer HTML saneado o texto plano. Los umbrales entran como
 * parámetro y por defecto son los de src/config/cardQuality.ts.
 * Salidas. Una lista de avisos. Cada uno trae un código estable, una gravedad (note es una
 * sugerencia y warning un aviso) y las cifras para armar el mensaje. Primero van los warning.
 * Ningún aviso bloquea guardar. El proyecto acepta tarjetas imperfectas a propósito y el alumno
 * decide. Los campos vacíos no dan avisos, de eso se encarga el editor.
 * Avisos
 *   - front_too_long, back_too_long y text_too_long. Demasiadas palabras
 *   - list_too_long. La respuesta o un hueco enumera demasiados elementos. Se cuentan los li de
 *     HTML, las líneas con viñeta o número, las líneas cortas de un texto de tres o más líneas y
 *     las enumeraciones con comas de fragmentos cortos
 *   - multiple_ideas. Muchas oraciones o muchos párrafos que no son lista en la respuesta o en el
 *     texto cloze
 *   - multiple_questions. El frente pregunta dos cosas, con dos o más signos de interrogación
 *   - too_many_holes. Muchos huecos distintos (c1, c2, ...) en un cloze
 *   - hole_answer_too_long. Un hueco esconde demasiadas palabras
 *   - hole_without_context. Con un hueco tapado quedan muy pocas palabras que expliquen de qué se trata
 *   - answer_in_question. La respuesta ya está escrita en el frente. En básica con inversa también
 *     al revés, porque el frente es la respuesta de la tarjeta inversa
 *   - answer_in_cloze_text. Lo que esconde un hueco se ve en el resto del texto, en otro hueco o
 *     en su pista, y la tarjeta se contesta sola
 * Método. Texto limpio de cardText.ts y comparación con la misma normalización que usan los
 * duplicados. Todo es heurístico y por eso solo avisa.
 * Umbrales. En src/config/cardQuality.ts, cada uno con su razón.
 */
import { DEFAULT_CARD_QUALITY, type CardQualityConfig } from '@/config/cardQuality';
import {
  clozeFlatten,
  clozeRender,
  countWords,
  htmlToBlocks,
  htmlToPlain,
  parseCloze,
  type TextBlock,
} from './cardText';
import { normalizeForDuplicates } from './duplicates';

export type CardDraft =
  | { kind: 'basic' | 'basic_reverse'; front: string; back: string }
  | { kind: 'cloze'; text: string; extra?: string };

export type CardQualitySeverity = 'note' | 'warning';

interface WithSeverity {
  severity: CardQualitySeverity;
}

export type CardQualityIssue =
  | (WithSeverity & { code: 'front_too_long'; words: number; limit: number })
  | (WithSeverity & { code: 'back_too_long'; words: number; limit: number })
  | (WithSeverity & { code: 'text_too_long'; words: number; limit: number })
  | (WithSeverity & {
      code: 'list_too_long';
      field: 'back' | 'text';
      items: number;
      limit: number;
    })
  | (WithSeverity & {
      code: 'multiple_ideas';
      field: 'back' | 'text';
      sentences: number;
      lines: number;
    })
  | { code: 'multiple_questions'; severity: 'note'; questions: number }
  | (WithSeverity & { code: 'too_many_holes'; holes: number; limit: number })
  | (WithSeverity & { code: 'hole_answer_too_long'; ordinal: number; words: number; limit: number })
  | (WithSeverity & {
      code: 'hole_without_context';
      ordinal: number;
      contextWords: number;
      minimum: number;
    })
  | {
      code: 'answer_in_question';
      severity: 'warning';
      direction: 'forward' | 'reverse' | 'both';
    }
  | { code: 'answer_in_cloze_text'; severity: 'warning'; ordinals: number[] };

export type CardQualityCode = CardQualityIssue['code'];

/** Sugerencia si se pasa de max y aviso si se pasa de hardMax */
function above(value: number, limit: { max: number; hardMax: number }): CardQualitySeverity | null {
  if (value > limit.hardMax) return 'warning';
  return value > limit.max ? 'note' : null;
}

/** Sugerencia si se queda por debajo de min y aviso si se queda por debajo de hardMin */
function below(value: number, limit: { min: number; hardMin: number }): CardQualitySeverity | null {
  if (value < limit.hardMin) return 'warning';
  return value < limit.min ? 'note' : null;
}

const plainOf = (blocks: readonly TextBlock[]) => blocks.map((block) => block.text).join(' ');

/** Una línea que empieza con viñeta, guion o número es un elemento de lista */
const MARKER = /^(?:[-–—•·*▪◦►]\s|\d{1,3}[.)]\s|\(?[a-zA-Z]\)\s)/;
const ABBREVIATIONS: ReadonlySet<string> = new Set([
  'dr',
  'dra',
  'sr',
  'sra',
  'vs',
  'ej',
  'fig',
  'aprox',
  'núm',
  'pág',
  'cap',
]);

/** Una oración termina en ., ! o ? seguidos de espacio. No cuenta como fin una sigla ni una inicial */
function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+/);
}

function endsWithAbbreviation(sentence: string): boolean {
  const word = /([\p{L}]+)\.$/u.exec(sentence)?.[1]?.toLowerCase();
  return word !== undefined && (word.length === 1 || ABBREVIATIONS.has(word));
}

function countSentences(text: string): number {
  let count = 0;
  let continues = false;
  for (const sentence of sentencesOf(text)) {
    if (!/[\p{L}\p{N}]/u.test(sentence)) continue;
    if (!continues) count += 1;
    continues = endsWithAbbreviation(sentence);
  }
  return count;
}

/**
 * Elementos de una enumeración dentro de una oración, "fiebre, tos, disnea y dolor". Solo cuenta si
 * todos los fragmentos son cortos, para no tomar por lista una oración con comas. Los números como
 * 1,000 no se parten
 */
function inlineItems(text: string, maxWords: number): number {
  let best = 0;
  for (const sentence of sentencesOf(text)) {
    const colon = sentence.indexOf(':');
    const fragments = sentence
      .slice(colon + 1)
      .split(/\s*(?:(?<!\d),|,(?!\d)|;)\s*|\s+(?:y|e|o|u)\s+/i)
      .filter((fragment) => /[\p{L}\p{N}]/u.test(fragment));
    if (fragments.length >= 2 && fragments.every((item) => countWords(item) <= maxWords)) {
      best = Math.max(best, fragments.length);
    }
  }
  return best;
}

interface Structure {
  /** El mayor de los elementos de lista, de las líneas de lista y de las enumeraciones con comas */
  listItems: number;
  /** Oraciones de los bloques que no son lista */
  sentences: number;
  /** Bloques que no son lista */
  lines: number;
}

function analyzeStructure(blocks: readonly TextBlock[], config: CardQualityConfig): Structure {
  // Tres o más líneas cortas son una lista aunque no traigan viñetas
  const shortLines =
    blocks.length >= 3 && blocks.every((block) => countWords(block.text) <= config.listLineWords);
  const isList = (block: TextBlock) => shortLines || block.listItem || MARKER.test(block.text);
  const prose = blocks.filter((block) => !isList(block));
  const inline = prose.map((block) => inlineItems(block.text, config.inlineItemWords));
  return {
    listItems: Math.max(blocks.length - prose.length, ...inline),
    sentences: prose.reduce((sum, block) => sum + countSentences(block.text), 0),
    lines: prose.length,
  };
}

/** Palabras que quedan para dar contexto, las de al menos wordChars letras o cifras */
function contextWords(plain: string, wordChars: number): number {
  return (plain.match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length >= wordChars).length;
}

/** El texto buscado aparece como palabras completas dentro del otro. Ambos ya van normalizados */
function appearsIn(needle: string, haystack: string, minChars: number): boolean {
  return needle.length >= minChars && ` ${haystack} `.includes(` ${needle} `);
}

function ideasIssue(
  field: 'back' | 'text',
  structure: Structure,
  config: CardQualityConfig,
): CardQualityIssue[] {
  const levels = [
    above(structure.sentences, config.sentences),
    above(structure.lines, config.lines),
  ];
  const level = levels.includes('warning') ? 'warning' : levels.includes('note') ? 'note' : null;
  if (level === null) return [];
  return [
    {
      code: 'multiple_ideas',
      severity: level,
      field,
      sentences: structure.sentences,
      lines: structure.lines,
    },
  ];
}

function listIssue(
  field: 'back' | 'text',
  items: number,
  config: CardQualityConfig,
): CardQualityIssue[] {
  const severity = above(items, config.listItems);
  return severity === null
    ? []
    : [{ code: 'list_too_long', severity, field, items, limit: config.listItems.max }];
}

function checkBasic(
  draft: Extract<CardDraft, { front: string }>,
  config: CardQualityConfig,
): CardQualityIssue[] {
  const issues: CardQualityIssue[] = [];
  const front = htmlToPlain(draft.front);
  const backBlocks = htmlToBlocks(draft.back);

  const frontWords = countWords(front);
  const frontSeverity = above(frontWords, config.frontWords);
  if (frontSeverity) {
    issues.push({
      code: 'front_too_long',
      severity: frontSeverity,
      words: frontWords,
      limit: config.frontWords.max,
    });
  }
  const questions = front.split('?').length - 1;
  if (questions >= 2) issues.push({ code: 'multiple_questions', severity: 'note', questions });

  const backWords = countWords(plainOf(backBlocks));
  const backSeverity = above(backWords, config.backWords);
  if (backSeverity) {
    issues.push({
      code: 'back_too_long',
      severity: backSeverity,
      words: backWords,
      limit: config.backWords.max,
    });
  }
  const structure = analyzeStructure(backBlocks, config);
  issues.push(...listIssue('back', structure.listItems, config));
  issues.push(...ideasIssue('back', structure, config));

  const normalizedFront = normalizeForDuplicates(draft.front);
  const normalizedBack = normalizeForDuplicates(draft.back);
  const forward = appearsIn(normalizedBack, normalizedFront, config.leakMinChars);
  const reverse =
    draft.kind === 'basic_reverse' &&
    appearsIn(normalizedFront, normalizedBack, config.leakMinChars);
  if (forward || reverse) {
    const direction = forward && reverse ? 'both' : forward ? 'forward' : 'reverse';
    issues.push({ code: 'answer_in_question', severity: 'warning', direction });
  }
  return issues;
}

function checkCloze(
  draft: Extract<CardDraft, { kind: 'cloze' }>,
  config: CardQualityConfig,
): CardQualityIssue[] {
  const issues: CardQualityIssue[] = [];
  const { parts, holes } = parseCloze(draft.text);
  const blocks = htmlToBlocks(clozeFlatten(parts));

  const words = countWords(plainOf(blocks));
  const wordsSeverity = above(words, config.clozeTextWords);
  if (wordsSeverity) {
    issues.push({
      code: 'text_too_long',
      severity: wordsSeverity,
      words,
      limit: config.clozeTextWords.max,
    });
  }

  const ordinals = [...new Set(holes.map((hole) => hole.ordinal))].sort((a, b) => a - b);
  const holesSeverity = above(ordinals.length, config.clozeHoles);
  if (holesSeverity) {
    issues.push({
      code: 'too_many_holes',
      severity: holesSeverity,
      holes: ordinals.length,
      limit: config.clozeHoles.max,
    });
  }

  const answers = holes.map((hole) => ({
    ordinal: hole.ordinal,
    blocks: htmlToBlocks(clozeFlatten(hole.content)),
  }));
  let longest = { ordinal: 0, words: 0 };
  for (const answer of answers) {
    const length = countWords(plainOf(answer.blocks));
    if (length > longest.words) longest = { ordinal: answer.ordinal, words: length };
  }
  const answerSeverity = above(longest.words, config.holeAnswerWords);
  if (answerSeverity) {
    issues.push({
      code: 'hole_answer_too_long',
      severity: answerSeverity,
      ordinal: longest.ordinal,
      words: longest.words,
      limit: config.holeAnswerWords.max,
    });
  }

  const structure = analyzeStructure(blocks, config);
  const inAnswers = answers.map((answer) => analyzeStructure(answer.blocks, config).listItems);
  issues.push(...listIssue('text', Math.max(structure.listItems, ...inAnswers), config));
  issues.push(...ideasIssue('text', structure, config));

  // Lo que se ve al preguntar cada hueco, con ese hueco tapado
  const visible = ordinals.map((ordinal) => ({
    ordinal,
    plain: htmlToPlain(clozeRender(parts, ordinal, { hints: false })),
    withHints: normalizeForDuplicates(clozeRender(parts, ordinal, { hints: true })),
  }));
  let fewest: { ordinal: number; count: number } | null = null;
  for (const item of visible) {
    const count = contextWords(item.plain, config.context.wordChars);
    if (fewest === null || count < fewest.count) fewest = { ordinal: item.ordinal, count };
  }
  const contextSeverity = fewest ? below(fewest.count, config.context) : null;
  if (fewest && contextSeverity) {
    issues.push({
      code: 'hole_without_context',
      severity: contextSeverity,
      ordinal: fewest.ordinal,
      contextWords: fewest.count,
      minimum: config.context.min,
    });
  }

  const leaking = visible
    .filter((item) =>
      holes.some(
        (hole) =>
          hole.ordinal === item.ordinal &&
          appearsIn(
            normalizeForDuplicates(clozeFlatten(hole.content)),
            item.withHints,
            config.leakMinChars,
          ),
      ),
    )
    .map((item) => item.ordinal);
  if (leaking.length > 0) {
    issues.push({ code: 'answer_in_cloze_text', severity: 'warning', ordinals: leaking });
  }
  return issues;
}

/** Revisa un borrador de tarjeta. Primero salen los avisos y después las sugerencias */
export function checkCardQuality(
  draft: CardDraft,
  config: CardQualityConfig = DEFAULT_CARD_QUALITY,
): CardQualityIssue[] {
  const issues = draft.kind === 'cloze' ? checkCloze(draft, config) : checkBasic(draft, config);
  const rank = (issue: CardQualityIssue) => (issue.severity === 'warning' ? 0 : 1);
  return issues.sort((a, b) => rank(a) - rank(b));
}
