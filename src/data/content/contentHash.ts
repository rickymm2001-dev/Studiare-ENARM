// Huella del contenido de una pregunta del banco (B11, 3.5 del plan de B11). La sincronización con el
// Google Sheet compara la huella del renglón con la que ya aplicó para saber si cambió, y con la de la
// versión más reciente de la app para saber si el médico copió al Sheet lo que corrigió en la app. Por
// eso la huella sale de una forma canónica que no cambia con espacios en las orillas, saltos de línea
// de Windows ni acentos compuestos, y que es la misma para un renglón y para la versión que le
// corresponde. Usa Web Crypto, que existe en el navegador, en Node y en Deno. Lo comparte la función
// bank-sync con una copia generada (scripts/content/sync-bank-shared.ts). Funciones puras.
import { OPTION_LETTERS } from './bankColumns.ts';
import type { SyncQuestion, SyncRowPayload } from '../bank/contracts.ts';

/** Forma canónica del contenido de una pregunta. Solo lo que es contenido, sin estado ni autor */
export interface CanonicalContent {
  branch: string;
  topic: string;
  subtopic: string;
  difficulty: number;
  itemKinds: string[];
  task: string;
  polarity: string;
  language: string;
  vignette: string;
  prompt: string;
  explanation: string;
  refs: string[];
  options: {
    letter: string;
    text: string;
    correct: boolean;
    bias: string | null;
    rationale: string;
  }[];
  canonical: string[];
  caseKey: string | null;
  caseOrder: number | null;
  caseVignette: string | null;
}

/**
 * El contenido de una versión de la base, como lo devuelve bank_sync_versions_content. Una opción
 * sin letra, porque nació en la app, toma la de su posición
 */
export interface VersionContent {
  branch: string;
  topic: string;
  subtopic: string;
  difficulty: number;
  itemKinds: readonly string[];
  task: string;
  polarity: string;
  language: string;
  vignette: string;
  prompt: string;
  explanation: string;
  refs: readonly string[];
  options: readonly {
    letter: string | null;
    position: number;
    text: string;
    isCorrect: boolean;
    biasTag: string | null;
    rationale: string;
  }[];
  /** Letras de las opciones del set canónico */
  canonical: readonly string[];
  caseKey: string | null;
  caseOrder: number | null;
  caseVignette: string | null;
}

/** Texto canónico. NFC, saltos de línea \n, sin espacios al final de cada línea ni en las orillas */
export function canonicalText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+$/u, ''))
    .join('\n')
    .trim();
}

const sorted = (items: readonly string[]) => [...items].map(canonicalText).sort();
const letterOf = (letter: string | null, position: number) =>
  (letter ?? OPTION_LETTERS[position] ?? String(position)).toUpperCase();

function canonical(
  content: Omit<CanonicalContent, 'options'> & {
    options: CanonicalContent['options'];
  },
): CanonicalContent {
  return {
    branch: content.branch,
    topic: content.topic,
    subtopic: content.subtopic,
    difficulty: content.difficulty,
    itemKinds: sorted(content.itemKinds),
    task: content.task,
    polarity: content.polarity,
    language: content.language,
    vignette: canonicalText(content.vignette),
    prompt: canonicalText(content.prompt),
    explanation: canonicalText(content.explanation),
    refs: content.refs.map(canonicalText).filter((ref) => ref !== ''),
    options: [...content.options]
      .map((option) => ({
        letter: option.letter.toUpperCase(),
        text: canonicalText(option.text),
        correct: option.correct,
        bias: option.correct ? null : option.bias,
        rationale: canonicalText(option.rationale),
      }))
      .sort((a, b) => a.letter.localeCompare(b.letter)),
    canonical: [...content.canonical].map((letter) => letter.toUpperCase()).sort(),
    caseKey: content.caseKey === null ? null : canonicalText(content.caseKey).toUpperCase(),
    caseOrder: content.caseOrder,
    caseVignette: content.caseVignette === null ? null : canonicalText(content.caseVignette),
  };
}

/** Forma canónica de un renglón ya convertido del Sheet */
export function canonicalFromSheet(question: SyncQuestion): CanonicalContent {
  return canonical({
    ...question,
    options: question.options.map((option) => ({
      letter: option.letter,
      text: option.text,
      correct: option.correct,
      bias: option.bias,
      rationale: option.rationale,
    })),
  });
}

/** Forma canónica de una versión de la base o de la app */
export function canonicalFromVersion(version: VersionContent): CanonicalContent {
  return canonical({
    ...version,
    itemKinds: [...version.itemKinds],
    refs: [...version.refs],
    canonical: [...version.canonical],
    options: version.options.map((option) => ({
      letter: letterOf(option.letter, option.position),
      text: option.text,
      correct: option.isCorrect,
      bias: option.biasTag,
      rationale: option.rationale,
    })),
  });
}

/** SHA-256 en hexadecimal de un texto en UTF-8 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Huella del contenido. JSON con las llaves en un orden fijo, el de CanonicalContent */
export function contentHash(content: CanonicalContent): Promise<string> {
  return sha256Hex(JSON.stringify(content));
}

/** Huella de Autor, Revisor y Estado, que cambian asignaciones y estado sin crear versión */
export function metaHash(meta: SyncRowPayload['meta']): Promise<string> {
  return sha256Hex(JSON.stringify([meta.authorCode, meta.reviewerCode, meta.sheetStatus]));
}

/**
 * Huella de todo el Sheet, de sus encabezados y de cada celda. Si la corrida de Cron trae la misma
 * que la anterior, termina sin escribir renglones (3.5)
 */
export function sheetHash(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): Promise<string> {
  const trimRow = (cells: readonly string[]) => {
    const values = cells.map((cell) => canonicalText(cell));
    while (values.length > 0 && values[values.length - 1] === '') values.pop();
    return values;
  };
  return sha256Hex(JSON.stringify([trimRow(headers), ...rows.map(trimRow)]));
}
