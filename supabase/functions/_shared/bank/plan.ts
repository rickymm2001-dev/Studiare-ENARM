// Qué hacer con cada renglón del Sheet (B11, 3.5 del plan de B11). Es puro. Recibe el Sheet ya
// convertido y lo que la base sabe de cada ID, y decide por renglón si se crea, se versiona, coincide
// con lo que el médico corrigió en la app, es un conflicto, solo cambian Autor, Revisor o Estado, o se
// rechaza. Nunca pisa lo que se editó en la app (8.25). bank_sync_apply vuelve a revisar con candado que
// la versión más reciente siga siendo la que vio el planeador.
import type { SheetConvertResult, SheetRowResult } from './generated/bankConvert.ts';
import {
  canonicalFromSheet,
  canonicalFromVersion,
  contentHash,
  metaHash,
  type VersionContent,
} from './generated/contentHash.ts';
import type { SyncDecision, SyncOutcome, SyncRowPayload } from './generated/contracts.ts';

/** Lo que la base sabe de una pregunta del Sheet, como lo devuelve bank_sync_begin */
export interface KnownQuestion {
  /** El ID del Sheet, sin el prefijo sheet: */
  key: string;
  questionId: string;
  rowHash: string | null;
  metaHash: string | null;
  latestVersionId: string;
  /** Quién creó la versión más reciente, sheet, import, app o ai_variant */
  latestSource: string | null;
  /** La versión que creó la última sincronización */
  appliedVersionId: string | null;
  forceNext: boolean;
  conflictRowHash: string | null;
  status: 'active' | 'retired';
}

export interface PlannedRow {
  payload: SyncRowPayload;
  /** La versión de la app que hay que comparar con el renglón antes de decidir */
  compareWith: string | null;
}

export interface SheetPlan {
  rows: PlannedRow[];
  /** Renglones que no cambiaron y no viajan a la base */
  unchanged: number;
  /** Todas las claves que están en el Sheet, también las rechazadas. Lo que falta se marca (3.8) */
  seenKeys: string[];
}

const outcomeOf: Record<SyncDecision, SyncOutcome> = {
  create: 'created',
  version: 'versioned',
  converged: 'converged',
  conflict: 'conflict',
  meta_only: 'meta',
  rejected: 'rejected',
};

/** El resultado que se espera de una decisión, el que guarda el reporte en solo reporte */
export const expectedOutcome = (decision: SyncDecision): SyncOutcome => outcomeOf[decision];

async function payloadOf(
  row: SheetRowResult,
  decision: SyncDecision,
  expectLatestVersionId: string | null,
): Promise<SyncRowPayload> {
  return {
    rowNumber: row.rowNumber,
    key: row.key ?? '',
    rowHash: row.question ? await contentHash(canonicalFromSheet(row.question)) : '',
    metaHash: await metaHash(row.meta),
    decision,
    expectLatestVersionId,
    problems: row.problems,
    incomplete: row.incomplete,
    notices: row.notices,
    ...(row.question && decision !== 'rejected' ? { question: row.question } : {}),
    meta: row.meta,
  };
}

/** Decide qué hacer con cada renglón. Los que piden comparar se resuelven con resolveComparisons */
export async function planSheet(
  converted: SheetConvertResult,
  known: readonly KnownQuestion[],
): Promise<SheetPlan> {
  const byKey = new Map(known.map((item) => [item.key, item]));
  const plan: SheetPlan = { rows: [], unchanged: 0, seenKeys: [] };
  for (const row of converted.rows) {
    if (row.key !== null && !plan.seenKeys.includes(row.key)) plan.seenKeys.push(row.key);
    if (!row.question || row.key === null) {
      plan.rows.push({ payload: await payloadOf(row, 'rejected', null), compareWith: null });
      continue;
    }
    const current = byKey.get(row.key);
    if (!current) {
      plan.rows.push({ payload: await payloadOf(row, 'create', null), compareWith: null });
      continue;
    }
    const draft = await payloadOf(row, 'version', current.latestVersionId);
    if (!current.forceNext && draft.rowHash === current.rowHash) {
      if (draft.metaHash === current.metaHash) {
        plan.unchanged += 1;
        continue;
      }
      plan.rows.push({ payload: { ...draft, decision: 'meta_only' }, compareWith: null });
      continue;
    }
    // La versión más reciente es la que creó la sincronización, o se pidió usar la del Sheet
    if (current.forceNext || current.latestVersionId === current.appliedVersionId) {
      plan.rows.push({ payload: draft, compareWith: null });
      continue;
    }
    // La más reciente nació en la app o en la IA. Hay que ver si el médico copió al Sheet lo mismo
    plan.rows.push({
      payload: { ...draft, decision: 'conflict' },
      compareWith: current.latestVersionId,
    });
  }
  return plan;
}

/** Las versiones que hay que pedir a bank_sync_versions_content */
export function versionsToCompare(plan: SheetPlan): string[] {
  return [
    ...new Set(plan.rows.flatMap((row) => (row.compareWith === null ? [] : [row.compareWith]))),
  ];
}

/**
 * Con el contenido de las versiones de la app, decide entre coincide y conflicto. Si la versión no
 * llegó, se queda como conflicto, que nunca pisa nada
 */
export async function resolveComparisons(
  plan: SheetPlan,
  contents: ReadonlyMap<string, VersionContent>,
): Promise<void> {
  for (const row of plan.rows) {
    if (row.compareWith === null) continue;
    const content = contents.get(row.compareWith);
    if (content && (await contentHash(canonicalFromVersion(content))) === row.payload.rowHash) {
      row.payload = { ...row.payload, decision: 'converged' };
    }
    row.compareWith = null;
  }
}

export interface SheetCounts {
  read: number;
  empty: number;
  example: number;
  unchanged: number;
  created: number;
  versioned: number;
  converged: number;
  meta: number;
  incomplete: number;
  rejected: number;
  conflict: number;
}

/** Los conteos de la corrida (3.9). missing lo agrega bank_sync_finish */
export function countPlan(converted: SheetConvertResult, plan: SheetPlan): SheetCounts {
  const by = (decision: SyncDecision) =>
    plan.rows.filter((row) => row.payload.decision === decision).length;
  return {
    read: converted.counts.read,
    empty: converted.counts.empty,
    example: converted.counts.example,
    unchanged: plan.unchanged,
    created: by('create'),
    versioned: by('version'),
    converged: by('converged'),
    meta: by('meta_only'),
    incomplete: plan.rows.filter(
      (row) => row.payload.decision !== 'rejected' && row.payload.incomplete.length > 0,
    ).length,
    rejected: by('rejected'),
    conflict: by('conflict'),
  };
}
