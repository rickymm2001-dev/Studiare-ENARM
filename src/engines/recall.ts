/**
 * Recall sprint (V4-B4, el método de recuperación activa de la lista de métodos de estudio).
 *
 * Qué hace. Después de que el alumno escribe de memoria lo que recuerda de un apunte, lista las
 * líneas del apunte para que marque las que le faltaron y arma una tarjeta por cada una.
 * Entradas. El título del apunte, su árbol de líneas y las líneas que el alumno marcó.
 * Salidas. Las líneas para comparar, con su nivel y el contexto, y los borradores de tarjeta.
 * Método
 *   - Cada línea con texto es comparable. El contexto de una línea es el texto de la línea de la que
 *     cuelga, o el título del apunte si es de primer nivel
 *   - La tarjeta de una línea marcada es básica. Al frente va el contexto, que es lo que habría que
 *     recordar, y al reverso la línea
 *   - Una línea que ya trae una marca de tarjeta, como Pregunta :: Respuesta, ya tiene su tarjeta en
 *     Repasar y no se repite. Se cuenta aparte para decírselo al alumno
 *   - El texto sale sin las marcas de etiqueta ni los enlaces, como lo ve el alumno
 *   - Hasta MAX_RECALL_CARDS por sprint, para que sea un repaso corto y no un volcado
 * Lo que no hace. No usa IA, no califica lo que el alumno escribió y no lo compara con el apunte. La
 * comparación la hace el alumno con sus ojos, que es el punto del método
 */
import { parseLine } from './outline';
import type { OutlineNode } from './outlineLimits';

/** Tarjetas que se crean como máximo en un sprint */
export const MAX_RECALL_CARDS = 50;
/** Duración del sprint en segundos */
export const RECALL_SECONDS = 180;
/** Igual que el tope de campo de las tarjetas hechas a mano */
const FIELD_MAX = 3000;

export interface RecallLine {
  id: string;
  /** Nivel dentro del apunte, 0 en el primero */
  depth: number;
  text: string;
  /** De qué línea cuelga, o el título del apunte */
  context: string;
  /** La línea ya trae una marca de tarjeta */
  hasCard: boolean;
}

export function recallLines(title: string, nodes: readonly OutlineNode[]): RecallLine[] {
  const lines: RecallLine[] = [];
  const visit = (list: readonly OutlineNode[], depth: number, context: string) => {
    for (const node of list) {
      const parsed = parseLine(node.text);
      const text = parsed.plain.trim();
      if (text !== '') {
        lines.push({ id: node.id, depth, text, context, hasCard: parsed.mark.type !== 'none' });
      }
      visit(node.children, depth + 1, text === '' ? context : text);
    }
  };
  visit(nodes, 0, title);
  return lines;
}

export interface RecallCardDraft {
  /** La línea del apunte de la que sale, para marcarla como ya creada y no repetirla al reintentar */
  id: string;
  front: string;
  back: string;
}

export function recallCardDrafts(
  lines: readonly RecallLine[],
  missedIds: ReadonlySet<string>,
): { drafts: RecallCardDraft[]; skipped: number } {
  const drafts: RecallCardDraft[] = [];
  let skipped = 0;
  for (const line of lines) {
    if (!missedIds.has(line.id)) continue;
    if (line.hasCard) {
      skipped += 1;
      continue;
    }
    if (drafts.length >= MAX_RECALL_CARDS) break;
    drafts.push({
      id: line.id,
      front: line.context.slice(0, FIELD_MAX),
      back: line.text.slice(0, FIELD_MAX),
    });
  }
  return { drafts, skipped };
}

/** 2:59, para el reloj del sprint. Nunca baja de 0:00 */
export function clockOf(secondsLeft: number): string {
  const total = Math.max(0, Math.trunc(secondsLeft));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
