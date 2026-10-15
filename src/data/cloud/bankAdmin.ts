// Funciones del admin para el banco en la nube (B11, 4.3 y 4.5 del plan de B11). Banco y Sheet, la
// sincronización con su reporte de renglones, conflictos y faltantes, asignaciones, claves del Sheet,
// avisos de lectura, el interruptor que abre el banco a los alumnos, los ajustes del banco y el
// reporte de revisiones para pagar a los médicos. Todo sale de funciones que revisan is_admin por dentro,
// que con B9 también pide el segundo factor. Aquí solo se llaman, se validan y se traducen sus errores.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type {
  ReviewReportDetailRow,
  ReviewReportRow,
  SyncNoticeCode,
  SyncProblemCode,
  SyncRowPayload,
  SyncRowResult,
  SyncRunSummary,
} from '../bank/contracts.ts';
import { EditorialError } from '../editorial/editorialRepo.ts';
import { callBankRpc, EditorListSchema, type ForbiddenHandler } from './editorial.ts';
import { fetchRemoteFlags, saveRemoteFlags } from './featureFlags.ts';

type Cloud = Pick<SupabaseClient, 'rpc'>;
type Tables = Pick<SupabaseClient, 'from'>;
type Functions = Pick<SupabaseClient, 'functions'>;

const count = z.coerce.number().int().nonnegative();
const money = z.union([z.number(), z.string()]).transform(Number).nullable();

// ===================================================================== Resumen

export const BankOverviewSchema = z.object({
  goal: count,
  published: count,
  englishPublished: count.default(0),
  byBranch: z.array(z.object({ branch: z.string(), published: count })),
  drafts: count,
  incomplete: count,
  inReview: count,
  conflicts: count,
  missing: count,
  retireRequested: count.default(0),
  retired: count.default(0),
  open: z.boolean(),
});
export type BankOverview = z.infer<typeof BankOverviewSchema>;

export function readBankOverview(cloud: Cloud, onForbidden?: ForbiddenHandler) {
  return callBankRpc(cloud, 'admin_bank_overview', {}, BankOverviewSchema, onForbidden);
}

/**
 * Abre o cierra el banco a los alumnos con la bandera cloudBank de platform_settings, que lee también
 * bank_open_for_students en el servidor. Conserva las demás banderas. Devuelve si se guardó
 */
export async function setBankOpen(cloud: Tables, open: boolean): Promise<boolean> {
  const remote = await fetchRemoteFlags(cloud);
  if (!remote.ok) return false;
  return saveRemoteFlags(cloud, { ...(remote.flags ?? {}), cloudBank: open });
}

// ===================================================================== Ajustes del banco

export const BankLimitsSchema = z.object({
  perMinute: z.int().min(1).max(10_000),
  perHour: z.int().min(1).max(100_000),
  alertDaily: z.int().min(1).max(100_000),
  alertWeekShare: z.number().min(0.01).max(1),
  reportsPerDay: z.int().min(1).max(1000),
  maxFetch: z.int().min(1).max(500),
});
export type BankLimits = z.infer<typeof BankLimitsSchema>;

/** Los valores de fábrica de 1.16 del plan de B11, los mismos que bank_limits() en la base */
export const DEFAULT_BANK_LIMITS: BankLimits = {
  perMinute: 300,
  perHour: 900,
  alertDaily: 600,
  alertWeekShare: 0.5,
  reportsPerDay: 10,
  maxFetch: 100,
};

export const BankSyncSettingsSchema = z.object({
  enabled: z.boolean().catch(false),
  mode: z.enum(['dry_run', 'apply']).catch('dry_run'),
  tab: z.string().catch('Preguntas'),
  maxRows: count.catch(5000),
  minIntervalSeconds: count.catch(60),
  idPattern: z.string().catch('^[A-Z]{2,4}-[0-9]{4,5}$'),
});
export type BankSyncSettings = z.infer<typeof BankSyncSettingsSchema>;

export const PhysicianPaySchema = z.object({
  perReviewMxn: z.number().min(0).max(100_000).nullable(),
});
export type PhysicianPay = z.infer<typeof PhysicianPaySchema>;

/** Un valor de platform_settings, que todos leen sin sesión. undefined si no se pudo leer */
async function readSetting(cloud: Tables, key: string): Promise<unknown> {
  try {
    const { data, error } = await cloud
      .from('platform_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error) return undefined;
    return (data as { value?: unknown } | null)?.value ?? null;
  } catch {
    return undefined;
  }
}

export interface BankSettings {
  limits: BankLimits;
  sync: BankSyncSettings;
  pay: PhysicianPay;
  goal: number;
}

/**
 * Los topes completos y la tarifa, de admin_bank_settings. El freno por hora, los avisos y la tarifa
 * viven en bank_private_settings, que no se lee sin sesión (B5 de la revisión)
 */
const PrivateSettingsSchema = z.object({ limits: z.unknown(), pay: z.unknown() });

/** Los ajustes del banco, con los de fábrica donde falte algo. null si no se pudieron leer */
export async function readBankSettings(
  cloud: Cloud & Tables,
  onForbidden?: ForbiddenHandler,
): Promise<BankSettings | null> {
  const [privateSettings, sync, goal] = await Promise.all([
    callBankRpc(cloud, 'admin_bank_settings', {}, PrivateSettingsSchema, onForbidden).catch(
      () => undefined,
    ),
    readSetting(cloud, 'bank_sync'),
    readSetting(cloud, 'bank_goal'),
  ]);
  if (privateSettings === undefined || sync === undefined || goal === undefined) return null;
  const parsedLimits = BankLimitsSchema.partial().safeParse(privateSettings.limits ?? {});
  const parsedPay = PhysicianPaySchema.safeParse(privateSettings.pay ?? {});
  const parsedGoal = z.object({ approvedToOpen: count }).safeParse(goal ?? {});
  return {
    limits: { ...DEFAULT_BANK_LIMITS, ...(parsedLimits.success ? parsedLimits.data : {}) },
    sync: BankSyncSettingsSchema.parse(sync ?? {}),
    pay: parsedPay.success ? parsedPay.data : { perReviewMxn: null },
    goal: parsedGoal.success ? parsedGoal.data.approvedToOpen : 300,
  };
}

/** Guarda los topes y la tarifa con admin_save_bank_settings, que pone cada campo en su tabla */
export async function saveBankSettings(
  cloud: Cloud,
  settings: { limits: BankLimits; pay: PhysicianPay },
  onForbidden?: ForbiddenHandler,
): Promise<void> {
  await callBankRpc(
    cloud,
    'admin_save_bank_settings',
    {
      p_limits: BankLimitsSchema.parse(settings.limits),
      p_pay: PhysicianPaySchema.parse(settings.pay),
    },
    z.unknown(),
    onForbidden,
  );
}

// ===================================================================== Sincronización

const SyncRunSchema = z.object({
  id: z.string(),
  trigger: z.enum(['cron', 'manual', 'import']),
  target: z.enum(['real', 'test', 'file']),
  mode: z.enum(['dry_run', 'apply']),
  status: z.enum(['running', 'ok', 'partial', 'failed', 'skipped', 'interrupted']),
  reason: z.string().nullable(),
  counts: z.record(z.string(), z.coerce.number()),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
}) satisfies z.ZodType<SyncRunSummary>;

const SyncRowSchema = z.object({
  rowNumber: count.nullable(),
  sheetKey: z.string().nullable(),
  outcome: z.enum(['created', 'versioned', 'converged', 'meta', 'conflict', 'rejected', 'missing']),
  incomplete: z.array(z.string()),
  notices: z.array(z.string()).transform((codes) => codes as SyncNoticeCode[]),
  problems: z.array(
    z.object({
      code: z.string().transform((code) => code as SyncProblemCode),
      column: z.string(),
      value: z.string().optional(),
    }),
  ),
  questionId: z.string().nullable(),
}) satisfies z.ZodType<SyncRowResult>;

export function readSyncRuns(cloud: Cloud, onForbidden?: ForbiddenHandler) {
  return callBankRpc(
    cloud,
    'admin_bank_sync_runs',
    { p_limit: 20 },
    z.array(SyncRunSchema),
    onForbidden,
  );
}

export function readSyncRows(cloud: Cloud, runId: string, onForbidden?: ForbiddenHandler) {
  return callBankRpc(
    cloud,
    'admin_bank_sync_rows',
    { p_run: runId, p_outcome: null, p_limit: 5000, p_offset: 0 },
    z.array(SyncRowSchema),
    onForbidden,
  );
}

export type SyncTarget = 'real' | 'test';

export const SyncStartSchema = z.object({
  runId: z.string().nullable(),
  status: z.enum(['running', 'skipped']),
  reason: z.string().nullable().optional(),
  mode: z.enum(['dry_run', 'apply']).optional(),
});
export type SyncStart = z.infer<typeof SyncStartSchema>;

/**
 * Sincronizar ahora. La función bank-sync revisa la sesión del admin y responde 202 con la corrida,
 * que sigue en segundo plano, o skipped con su motivo (apagada, muy seguida, sin configurar). Sin
 * sesión de admin con segundo factor responde 401
 */
export async function startBankSync(
  cloud: Functions,
  target: SyncTarget,
  onForbidden?: ForbiddenHandler,
): Promise<SyncStart> {
  let reply: Awaited<ReturnType<Functions['functions']['invoke']>>;
  try {
    reply = await cloud.functions.invoke<unknown>('bank-sync', { body: { target } });
  } catch {
    throw new EditorialError('network');
  }
  if (reply.error) {
    const context = (reply.error as { context?: unknown }).context;
    const status = context instanceof Response ? context.status : null;
    if (status === 401 || status === 403) {
      onForbidden?.();
      throw new EditorialError('forbidden');
    }
    if (status === 409) throw new EditorialError('sync_busy');
    throw new EditorialError(status === null ? 'network' : 'unknown');
  }
  const parsed = SyncStartSchema.safeParse(reply.data);
  if (!parsed.success) throw new EditorialError('unknown');
  return parsed.data;
}

/** La importación de la pantalla 22 con destino nube. Hasta 500 renglones por llamada */
export const IMPORT_BATCH = 500;

const ImportResultSchema = z.object({
  runId: z.string().nullable().optional(),
  status: z.string(),
  counts: z.record(z.string(), z.coerce.number()).optional(),
  rows: z.array(
    z.object({ rowNumber: count, outcome: z.string(), questionId: z.string().nullable() }),
  ),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;

export function importBankRows(
  cloud: Cloud,
  rows: readonly SyncRowPayload[],
  onForbidden?: ForbiddenHandler,
) {
  return callBankRpc(cloud, 'admin_bank_import', { p_rows: rows }, ImportResultSchema, onForbidden);
}

// ===================================================================== Conflictos, faltantes y retiro

/** Las preguntas con conflicto, faltantes o que el Sheet pide retirar, de editor_list */
export async function readAttention(cloud: Cloud, onForbidden?: ForbiddenHandler) {
  const [conflicts, all] = await Promise.all([
    callBankRpc(
      cloud,
      'editor_list',
      { p_filter: { view: 'conflict' }, p_limit: 500, p_offset: 0 },
      EditorListSchema,
      onForbidden,
    ),
    callBankRpc(
      cloud,
      'editor_list',
      { p_filter: {}, p_limit: 500, p_offset: 0 },
      EditorListSchema,
      onForbidden,
    ),
  ]);
  return {
    conflicts: conflicts.items,
    missing: all.items.filter((item) => !item.retired && (item.missing || item.retireRequested)),
  };
}

export function confirmMissing(
  cloud: Cloud,
  questionIds: readonly string[],
  action: 'retire' | 'keep',
  onForbidden?: ForbiddenHandler,
) {
  return callBankRpc(
    cloud,
    'admin_confirm_missing',
    { p_question_ids: [...questionIds], p_action: action },
    count,
    onForbidden,
  );
}

export function resolveConflict(
  cloud: Cloud,
  questionId: string,
  choice: 'keep_app' | 'take_sheet',
  onForbidden?: ForbiddenHandler,
) {
  return callBankRpc(
    cloud,
    'editor_resolve_sync_conflict',
    { p_question_id: questionId, p_choice: choice },
    z.string(),
    onForbidden,
  );
}

export function retireQuestion(
  cloud: Cloud,
  questionId: string,
  reason: string,
  onForbidden?: ForbiddenHandler,
) {
  return callBankRpc(
    cloud,
    'admin_retire_question',
    { p_question_id: questionId, p_reason: reason.trim() === '' ? null : reason.trim() },
    z.string(),
    onForbidden,
  );
}

export function restoreQuestion(cloud: Cloud, questionId: string, onForbidden?: ForbiddenHandler) {
  return callBankRpc(
    cloud,
    'admin_restore_question',
    { p_question_id: questionId },
    z.string(),
    onForbidden,
  );
}

// ===================================================================== Asignaciones y claves

export function assignQuestions(
  cloud: Cloud,
  input: { questionIds: readonly string[]; author: string | null; reviewer: string | null },
  onForbidden?: ForbiddenHandler,
) {
  return callBankRpc(
    cloud,
    'admin_assign_questions',
    { p_question_ids: [...input.questionIds], p_author: input.author, p_reviewer: input.reviewer },
    count,
    onForbidden,
  );
}

/** Todas las preguntas de una subespecialidad, para asignarlas juntas */
export async function questionsOfTopic(
  cloud: Cloud,
  branch: string,
  topic: string,
  onForbidden?: ForbiddenHandler,
): Promise<string[]> {
  const list = await callBankRpc(
    cloud,
    'editor_list',
    { p_filter: { branch, topic }, p_limit: 500, p_offset: 0 },
    EditorListSchema,
    onForbidden,
  );
  return list.items.map((item) => item.questionId);
}

export async function setTopicReviewer(
  cloud: Cloud,
  input: { branch: string; topic: string; physician: string },
  onForbidden?: ForbiddenHandler,
): Promise<void> {
  await callBankRpc(
    cloud,
    'admin_set_topic_reviewer',
    { p_branch: input.branch, p_topic: input.topic, p_physician: input.physician },
    z.unknown(),
    onForbidden,
  );
}

export type PhysicianCodeResult = 'ok' | 'taken' | 'not_physician';

export function setPhysicianCode(
  cloud: Cloud,
  userId: string,
  code: string,
  onForbidden?: ForbiddenHandler,
): Promise<PhysicianCodeResult> {
  return callBankRpc(
    cloud,
    'admin_set_physician_code',
    { p_user: userId, p_code: code.trim().toUpperCase() },
    z.enum(['ok', 'taken', 'not_physician']),
    onForbidden,
  );
}

const BankTeamSchema = z.object({
  codes: z.array(z.object({ userId: z.string(), alias: z.string(), code: z.string() })),
  topicReviewers: z.array(
    z.object({
      branch: z.string(),
      topic: z.string(),
      physicianId: z.string(),
      alias: z.string(),
      active: z.boolean(),
    }),
  ),
});
export type BankTeam = z.infer<typeof BankTeamSchema>;

/** Las claves del Sheet de los médicos y el revisor por omisión de cada subespecialidad (B1) */
export function readBankTeam(cloud: Cloud, onForbidden?: ForbiddenHandler) {
  return callBankRpc(cloud, 'admin_bank_team', {}, BankTeamSchema, onForbidden);
}

/** La regla de la clave del Sheet, la misma que physician_codes.code */
export const PHYSICIAN_CODE = /^[A-Z][A-Z0-9]{1,7}$/;

// ===================================================================== Avisos de lectura

const ReadAlertSchema = z.object({
  id: z.coerce.string(),
  userId: z.string(),
  alias: z.string(),
  day: z.string(),
  kind: z.enum(['daily_volume', 'week_share', 'brake']),
  value: z.coerce.number(),
  createdAt: z.string(),
  seenAt: z.string().nullable(),
});
export type ReadAlert = z.infer<typeof ReadAlertSchema>;

export function readReadAlerts(cloud: Cloud, onForbidden?: ForbiddenHandler) {
  return callBankRpc(
    cloud,
    'admin_bank_read_alerts',
    { p_limit: 50 },
    z.array(ReadAlertSchema),
    onForbidden,
  );
}

// ===================================================================== Revisiones para pagar

const ReportRowSchema = z
  .object({
    month: z.string(),
    physician_id: z.string(),
    alias: z.string().nullable(),
    code: z.string().nullable(),
    approved: count,
    changes_requested: count,
    rejected: count,
    reviewed: count,
    distractors_resolved: count,
    amount_mxn: money,
  })
  .transform((row): ReviewReportRow => ({
    month: row.month.slice(0, 7),
    physicianId: row.physician_id,
    alias: row.alias ?? '',
    code: row.code,
    approved: row.approved,
    changesRequested: row.changes_requested,
    rejected: row.rejected,
    reviewed: row.reviewed,
    distractorsResolved: row.distractors_resolved,
    amountMxn: row.amount_mxn,
  }));

const DetailRowSchema = z
  .object({
    decided_at: z.string(),
    month: z.string(),
    physician_id: z.string(),
    alias: z.string().nullable(),
    code: z.string().nullable(),
    question_key: z.string(),
    version: count,
    decision: z.enum(['approve', 'request_changes', 'reject']),
  })
  .transform((row): ReviewReportDetailRow => ({
    decidedAt: row.decided_at,
    month: row.month.slice(0, 7),
    physicianId: row.physician_id,
    alias: row.alias ?? '',
    code: row.code,
    questionKey: row.question_key,
    version: row.version,
    decision: row.decision,
  }));

export function readReviewReport(
  cloud: Cloud,
  range: { from: string; to: string },
  onForbidden?: ForbiddenHandler,
) {
  return callBankRpc(
    cloud,
    'admin_review_report',
    { p_from: range.from, p_to: range.to },
    z.array(ReportRowSchema),
    onForbidden,
  );
}

export function readReviewReportDetail(
  cloud: Cloud,
  range: { from: string; to: string },
  onForbidden?: ForbiddenHandler,
) {
  return callBankRpc(
    cloud,
    'admin_review_report_detail',
    { p_from: range.from, p_to: range.to, p_physician: null },
    z.array(DetailRowSchema),
    onForbidden,
  );
}
