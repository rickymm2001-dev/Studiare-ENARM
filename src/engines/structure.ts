/**
 * Estructura de pregunta y resaltado de negaciones (7.5, 13.2).
 *
 * Qué hace. Etiqueta por reglas la polaridad (afirmativa o negativa), el tipo de tarea y el
 * formato de una pregunta, y da los rangos de texto a resaltar. Solo busca negaciones en la frase
 * de la pregunta, nunca en la viñeta, así "no refiere fiebre" dentro del caso no vuelve negativa
 * la pregunta. La etiqueta que ponga el médico gana sobre la automática.
 * Entradas. Viñeta, frase de la pregunta, si es parte de un caso seriado y el diccionario de
 * src/demo/content/structure-dict.json.
 * Salidas. Polaridad, tarea, formato, si hay doble negación, los rangos a resaltar en la frase
 * original y si hay probable mala lectura en una respuesta.
 * Método. El texto se normaliza a minúsculas sin acentos guardando la posición de cada letra
 * original, se buscan los patrones del diccionario con límites de palabra, se descartan los que
 * caen dentro de un falso positivo (por ejemplo al menos) y los rangos se traducen al texto
 * original. Un número impar de negaciones da polaridad negativa. Uno par marca doble negación.
 * Umbrales. Ninguno. El análisis por estructura con beta-binomial vive en el motor topics.
 */
import type { StructureDictionary } from '@/data/schemas/content';
import type { QuestionTaskSchema } from '@/data/schemas/bank';
import type { z } from 'zod';

export type QuestionTask = z.infer<typeof QuestionTaskSchema>;
export type Polarity = 'affirmative' | 'negative';
export type QuestionFormat = 'clinical_case' | 'direct' | 'serial_case';

export interface HighlightRange {
  /** Posición en la frase original, incluida */
  start: number;
  /** Posición en la frase original, no incluida */
  end: number;
  /** Texto tal como aparece, sin cambios (7.5) */
  text: string;
  kind: StructureDictionary['negations'][number]['kind'];
}

export interface AutoStructure {
  polarity: Polarity;
  task: QuestionTask | null;
  format: QuestionFormat;
  doubleNegation: boolean;
  highlights: HighlightRange[];
}

interface NormalizedText {
  text: string;
  /** Para cada letra del texto normalizado, su posición en el original */
  origin: number[];
}

/** Minúsculas sin acentos, recordando de dónde viene cada letra */
export function normalizeWithMap(original: string): NormalizedText {
  let text = '';
  const origin: number[] = [];
  for (let index = 0; index < original.length; index += 1) {
    const plain = (original[index] as string).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (const character of plain) {
      text += character;
      origin.push(index);
    }
  }
  return { text, origin };
}

function wordRegex(pattern: string): RegExp {
  return new RegExp(`(?<![a-z0-9])(?:${pattern})(?![a-z0-9])`, 'g');
}

/** Busca todas las negaciones de la frase y devuelve sus rangos en el texto original */
export function findNegations(prompt: string, dictionary: StructureDictionary): HighlightRange[] {
  const { text, origin } = normalizeWithMap(prompt);
  const blocked: [number, number][] = [];
  for (const phrase of dictionary.falsePositives) {
    for (const match of text.matchAll(wordRegex(phrase))) {
      blocked.push([match.index, match.index + match[0].length]);
    }
  }
  const overlapsBlocked = (start: number, end: number) =>
    blocked.some(([blockStart, blockEnd]) => start < blockEnd && end > blockStart);

  const found: HighlightRange[] = [];
  for (const negation of dictionary.negations) {
    for (const match of text.matchAll(wordRegex(negation.pattern))) {
      const start = match.index;
      const end = start + match[0].length;
      if (overlapsBlocked(start, end)) continue;
      const originalStart = origin[start] as number;
      const originalEnd = (origin[end - 1] as number) + 1;
      found.push({
        start: originalStart,
        end: originalEnd,
        text: prompt.slice(originalStart, originalEnd),
        kind: negation.kind,
      });
    }
  }
  // Si dos patrones caen en el mismo lugar, como excepto y a excepción de, gana el más largo
  return found
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .filter(
      (range, index, all) =>
        !all.slice(0, index).some((other) => range.start < other.end && range.end > other.start),
    );
}

export function detectTask(prompt: string, dictionary: StructureDictionary): QuestionTask | null {
  const { text } = normalizeWithMap(prompt);
  for (const entry of dictionary.tasks) {
    if (entry.patterns.some((pattern) => wordRegex(pattern).test(text))) return entry.task;
  }
  return null;
}

export function analyzeStructure(
  question: { vignette: string; prompt: string; serialCase: boolean },
  dictionary: StructureDictionary,
): AutoStructure {
  const highlights = findNegations(question.prompt, dictionary);
  const format: QuestionFormat = question.serialCase
    ? 'serial_case'
    : question.vignette.trim().length > 0
      ? 'clinical_case'
      : 'direct';
  return {
    polarity: highlights.length % 2 === 1 ? 'negative' : 'affirmative',
    task: detectTask(question.prompt, dictionary),
    format,
    doubleNegation: highlights.length >= 2 && highlights.length % 2 === 0,
    highlights,
  };
}

/**
 * Separa la viñeta de la frase de la pregunta cuando llegan juntas, como en un banco importado.
 * La frase es la última oración que pregunta (con ¿ o ?) o, si no hay, la última oración
 */
export function splitStem(stem: string): { vignette: string; prompt: string } {
  const trimmed = stem.trim();
  const questionStart = trimmed.lastIndexOf('¿');
  if (questionStart >= 0) {
    return {
      vignette: trimmed.slice(0, questionStart).trim(),
      prompt: trimmed.slice(questionStart).trim(),
    };
  }
  const sentences = trimmed.split(/(?<=[.:])\s+/);
  const prompt = sentences.pop() ?? '';
  return { vignette: sentences.join(' ').trim(), prompt: prompt.trim() };
}

export interface StructureLabel {
  polarity: Polarity;
  task: QuestionTask;
  format: QuestionFormat;
  source: 'auto' | 'physician';
}

/** La etiqueta del médico gana sobre la automática (7.5) */
export function resolveStructure(
  auto: AutoStructure,
  physician: Omit<StructureLabel, 'source'> | null,
): StructureLabel | null {
  if (physician) return { ...physician, source: 'physician' };
  if (auto.task === null) return null;
  return { polarity: auto.polarity, task: auto.task, format: auto.format, source: 'auto' };
}

/**
 * Probable mala lectura (7.5). En una pregunta negativa, el alumno eligió una afirmación verdadera
 * (cualquier distractor) y además respondió rápido o reportó haber leído mal
 */
export function isProbableMisread(input: {
  polarity: Polarity;
  correct: boolean;
  answeredFast: boolean;
  reportedMisread: boolean;
}): boolean {
  return (
    input.polarity === 'negative' && !input.correct && (input.answeredFast || input.reportedMisread)
  );
}
