// Los puertos del núcleo de IA en memoria (B12, 1.5 y 8.2). Siguen las mismas reglas que las funciones
// de la base (20261026000001 a 20261026000003), así las pruebas, las e2e de nube y el proxy de
// desarrollo ven lo mismo que la Edge Function sin Postgres. El libro del día es DayLedger de
// ledger.ts. Aquí están la cola de trabajos, la compuerta, la configuración y quién llama.
// Sin Node ni Deno, como el resto del núcleo.
import {
  type AiCallMeta,
  type AiEngine,
  type AiErrorCode,
  type AiGateEngineState,
  type AiGateState,
  type BatchEngine,
} from '../engines/aiContracts.ts';
import { DEFAULT_CONFIG, type AiConfig } from '../config.ts';
import { currentAudits, engineGate } from '../gate.ts';
import {
  ACTIVE_JOB_STATUSES,
  finishPayload,
  JOB_KEY_PATTERN,
  jobStatusOf,
  OUTPUT_RETENTION_DAYS,
  REQUEUE_CAPS,
  REQUEUE_FAILURE,
  REUSE_DAYS,
  settlementOfFinish,
  type JobStatusRow,
} from '../jobStore.ts';
import { DayLedger } from '../ledger.ts';
import type {
  AiCaller,
  BatchRow,
  BatchRowStatus,
  ClaimedJobs,
  Clock,
  ConfigStore,
  EnqueueInput,
  EnqueueResult,
  GateReader,
  JobFinish,
  JobRowStatus,
  JobStore,
  RequeueReason,
  SettlementV2,
  StaleClaim,
  StoredJob,
  UsageSummaryV2,
  WhoAmI,
  WhoAmIFailure,
} from '../ports.ts';
import type { PromptSets } from '../prompts.ts';

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------------------------
// Cola de trabajos

/** Una fila de ai_jobs */
export interface MemoryJobRow {
  id: string;
  userId: string | null;
  engine: BatchEngine;
  jobKey: string;
  input: unknown;
  inputHash: string;
  promptVersion: string;
  model: string;
  status: JobRowStatus;
  attempts: number;
  issues: string[];
  claimId: string | null;
  claimedAt: number | null;
  batchId: string | null;
  estimatedCostUsd: number | null;
  output: unknown;
  meta: AiCallMeta | null;
  error: AiErrorCode | null;
  costUsd: number;
  createdAt: number;
  submittedAt: number | null;
  finishedAt: number | null;
  deliveredAt: number | null;
}

/** Una fila de ai_batches */
export interface MemoryBatchRow {
  id: string;
  status: BatchRowStatus;
  requestCount: number;
  createdAt: number;
  lastPolledAt: number | null;
  endedAt: number | null;
  processedAt: number | null;
  deletedRemoteAt: number | null;
}

export interface MemoryJobStoreOptions {
  clock?: Clock;
  /** Ids de trabajos y reclamos. Por omisión crypto.randomUUID */
  ids?: () => string;
  /** Dónde se asienta lo que costó un trabajo terminado, como ai_job_finish con ai_settle_v2 */
  settle?: (settlement: SettlementV2) => Promise<void>;
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
const isActive = (row: MemoryJobRow) => ACTIVE_JOB_STATUSES.includes(row.status);

export class MemoryJobStore implements JobStore {
  readonly rows: MemoryJobRow[] = [];
  readonly batches = new Map<string, MemoryBatchRow>();
  /** La fila de ai_tick_lease */
  tickLease: { holder: string; until: number } | null = null;
  private readonly clock: Clock;
  private readonly ids: () => string;
  private settleWith: ((settlement: SettlementV2) => Promise<void>) | null;

  constructor(options: MemoryJobStoreOptions = {}) {
    this.clock = options.clock ?? (() => Date.now());
    this.ids = options.ids ?? (() => crypto.randomUUID());
    this.settleWith = options.settle ?? null;
  }

  /** Conecta el libro después de crear la cola, porque el resumen del libro también la lee */
  attachSettle(settle: (settlement: SettlementV2) => Promise<void>): void {
    this.settleWith = settle;
  }

  private statusRow(row: MemoryJobRow): JobStatusRow {
    return {
      jobKey: row.jobKey,
      engine: row.engine,
      status: row.status,
      output: row.output,
      meta: row.meta,
      error: row.error,
      queuedAt: new Date(row.createdAt).toISOString(),
      readyAt: iso(row.finishedAt),
    };
  }

  private stored(row: MemoryJobRow): StoredJob {
    return {
      id: row.id,
      userId: row.userId,
      engine: row.engine,
      jobKey: row.jobKey,
      input: structuredClone(row.input),
      model: row.model,
      promptVersion: row.promptVersion,
      attempts: row.attempts,
      issues: [...row.issues],
    };
  }

  private newRow(input: EnqueueInput, now: number): MemoryJobRow {
    return {
      id: this.ids(),
      userId: input.userId,
      engine: input.engine,
      jobKey: input.jobKey,
      input: structuredClone(input.input),
      inputHash: input.inputHash,
      promptVersion: input.promptVersion,
      model: input.model,
      status: 'queued',
      attempts: 0,
      issues: [],
      claimId: null,
      claimedAt: null,
      batchId: null,
      estimatedCostUsd: null,
      output: null,
      meta: null,
      error: null,
      costUsd: 0,
      createdAt: now,
      submittedAt: null,
      finishedAt: null,
      deliveredAt: null,
    };
  }

  /** ai_job_enqueue con la fila tal cual, para el Supabase simulado */
  enqueueRow(
    input: EnqueueInput,
  ):
    | { outcome: 'queued' | 'existing' | 'reused'; row: JobStatusRow }
    | { outcome: 'too_many_pending' } {
    if (!JOB_KEY_PATTERN.test(input.jobKey) || input.maxPending < 1) {
      throw new Error('Trabajo de IA no válido');
    }
    if (input.userId === null && input.engine !== 'restructure') {
      throw new Error('Solo una reestructurada de sistema va sin alumno');
    }
    const now = this.clock();
    const mine = this.rows.filter((row) => row.userId === input.userId);
    const active = mine.find(
      (row) => isActive(row) && row.engine === input.engine && row.jobKey === input.jobKey,
    );
    if (active) return { outcome: 'existing', row: this.statusRow(active) };

    const ready = mine
      .filter(
        (row) =>
          row.status === 'ready' &&
          row.engine === input.engine &&
          row.inputHash === input.inputHash &&
          row.promptVersion === input.promptVersion &&
          row.model === input.model &&
          row.output !== null &&
          (row.finishedAt ?? 0) > now - REUSE_DAYS * DAY_MS,
      )
      .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
    const same = ready.find((row) => row.jobKey === input.jobKey) ?? ready[0];
    if (same) {
      if (same.jobKey === input.jobKey) return { outcome: 'reused', row: this.statusRow(same) };
      // Otra llave con la misma entrada, como otro dispositivo de la cuenta. Se copia la salida
      const copy: MemoryJobRow = {
        ...this.newRow(input, now),
        input: null,
        status: 'ready',
        output: structuredClone(same.output),
        meta: structuredClone(same.meta),
        finishedAt: now,
      };
      this.rows.push(copy);
      return { outcome: 'reused', row: this.statusRow(copy) };
    }

    if (mine.filter(isActive).length >= input.maxPending) return { outcome: 'too_many_pending' };
    const row = this.newRow(input, now);
    this.rows.push(row);
    return { outcome: 'queued', row: this.statusRow(row) };
  }

  enqueue(input: EnqueueInput): Promise<EnqueueResult> {
    const result = this.enqueueRow(input);
    if (result.outcome === 'too_many_pending') return Promise.resolve(result);
    return Promise.resolve({ outcome: result.outcome, job: jobStatusOf(result.row) });
  }

  /** ai_job_status con las filas tal cual. La más nueva de cada llave. Marca entregadas las terminadas */
  statusRows(userId: string, jobKeys: readonly string[]): JobStatusRow[] {
    const now = this.clock();
    const found: JobStatusRow[] = [];
    for (const key of new Set(jobKeys)) {
      // La más nueva, y entre dos del mismo instante la que se creó después (ai_jobs.seq)
      const row = this.rows
        .filter((item) => item.userId === userId && item.jobKey === key)
        .reduce<MemoryJobRow | undefined>(
          (best, item) => (!best || item.createdAt >= best.createdAt ? item : best),
          undefined,
        );
      if (!row) continue;
      if ((row.status === 'ready' || row.status === 'failed') && row.deliveredAt === null) {
        row.deliveredAt = now;
      }
      found.push(this.statusRow(row));
    }
    return found;
  }

  status(userId: string, jobKeys: readonly string[]) {
    return Promise.resolve(this.statusRows(userId, jobKeys).map(jobStatusOf));
  }

  claim(limit: number): Promise<ClaimedJobs> {
    const claimId = this.ids();
    const now = this.clock();
    const queued = this.rows
      .filter((row) => row.status === 'queued')
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, Math.max(0, limit));
    for (const row of queued) {
      row.status = 'submitting';
      row.claimId = claimId;
      row.claimedAt = now;
    }
    return Promise.resolve({ claimId, jobs: queued.map((row) => this.stored(row)) });
  }

  submitted(
    claimId: string,
    batchId: string,
    estimates: Readonly<Record<string, number>>,
  ): Promise<void> {
    const now = this.clock();
    let count = 0;
    for (const row of this.rows) {
      if (row.claimId !== claimId || row.status !== 'submitting') continue;
      const estimate = estimates[row.id];
      if (estimate === undefined) {
        // No cupo en el presupuesto. Vuelve a la cola sin contar intento
        row.status = 'queued';
        row.claimId = null;
        row.claimedAt = null;
        continue;
      }
      row.status = 'submitted';
      row.batchId = batchId;
      row.submittedAt = now;
      row.estimatedCostUsd = estimate;
      row.attempts += 1;
      count += 1;
    }
    if (!this.batches.has(batchId)) {
      this.batches.set(batchId, {
        id: batchId,
        status: 'in_progress',
        requestCount: count,
        createdAt: now,
        lastPolledAt: null,
        endedAt: null,
        processedAt: null,
        deletedRemoteAt: null,
      });
    }
    return Promise.resolve();
  }

  unclaim(claimId: string): Promise<void> {
    for (const row of this.rows) {
      if (row.claimId === claimId && row.status === 'submitting') {
        row.status = 'queued';
        row.claimId = null;
        row.claimedAt = null;
      }
    }
    return Promise.resolve();
  }

  due(minMinutes: number): Promise<BatchRow[]> {
    const now = this.clock();
    const due = [...this.batches.values()]
      .filter(
        (batch) =>
          batch.status === 'ended' ||
          ((batch.status === 'in_progress' || batch.status === 'canceling') &&
            (batch.lastPolledAt ?? batch.createdAt) <= now - minMinutes * 60_000),
      )
      .sort((a, b) => a.createdAt - b.createdAt);
    const rows = due.map((batch) => ({
      id: batch.id,
      status: batch.status,
      requestCount: batch.requestCount,
      createdAt: new Date(batch.createdAt).toISOString(),
      lastPolledAt: iso(batch.lastPolledAt),
    }));
    for (const batch of due) if (batch.status !== 'ended') batch.lastPolledAt = now;
    return Promise.resolve(rows);
  }

  async mark(batchId: string, status: BatchRowStatus): Promise<void> {
    const batch = this.batches.get(batchId);
    if (!batch) return;
    const now = this.clock();
    batch.status = status;
    if (status === 'ended' && batch.endedAt === null) batch.endedAt = now;
    if (status === 'processed') {
      batch.processedAt = now;
      batch.deletedRemoteAt = now;
      for (const row of this.rows) {
        if (row.batchId === batchId && row.status === 'submitted') {
          await this.requeue(
            row.id,
            ['El lote terminó sin resultado para este trabajo'],
            'expired',
          );
        }
      }
    }
  }

  pending(batchId: string, jobIds: readonly string[]): Promise<StoredJob[]> {
    const ids = new Set(jobIds);
    return Promise.resolve(
      this.rows
        .filter((row) => row.batchId === batchId && row.status === 'submitted' && ids.has(row.id))
        .map((row) => this.stored(row)),
    );
  }

  async finish(jobId: string, result: JobFinish): Promise<void> {
    const row = this.rows.find((item) => item.id === jobId);
    if (row?.status !== 'submitted') return;
    const payload = finishPayload(result);
    row.status = result.status;
    row.finishedAt = this.clock();
    row.input = null;
    row.costUsd = payload.real ? payload.costUsd : 0;
    if (result.status === 'ready') {
      row.output = structuredClone(result.output);
      row.meta = structuredClone(result.meta);
    } else {
      row.error = result.error;
    }
    await this.settleWith?.(settlementOfFinish(this.stored({ ...row }), payload));
  }

  requeue(jobId: string, issues: readonly string[], reason: RequeueReason) {
    const row = this.rows.find((item) => item.id === jobId);
    if (!row) return Promise.resolve('failed' as const);
    if (row.status !== 'submitted') {
      return Promise.resolve(row.status === 'failed' ? ('failed' as const) : ('requeued' as const));
    }
    if (row.attempts >= REQUEUE_CAPS[reason]) {
      row.status = 'failed';
      row.error = REQUEUE_FAILURE[reason];
      row.finishedAt = this.clock();
      row.input = null;
      return Promise.resolve('failed' as const);
    }
    row.status = 'queued';
    row.issues = [...issues];
    row.claimId = null;
    row.claimedAt = null;
    row.batchId = null;
    row.submittedAt = null;
    row.estimatedCostUsd = null;
    return Promise.resolve('requeued' as const);
  }

  scrub(): Promise<number> {
    const limit = this.clock() - OUTPUT_RETENTION_DAYS * DAY_MS;
    let count = 0;
    for (const row of this.rows) {
      let changed = false;
      if ((row.status === 'ready' || row.status === 'failed') && row.input !== null) {
        row.input = null;
        changed = true;
      }
      const since = row.deliveredAt ?? row.finishedAt;
      if (row.output !== null && since !== null && since < limit) {
        row.output = null;
        changed = true;
      }
      if (changed) count += 1;
    }
    return Promise.resolve(count);
  }

  lease(holder: string, seconds: number): Promise<boolean> {
    const now = this.clock();
    const current = this.tickLease;
    if (current && current.until > now && current.holder !== holder) return Promise.resolve(false);
    this.tickLease = { holder, until: now + Math.max(0, seconds) * 1000 };
    return Promise.resolve(true);
  }

  stale(minMinutes: number): Promise<StaleClaim[]> {
    const limit = this.clock() - minMinutes * 60_000;
    const claims = new Map<string, StaleClaim>();
    for (const row of this.rows) {
      if (row.status !== 'submitting' || row.claimId === null || row.claimedAt === null) continue;
      if (row.claimedAt > limit) continue;
      const claim = claims.get(row.claimId) ?? {
        claimId: row.claimId,
        claimedAt: new Date(row.claimedAt).toISOString(),
        jobIds: [],
      };
      claim.jobIds.push(row.id);
      claims.set(row.claimId, claim);
    }
    return Promise.resolve([...claims.values()]);
  }

  /** Lo que el resumen del libro dice de la cola (pendingJobs e inFlightUsd) */
  pendingInfo(): Pick<UsageSummaryV2, 'pendingJobs' | 'inFlightUsd'> {
    const inFlightUsd: UsageSummaryV2['inFlightUsd'] = {};
    for (const row of this.rows) {
      if (row.status !== 'submitted') continue;
      inFlightUsd[row.engine] =
        Math.round(((inFlightUsd[row.engine] ?? 0) + (row.estimatedCostUsd ?? 0)) * 1e6) / 1e6;
    }
    return { pendingJobs: this.rows.filter(isActive).length, inFlightUsd };
  }
}

// ---------------------------------------------------------------------------------------------
// Compuerta, configuración y quién llama

export interface MemoryGate extends GateReader {
  state: AiGateState;
  /** Abre un motor con la configuración y el prompt de hoy, como admin_ai_gate_set */
  open(engine: AiEngine, current: { config: AiConfig; prompts: PromptSets }): Promise<void>;
  close(engine: AiEngine): void;
  pause(paused: boolean): void;
  /** Lo que vería un alumno */
  gateOf(
    engine: AiEngine,
    current: { config: AiConfig; prompts: PromptSets },
  ): Promise<'open' | 'gated'>;
}

export function memoryGate(initial: AiGateState = { paused: false, engines: {} }): MemoryGate {
  const gate: MemoryGate = {
    state: structuredClone(initial),
    read: () => Promise.resolve(structuredClone(gate.state)),
    async open(engine, current) {
      const audit = (await currentAudits(current.config, current.prompts))[engine];
      const state: AiGateEngineState = {
        open: true,
        ...audit,
        sampleId: 'memoria',
        at: new Date().toISOString(),
      };
      gate.state.engines[engine] = state;
    },
    close(engine) {
      const found = gate.state.engines[engine];
      if (found) found.open = false;
    },
    pause(paused) {
      gate.state.paused = paused;
    },
    async gateOf(engine, current) {
      const audit = (await currentAudits(current.config, current.prompts))[engine];
      return engineGate(gate.state, engine, audit);
    },
  };
  return gate;
}

export interface MemoryConfigStore extends ConfigStore {
  current: AiConfig;
  saved: AiConfig[];
  loads: number;
}

export function memoryConfigStore(initial: AiConfig = DEFAULT_CONFIG): MemoryConfigStore {
  const store: MemoryConfigStore = {
    current: structuredClone(initial),
    saved: [],
    loads: 0,
    load() {
      store.loads += 1;
      return Promise.resolve(structuredClone(store.current));
    },
    save(config) {
      store.current = structuredClone(config);
      store.saved.push(structuredClone(config));
      return Promise.resolve();
    },
  };
  return store;
}

/** Cada token es una cuenta o una falla. Un token desconocido es una sesión vencida */
export function memoryWhoAmI(
  accounts: Readonly<Record<string, AiCaller | WhoAmIFailure>>,
): WhoAmI & { calls: string[] } {
  const calls: string[] = [];
  const whoami = (token: string) => {
    calls.push(token);
    const found = accounts[token];
    if (found === undefined)
      return Promise.resolve({ ok: false as const, failure: 'unauthenticated' as const });
    if (typeof found === 'string') return Promise.resolve({ ok: false as const, failure: found });
    return Promise.resolve({ ok: true as const, caller: { ...found } });
  };
  return Object.assign(whoami, { calls });
}

// ---------------------------------------------------------------------------------------------
// Todo junto

export interface MemoryAi {
  ledger: DayLedger;
  jobs: MemoryJobStore;
  gate: MemoryGate;
  configStore: MemoryConfigStore;
}

/** El libro, la cola, la compuerta y la configuración en memoria, conectados entre sí */
export function createMemoryAi(
  options: { clock?: Clock; ids?: () => string; config?: AiConfig; gate?: AiGateState } = {},
): MemoryAi {
  const clock = options.clock ?? (() => Date.now());
  const jobs = new MemoryJobStore({ clock, ...(options.ids ? { ids: options.ids } : {}) });
  const ledger = new DayLedger({
    now: () => new Date(clock()),
    pendingJobs: () => jobs.pendingInfo(),
  });
  jobs.attachSettle((settlement) => ledger.settle(settlement));
  return {
    ledger,
    jobs,
    gate: memoryGate(options.gate),
    configStore: memoryConfigStore(options.config),
  };
}
