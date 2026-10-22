// La función bank-sync (B11, 3.1 a 3.10 del plan de B11). Cron la llama cada hora con su ficha y el
// admin con su sesión desde Banco y Sheet. Responde 202 con el id de la corrida y sigue en segundo plano
// con EdgeRuntime.waitUntil. Lee el Sheet con la cuenta de servicio, lo convierte con el mismo
// convertidor de la app, decide qué hacer con cada renglón y la base aplica cada uno con candado.
//
// Lo que nunca hace. Tocar Google sin una ficha o una sesión de admin válidas, guardar o registrar texto
// de una pregunta (PC 7.3), aprobar, publicar o retirar. Sus registros solo dicen el id de la corrida,
// conteos y códigos. No depende de Deno, así se prueba con Vitest (D-096).
import {
  convertSheetTable,
  type BankTable,
  type SheetConvertResult,
} from './generated/bankConvert.ts';
import { biasTaxonomy } from './generated/biasTaxonomy.ts';
import { sheetHash, type VersionContent } from './generated/contentHash.ts';
import type { SyncApplyResult, SyncOutcome, SyncRowPayload } from './generated/contracts.ts';
import { analyzeStructure } from './generated/structure.ts';
import { structureDictionary } from './generated/structureDict.ts';
import { topicTaxonomy } from './generated/topicTaxonomy.ts';
import {
  GoogleError,
  parseServiceAccount,
  type GoogleClient,
  type ServiceAccountKey,
} from './google.ts';
import {
  countPlan,
  planSheet,
  resolveComparisons,
  versionsToCompare,
  type KnownQuestion,
} from './plan.ts';
import { readBankSheet } from './sheetTable.ts';
import { corsHeaders } from '../http.ts';

export type SyncTrigger = 'cron' | 'manual';
export type SyncTarget = 'real' | 'test';

/** Lo que devuelve bank_sync_begin, ya revisado */
export interface BeginResult {
  runId: string;
  status: 'running' | 'skipped';
  reason: string | null;
  mode: 'dry_run' | 'apply';
  target: SyncTarget | 'file';
  settings: { tab: string; maxRows: number; idPattern: string };
  lastSheetHash: string | null;
  known: KnownQuestion[];
}

export interface FinishInput {
  seenKeys: string[] | null;
  summary: Record<string, number | string>;
  status: 'ok' | 'partial' | 'failed' | 'skipped' | 'interrupted';
  reason: string | null;
}

/** Las funciones de la base que usa la sincronización, con la llave de servicio */
export interface BankSyncStore {
  begin(trigger: SyncTrigger, target: SyncTarget, actorId: string | null): Promise<BeginResult>;
  versionsContent(versionIds: readonly string[]): Promise<Map<string, VersionContent>>;
  apply(
    runId: string,
    rows: readonly SyncRowPayload[],
    forceDryRun: boolean,
  ): Promise<SyncApplyResult[]>;
  finish(runId: string, input: FinishInput): Promise<void>;
}

export interface BankSyncEnv {
  /** Dirección de la app, para CORS de Sincronizar ahora */
  appUrl?: string | undefined;
  /** APP_ORIGINS, más orígenes de la app para ese CORS mientras dura una mudanza de dominio (B17, 4.1) */
  appOrigins?: string | undefined;
  /** GOOGLE_SA_KEY, la llave JSON de la cuenta de servicio. Nunca se registra */
  serviceAccountKey?: string | undefined;
  /** GOOGLE_BANK_SHEET_ID y GOOGLE_BANK_TEST_SHEET_ID */
  sheetId?: string | undefined;
  testSheetId?: string | undefined;
}

export interface BankSyncDeps {
  env: BankSyncEnv;
  log: (line: string) => void;
  /** El id del admin dueño del token, o null */
  authorizeAdmin: (authorization: string) => Promise<string | null>;
  /** Si la ficha de Cron es la de Vault */
  cronOk: (token: string) => Promise<boolean>;
  store: BankSyncStore;
  google: (key: ServiceAccountKey) => GoogleClient;
  /** EdgeRuntime.waitUntil en Supabase. En las pruebas guarda la promesa */
  waitUntil: (work: Promise<unknown>) => void;
  /** Avisa qué corrida está en curso, para marcarla si la función se apaga (beforeunload) */
  onRun?: (runId: string | null) => void;
}

export const CRON_TOKEN_HEADER = 'x-bank-sync-token';
/** Renglones por llamada a bank_sync_apply. Cada llamada es una transacción */
export const APPLY_BATCH = 100;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** Revisa lo que devolvió bank_sync_begin. Lanza si no tiene la forma esperada */
export function parseBegin(value: unknown): BeginResult {
  if (!isRecord(value)) throw new Error('bank_sync_begin no devolvió un objeto');
  const runId = str(value.runId);
  const status = value.status;
  if (runId === null || (status !== 'running' && status !== 'skipped')) {
    throw new Error('bank_sync_begin no devolvió la corrida');
  }
  const settings = isRecord(value.settings) ? value.settings : {};
  const known = Array.isArray(value.known) ? value.known.filter(isRecord) : [];
  return {
    runId,
    status,
    reason: str(value.reason),
    mode: value.mode === 'apply' ? 'apply' : 'dry_run',
    target: value.target === 'test' ? 'test' : value.target === 'file' ? 'file' : 'real',
    settings: {
      tab: str(settings.tab) ?? 'Preguntas',
      maxRows: typeof settings.maxRows === 'number' ? settings.maxRows : 5000,
      idPattern: str(settings.idPattern) ?? '^[A-Z]{2,4}-[0-9]{4,5}$',
    },
    lastSheetHash: str(value.lastSheetHash),
    known: known.flatMap((row) => {
      const key = str(row.key);
      const questionId = str(row.questionId);
      const latestVersionId = str(row.latestVersionId);
      if (key === null || questionId === null || latestVersionId === null) return [];
      return [
        {
          key,
          questionId,
          rowHash: str(row.rowHash),
          metaHash: str(row.metaHash),
          latestVersionId,
          latestSource: str(row.latestSource),
          appliedVersionId: str(row.appliedVersionId),
          forceNext: row.forceNext === true,
          conflictRowHash: str(row.conflictRowHash),
          status: row.status === 'retired' ? 'retired' : 'active',
        } satisfies KnownQuestion,
      ];
    }),
  };
}

/** Revisa lo que devolvió bank_sync_versions_content */
export function parseVersionsContent(value: unknown): Map<string, VersionContent> {
  const contents = new Map<string, VersionContent>();
  for (const item of Array.isArray(value) ? value : []) {
    if (!isRecord(item) || !isRecord(item.content)) continue;
    const versionId = str(item.versionId);
    if (versionId !== null) contents.set(versionId, item.content as unknown as VersionContent);
  }
  return contents;
}

/** Revisa lo que devolvió bank_sync_apply */
export function parseApplyResults(value: unknown): SyncApplyResult[] {
  const outcomes: readonly SyncOutcome[] = [
    'created',
    'versioned',
    'converged',
    'meta',
    'conflict',
    'rejected',
    'missing',
  ];
  return (Array.isArray(value) ? value : []).flatMap((item) => {
    if (!isRecord(item) || typeof item.rowNumber !== 'number') return [];
    const outcome = outcomes.find((candidate) => candidate === item.outcome) ?? 'rejected';
    return [{ rowNumber: item.rowNumber, outcome, questionId: str(item.questionId) }];
  });
}

function reply(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
  });
}

/** La petición a bank-sync. 401 sin ficha ni sesión de admin, sin tocar Google */
export async function handleBankSync(request: Request, deps: BankSyncDeps): Promise<Response> {
  // El mismo CORS que las demás funciones (http.ts). Solo la dirección de la app y las de APP_ORIGINS
  const headers = corsHeaders(
    { APP_URL: deps.env.appUrl, APP_ORIGINS: deps.env.appOrigins },
    request.headers.get('origin'),
  );
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ error: 'method' }, 405, headers);

  let trigger: SyncTrigger;
  let target: SyncTarget = 'real';
  let actorId: string | null = null;
  const token = request.headers.get(CRON_TOKEN_HEADER);
  const authorization = request.headers.get('authorization');
  if (token) {
    if (!(await deps.cronOk(token))) return reply({ error: 'unauthorized' }, 401, headers);
    trigger = 'cron';
  } else if (authorization) {
    actorId = await deps.authorizeAdmin(authorization);
    if (actorId === null) return reply({ error: 'unauthorized' }, 401, headers);
    trigger = 'manual';
    try {
      const body: unknown = JSON.parse(await request.text());
      if (isRecord(body) && body.target === 'test') target = 'test';
    } catch {
      target = 'real';
    }
  } else {
    return reply({ error: 'unauthorized' }, 401, headers);
  }

  let begin: BeginResult;
  try {
    begin = await deps.store.begin(trigger, target, actorId);
  } catch {
    deps.log(`bank-sync ${trigger} ${target} no pudo empezar la corrida`);
    return reply({ error: 'internal' }, 500, headers);
  }
  if (begin.status === 'skipped') {
    deps.log(`bank-sync ${begin.runId} skipped ${begin.reason ?? ''}`);
    return reply({ runId: begin.runId, status: 'skipped', reason: begin.reason }, 200, headers);
  }
  const key = parseServiceAccount(deps.env.serviceAccountKey);
  const sheetId = target === 'test' ? deps.env.testSheetId : deps.env.sheetId;
  if (!key || !sheetId) {
    try {
      await deps.store.finish(begin.runId, {
        seenKeys: null,
        summary: {},
        status: 'skipped',
        reason: 'not_configured',
      });
    } catch {
      deps.log(`bank-sync ${begin.runId} no pudo cerrar la corrida not_configured`);
      return reply({ error: 'internal' }, 500, headers);
    }
    deps.log(`bank-sync ${begin.runId} skipped not_configured`);
    return reply({ runId: begin.runId, status: 'skipped', reason: 'not_configured' }, 200, headers);
  }
  deps.onRun?.(begin.runId);
  deps.waitUntil(
    runSync(deps, begin, deps.google(key), sheetId, trigger).finally(() => deps.onRun?.(null)),
  );
  return reply({ runId: begin.runId, status: 'running', mode: begin.mode }, 202, headers);
}

/** El Sheet ya leído con el convertidor de la app, sus taxonomías y su motor de estructura */
export function convertBankTable(table: BankTable, idPattern: string): SheetConvertResult {
  return convertSheetTable(table, {
    data: { branches: topicTaxonomy.branches, biases: biasTaxonomy.biases },
    analyze: (question) => {
      const auto = analyzeStructure(question, structureDictionary);
      return { polarity: auto.polarity, task: auto.task };
    },
    idPattern,
  });
}

export interface SyncReport {
  status: FinishInput['status'];
  reason: string | null;
  counts: Record<string, number>;
}

/** Corre la sincronización de una corrida ya empezada. Nunca lanza, la deja terminada */
export async function runSync(
  deps: BankSyncDeps,
  begin: BeginResult,
  client: GoogleClient,
  sheetId: string,
  trigger: SyncTrigger,
): Promise<SyncReport> {
  const finish = async (
    report: SyncReport,
    seenKeys: string[] | null,
    extra: Record<string, string> = {},
  ) => {
    await deps.store.finish(begin.runId, {
      seenKeys,
      summary: { ...report.counts, ...extra },
      status: report.status,
      reason: report.reason,
    });
    deps.log(
      `bank-sync ${begin.runId} ${report.status} ${report.reason ?? ''} ${JSON.stringify(report.counts)}`,
    );
    return report;
  };
  try {
    const read = await readBankSheet(client, sheetId, begin.settings, topicTaxonomy.branches);
    const converted = convertBankTable(read.table, begin.settings.idPattern);
    if (converted.missingColumns.length > 0) {
      return await finish(
        {
          status: 'failed',
          reason: 'columns_missing',
          counts: { missingColumns: converted.missingColumns.length },
        },
        null,
      );
    }
    const hash = await sheetHash(
      read.table.headers,
      read.table.rows.map((row) => row.cells),
    );
    // Saltar por la huella solo si ninguna pregunta pide la siguiente corrida (M4 de la revisión). La
    // base ya no da huella en ese caso. Esto lo cuida también si llega de una base vieja
    if (
      trigger === 'cron' &&
      hash === begin.lastSheetHash &&
      !begin.known.some((question) => question.forceNext)
    ) {
      return await finish(
        { status: 'skipped', reason: 'no_changes', counts: { read: converted.counts.read } },
        null,
      );
    }
    const plan = await planSheet(converted, begin.known);
    const compare = versionsToCompare(plan);
    if (compare.length > 0)
      await resolveComparisons(plan, await deps.store.versionsContent(compare));

    // Con fórmulas en la columna ID la corrida baja a solo reporte (8.1). El Sheet de prueba ya llega así
    const dryRun = begin.mode === 'dry_run' || read.idFormula;
    const payloads = plan.rows.map((row) => {
      if (!dryRun) return row.payload;
      const { question: _question, ...rest } = row.payload;
      return rest;
    });
    const results: SyncApplyResult[] = [];
    for (let start = 0; start < payloads.length; start += APPLY_BATCH) {
      results.push(
        ...(await deps.store.apply(
          begin.runId,
          payloads.slice(start, start + APPLY_BATCH),
          read.idFormula,
        )),
      );
    }

    const planned = countPlan(converted, plan);
    const outcome = (name: SyncOutcome) => results.filter((item) => item.outcome === name).length;
    const counts: Record<string, number> = {
      ...planned,
      created: outcome('created'),
      versioned: outcome('versioned'),
      converged: outcome('converged'),
      meta: outcome('meta'),
      conflict: outcome('conflict'),
      rejected: outcome('rejected'),
      truncated: read.truncated ? 1 : 0,
      ...(read.topicMismatches === null ? {} : { topicMismatches: read.topicMismatches }),
    };
    return await finish(
      {
        status: counts.rejected || counts.conflict ? 'partial' : 'ok',
        reason: read.idFormula ? 'id_formula' : null,
        counts,
      },
      plan.seenKeys,
      { sheetHash: hash },
    );
  } catch (error) {
    const reason =
      error instanceof GoogleError ? `sheet_error:${error.step}:${error.status}` : 'internal';
    try {
      return await finish({ status: 'failed', reason, counts: {} }, null);
    } catch {
      deps.log(`bank-sync ${begin.runId} failed ${reason}, no se pudo cerrar la corrida`);
      return { status: 'failed', reason, counts: {} };
    }
  }
}
