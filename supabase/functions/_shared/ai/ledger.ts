// Libro del día del proxy de IA (8.1 y B12, 2.4). Cuenta las llamadas de cada alumno, sus generaciones
// de tarjetas y el gasto del día para frenar de golpe cuando se pasa un límite. Vive en memoria y, si
// se le da dónde guardarse, sobrevive a reiniciar el proxy, que si no dejaría el presupuesto en cero
// cada vez. En desarrollo se guarda en un archivo (server/src/ai/ledgerFile.ts) y en la nube el mismo
// libro vive en Postgres (pgLedger.ts). Solo guarda el día actual. Sin Node ni Deno (B12, 1.1).
import { z } from 'zod';
import { AI_ENGINES, type AiEngine } from './engines/aiContracts.ts';
import type {
  AdmissionV2,
  AdmitV2Input,
  LedgerPortV2,
  SettlementV2,
  UsageSummaryV2,
} from './ports.ts';

const TIME_ZONE = 'America/Mexico_City';

/** El día en que se cuentan los límites, en hora de México */
export function dayKey(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

const EngineTotals = z.strictObject({
  calls: z.int().nonnegative(),
  costUsd: z.number().nonnegative(),
});
export interface UsageSummary {
  day: string;
  calls: number;
  students: number;
  spentUsd: number;
  byEngine: Partial<Record<AiEngine, { calls: number; costUsd: number }>>;
}

// ---------------------------------------------------------------------------------------------
// Libro del día v2 (B12, 2.4). Las mismas reglas que ai_admit_v2, ai_settle_v2, ai_release_v2 y
// ai_usage_summary_v2 de la migración 20261026000001, para el proxy de desarrollo (con archivo) y
// para las pruebas y las e2e (en memoria)

const UserTotals = z.strictObject({
  calls: z.partialRecord(z.enum(AI_ENGINES), z.int().nonnegative()),
  costUsd: z.number().nonnegative(),
});
const DayStateSchema = z.strictObject({
  version: z.literal(2),
  day: z.string(),
  users: z.record(z.string(), UserTotals),
  /** Llamadas por generación de tarjetas, por alumno */
  generations: z.record(z.string(), z.record(z.string(), z.int().nonnegative())),
  spentUsd: z.number().nonnegative(),
  byEngine: z.partialRecord(z.enum(AI_ENGINES), EngineTotals),
});
export type DayLedgerState = z.infer<typeof DayStateSchema>;

/** Un renglón de la bitácora en memoria. Igual que ai_call_log, sin texto */
export interface DayLedgerLogEntry extends SettlementV2 {
  at: string;
}

/** Lo que el libro sabe de la cola de lotes para el resumen. Sin cola, cero */
export type PendingJobsInfo = () =>
  | Pick<UsageSummaryV2, 'pendingJobs' | 'inFlightUsd'>
  | Promise<Pick<UsageSummaryV2, 'pendingJobs' | 'inFlightUsd'>>;

export interface DayLedgerOptions {
  /** Sin él, el libro vive solo en memoria */
  persistence?: { load(): unknown; save(state: DayLedgerState): void } | null;
  now?: () => Date;
  pendingJobs?: PendingJobsInfo;
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;
const MAX_LOG = 1000;

/** Igual que ai_admit_v2, que rechaza con 22023 una entrada sin sentido */
function validAdmitInput(input: AdmitV2Input): boolean {
  return !(
    !AI_ENGINES.includes(input.engine) ||
    input.userId === '' ||
    input.perStudentPerDay < 1 ||
    input.dailyBudgetUsd < 0 ||
    input.engineShare < 0 ||
    input.perUserDailyUsd < 0 ||
    input.maxGenerations < 1 ||
    input.maxSections < 1
  );
}

/** Reintentos que se aceptan dentro de una generación además de sus secciones (6.1) */
export const GENERATION_RETRIES = 2;

export class DayLedger implements LedgerPortV2 {
  private state: DayLedgerState;
  private readonly options: DayLedgerOptions;
  /** Bitácora de la corrida. No se guarda en el archivo */
  readonly log: DayLedgerLogEntry[] = [];

  constructor(options: DayLedgerOptions = {}) {
    this.options = options;
    this.state = this.load();
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private empty(day: string): DayLedgerState {
    return { version: 2, day, users: {}, generations: {}, spentUsd: 0, byEngine: {} };
  }

  private load(): DayLedgerState {
    const day = dayKey(this.now());
    const persistence = this.options.persistence;
    if (persistence) {
      try {
        const stored = persistence.load();
        if (stored !== null) {
          const parsed = DayStateSchema.parse(stored);
          if (parsed.day === day) return parsed;
        }
      } catch {
        // Un libro dañado o de la versión anterior no frena el proxy. Se empieza el día de nuevo
      }
    }
    return this.empty(day);
  }

  private save(): void {
    this.options.persistence?.save(this.state);
  }

  private roll(): void {
    const day = dayKey(this.now());
    if (this.state.day !== day) this.state = this.empty(day);
  }

  private user(userId: string): DayLedgerState['users'][string] {
    const found = this.state.users[userId];
    if (found) return found;
    const fresh: DayLedgerState['users'][string] = { calls: {}, costUsd: 0 };
    this.state.users[userId] = fresh;
    return fresh;
  }

  /** El estado del día, para las pruebas */
  snapshot(): DayLedgerState {
    this.roll();
    return structuredClone(this.state);
  }

  admit(input: AdmitV2Input): Promise<AdmissionV2> {
    if (!validAdmitInput(input)) return Promise.reject(new Error('Límites de IA no válidos'));
    this.roll();
    const mine = this.state.users[input.userId];
    if ((mine?.calls[input.engine] ?? 0) >= input.perStudentPerDay) {
      return Promise.resolve({ ok: false, reason: 'student_limit' });
    }
    const generations = this.state.generations[input.userId] ?? {};
    if (input.generationRef !== null) {
      const used = generations[input.generationRef] ?? 0;
      const open = Object.values(generations).filter((calls) => calls > 0).length;
      if (
        (used === 0 && open >= input.maxGenerations) ||
        used >= input.maxSections + GENERATION_RETRIES
      ) {
        return Promise.resolve({ ok: false, reason: 'generation_limit' });
      }
    }
    const engineCost = this.state.byEngine[input.engine]?.costUsd ?? 0;
    if (
      this.state.spentUsd >= input.dailyBudgetUsd ||
      engineCost >= input.dailyBudgetUsd * input.engineShare ||
      (!input.staff && (mine?.costUsd ?? 0) >= input.perUserDailyUsd)
    ) {
      return Promise.resolve({ ok: false, reason: 'budget_exceeded' });
    }
    const user = this.user(input.userId);
    user.calls[input.engine] = (user.calls[input.engine] ?? 0) + 1;
    if (input.generationRef !== null) {
      this.state.generations[input.userId] = {
        ...generations,
        [input.generationRef]: (generations[input.generationRef] ?? 0) + 1,
      };
    }
    const totals = this.state.byEngine[input.engine] ?? { calls: 0, costUsd: 0 };
    this.state.byEngine[input.engine] = { calls: totals.calls + 1, costUsd: totals.costUsd };
    this.save();
    return Promise.resolve({ ok: true });
  }

  settle(input: SettlementV2): Promise<void> {
    this.roll();
    const cost = input.real ? Math.max(0, input.costUsd) : 0;
    if (cost > 0) {
      this.state.spentUsd = round6(this.state.spentUsd + cost);
      const totals = this.state.byEngine[input.engine] ?? { calls: 0, costUsd: 0 };
      this.state.byEngine[input.engine] = {
        calls: totals.calls,
        costUsd: round6(totals.costUsd + cost),
      };
      if (input.userId !== null) {
        const user = this.user(input.userId);
        user.costUsd = round6(user.costUsd + cost);
      }
      this.save();
    }
    this.log.push({ ...input, costUsd: cost, at: this.now().toISOString() });
    if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG);
    return Promise.resolve();
  }

  release(input: {
    userId: string;
    engine: AiEngine;
    generationRef: string | null;
  }): Promise<void> {
    this.roll();
    const user = this.state.users[input.userId];
    const used = user?.calls[input.engine] ?? 0;
    if (user && used > 0) user.calls[input.engine] = used - 1;
    const generations = this.state.generations[input.userId];
    if (input.generationRef !== null && generations) {
      const calls = generations[input.generationRef] ?? 0;
      if (calls > 0) generations[input.generationRef] = calls - 1;
    }
    const totals = this.state.byEngine[input.engine];
    if (totals && totals.calls > 0) {
      this.state.byEngine[input.engine] = { calls: totals.calls - 1, costUsd: totals.costUsd };
    }
    this.save();
    return Promise.resolve();
  }

  async summary(): Promise<UsageSummaryV2> {
    this.roll();
    const users = Object.values(this.state.users);
    const calls = users
      .flatMap((user) => Object.values(user.calls))
      .reduce((sum, value) => sum + value, 0);
    const jobs = (await this.options.pendingJobs?.()) ?? { pendingJobs: 0, inFlightUsd: {} };
    return {
      day: this.state.day,
      calls,
      students: users.filter((user) => Object.values(user.calls).some((value) => value > 0)).length,
      spentUsd: this.state.spentUsd,
      byEngine: structuredClone(this.state.byEngine),
      pendingJobs: jobs.pendingJobs,
      inFlightUsd: jobs.inFlightUsd,
    };
  }
}
