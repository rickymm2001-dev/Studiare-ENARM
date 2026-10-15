// Lo que hace la pantalla Auditoría de la IA contra la nube (B12, 5.3), sin pintar nada. Guardar la
// rúbrica de un texto, importar una muestra con sus dos médicos, subir las calificaciones de un CSV, y
// abrir, cerrar o pausar. Cada una valida antes de llamar y devuelve un resultado, nunca lanza.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AiGateSampleFileSchema,
  type AiEngine,
  type AiGateReview,
  type AiGateSampleFile,
} from '@/engines/aiContracts';
import {
  createSample,
  reviewItem,
  type AiRpcFailure,
  type AiRpcResult,
  type ForbiddenHandler,
  type MyItem,
} from '@/data/cloud/aiGate';
import { parseReviewsCsv, reviewOf, type CsvProblem, type ReviewDraft } from './aiAuditView';

type Cloud = Pick<SupabaseClient, 'rpc'>;

/** Guarda la rúbrica de un texto si está completa. Incompleta no llama a nadie */
export async function saveDraft(
  cloud: Cloud,
  itemId: string,
  draft: ReviewDraft,
  onForbidden?: ForbiddenHandler,
): Promise<AiRpcResult<undefined> | { ok: false; reason: 'incomplete'; message: null }> {
  const review = reviewOf(draft);
  if (!review) return { ok: false, reason: 'incomplete', message: null };
  return reviewItem(cloud, itemId, review, onForbidden);
}

// ---------------------------------------------------------------------------------------------
// Importar una muestra

/** Lo más que pesa el archivo de una muestra. 400 textos de unos cuantos miles de caracteres caben de sobra */
export const MAX_SAMPLE_FILE_BYTES = 8_000_000;

export type SampleFileProblem = 'unreadable' | 'invalid' | 'too_large';

export interface SampleSummary {
  id: string;
  total: number;
  byEngine: Partial<Record<AiEngine, number>>;
}

export type SampleFileResult =
  | { ok: true; file: AiGateSampleFile; summary: SampleSummary }
  | { ok: false; problem: SampleFileProblem };

/** Lee el archivo que armó npm run ai:gate-sample y lo valida con el mismo esquema, antes de mandarlo */
export function readSampleFile(text: string): SampleFileResult {
  if (text.length > MAX_SAMPLE_FILE_BYTES) return { ok: false, problem: 'too_large' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'unreadable' };
  }
  const parsed = AiGateSampleFileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problem: 'invalid' };
  const byEngine: SampleSummary['byEngine'] = {};
  for (const item of parsed.data.items) byEngine[item.engine] = (byEngine[item.engine] ?? 0) + 1;
  return {
    ok: true,
    file: parsed.data,
    summary: { id: parsed.data.id, total: parsed.data.items.length, byEngine },
  };
}

/** Importa la muestra con exactamente dos médicos distintos */
export async function importSample(
  cloud: Cloud,
  file: AiGateSampleFile,
  reviewers: readonly [string, string],
  onForbidden?: ForbiddenHandler,
): Promise<AiRpcResult<string>> {
  if (reviewers[0] === '' || reviewers[1] === '' || reviewers[0] === reviewers[1]) {
    return { ok: false, reason: 'invalid', message: null };
  }
  return createSample(cloud, file, reviewers, onForbidden);
}

// ---------------------------------------------------------------------------------------------
// Subir las calificaciones de un CSV

export type CsvImportResult =
  | {
      ok: true;
      saved: number;
      skipped: number;
      failed: number;
      /** Las rúbricas que sí se guardaron, por id de texto */
      reviews: ReadonlyMap<string, AiGateReview>;
    }
  | { ok: false; problems: { line: number; problem: CsvProblem }[] }
  | { ok: false; reason: AiRpcFailure; message: string | null };

/**
 * Guarda las calificaciones de un CSV una por una con las mismas reglas que la pantalla. Si alguna fila
 * tiene un problema no se guarda ninguna. Si la muestra se cerró o falta el permiso, se detiene
 */
export async function importReviewsCsv(
  cloud: Cloud,
  text: string,
  items: readonly MyItem[],
  onForbidden?: ForbiddenHandler,
): Promise<CsvImportResult> {
  const parsed = parseReviewsCsv(text, items);
  if (!parsed.ok) return parsed;
  const reviews = new Map<string, AiGateReview>();
  let failed = 0;
  for (const row of parsed.rows) {
    const result = await reviewItem(cloud, row.id, row.review, onForbidden);
    if (result.ok) {
      reviews.set(row.id, row.review);
    } else if (result.reason === 'conflict' || result.reason === 'forbidden') {
      return { ok: false, reason: result.reason, message: result.message };
    } else {
      failed += 1;
    }
  }
  return { ok: true, saved: reviews.size, skipped: parsed.skipped, failed, reviews };
}
