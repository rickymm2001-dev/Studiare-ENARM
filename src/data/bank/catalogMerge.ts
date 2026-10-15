// Junta las páginas del catálogo de la nube con lo que ya tiene el navegador (B11, 5.3 del plan de
// B11). Función pura, sin Dexie ni red. La bajada es incremental. Se pide desde el último seq visto
// hasta que la base dice done, y cada fila nueva de una pregunta reemplaza a la guardada solo si su seq
// es mayor, así una página repetida o vieja nunca regresa una pregunta retirada a publicada.
// Los ids llegan en uuid y se guardan en ULID (cloudIds.ts). Una fila que no se puede representar en la
// app se descarta y solo se cuenta, sin guardar nada de ella.
import type { CatalogPageWire } from '../cloud/bank';
import { uuidToUlid } from '../cloud/cloudIds';
import { CatalogEntrySchema, type CatalogEntry } from '../schemas/bankCloud';
import { ItemKindSchema, type ItemKind } from '../schemas/common';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Un id de la nube en ULID. null si falta. undefined si no convierte */
function ulidOf(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? (uuidToUlid(value) ?? undefined) : undefined;
}

/**
 * La fila del catálogo como la guarda la app, o null si no se puede guardar. Los tipos de reactivo que
 * esta app no conoce se ignoran, porque la pregunta sigue siendo válida sin ellos (D-080)
 */
export function catalogEntryOf(row: unknown): CatalogEntry | null {
  if (!isRecord(row)) return null;
  const questionId = ulidOf(row.questionId);
  const versionId = ulidOf(row.versionId);
  const caseId = ulidOf(row.caseId);
  const variantOf = ulidOf(row.variantOf);
  if (!questionId || !versionId || caseId === undefined || variantOf === undefined) return null;
  const kinds = Array.isArray(row.itemKinds) ? row.itemKinds : [];
  const parsed = CatalogEntrySchema.safeParse({
    questionId,
    versionId,
    version: row.version,
    branch: row.branch,
    topic: row.topic,
    subtopic: row.subtopic,
    difficulty: row.difficulty,
    itemKinds: kinds.filter((kind): kind is ItemKind => ItemKindSchema.safeParse(kind).success),
    polarity: row.polarity,
    task: row.task,
    format: row.format,
    caseId,
    caseOrder: caseId === null ? null : row.caseOrder,
    caseSize: caseId === null ? null : (row.caseSize ?? null),
    variantOf,
    examEligible: row.examEligible,
    distractorBiases: Array.isArray(row.distractorBiases) ? row.distractorBiases : [],
    optionCount: row.optionCount,
    language: row.language,
    status: row.status,
    seq: row.seq,
  });
  return parsed.success ? parsed.data : null;
}

export interface CatalogMerge {
  /** Filas que reemplazan a las guardadas o que son nuevas */
  upserts: CatalogEntry[];
  /** Filas que no se pudieron representar en la app */
  dropped: number;
  /** El seq desde el que se pide la siguiente página. Nunca baja */
  nextSince: number;
  done: boolean;
  /** El banco está abierto para quien pregunta */
  open: boolean;
}

/**
 * Lo que cambia una página del catálogo. stored tiene el seq guardado de cada pregunta estable. Con el
 * banco cerrado no cambia nada y no se avanza
 */
export function mergeCatalogPage(
  stored: ReadonlyMap<string, number>,
  page: CatalogPageWire,
  since: number,
): CatalogMerge {
  if (!page.open) return { upserts: [], dropped: 0, nextSince: since, done: true, open: false };
  const best = new Map<string, CatalogEntry>();
  let dropped = 0;
  for (const row of page.rows) {
    const entry = catalogEntryOf(row);
    if (!entry) {
      dropped += 1;
      continue;
    }
    const current = best.get(entry.questionId)?.seq ?? stored.get(entry.questionId) ?? -1;
    if (entry.seq > current) best.set(entry.questionId, entry);
  }
  return {
    upserts: [...best.values()].sort((a, b) => a.seq - b.seq),
    dropped,
    nextSince: Math.max(since, page.nextSince),
    done: page.done,
    open: true,
  };
}
