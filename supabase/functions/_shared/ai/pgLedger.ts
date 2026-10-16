// Libro del día en Postgres (B12, 2.4 y 6.1). Hace lo mismo que DayLedger con las funciones
// ai_admit_v2, ai_settle_v2, ai_release_v2 y ai_usage_summary_v2 de la migración 20261026000001. Así
// los límites por alumno, las cuotas por motor y el presupuesto se comparten entre copias de la Edge
// Function. Solo la función lo usa, con la llave de servicio. No guarda texto de alumnos.
import { z } from 'zod';
import { AI_ENGINES, BATCH_ENGINES, type AiEngine } from './engines/aiContracts.ts';
import type {
  AdmissionV2,
  AdmitV2Input,
  LedgerPortV2,
  SettlementV2,
  UsageSummaryV2,
} from './ports.ts';
import type { Rpc } from './rest.ts';

export { createRestRpc, type Rpc } from './rest.ts';

const SummarySchema = z.object({
  day: z.string(),
  calls: z.number(),
  students: z.number(),
  spentUsd: z.number(),
  byEngine: z.partialRecord(
    z.enum(AI_ENGINES),
    z.object({ calls: z.number(), costUsd: z.number() }),
  ),
  pendingJobs: z.number(),
  inFlightUsd: z.partialRecord(z.enum(BATCH_ENGINES), z.number()),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El libro necesita un UUID de Supabase. Cualquier otra cosa es un error nuestro y se dice */
function userOf(userId: string): string {
  if (!UUID.test(userId)) throw new Error('El libro de IA en la nube pide el ID de la cuenta');
  return userId;
}

export class PgLedger implements LedgerPortV2 {
  private readonly rpc: Rpc;

  constructor(rpc: Rpc) {
    this.rpc = rpc;
  }

  async admit(input: AdmitV2Input): Promise<AdmissionV2> {
    const result = await this.rpc('ai_admit_v2', {
      p_user: userOf(input.userId),
      p_engine: input.engine,
      p_staff: input.staff,
      p_per_student: input.perStudentPerDay,
      p_budget: input.dailyBudgetUsd,
      p_engine_share: input.engineShare,
      p_user_budget: input.perUserDailyUsd,
      p_generation: input.generationRef,
      p_max_generations: input.maxGenerations,
      p_max_sections: input.maxSections,
      p_reserve: input.reserveUsd ?? 0,
    });
    if (result === 'ok') return { ok: true };
    if (
      result === 'student_limit' ||
      result === 'generation_limit' ||
      result === 'budget_exceeded'
    ) {
      return { ok: false, reason: result };
    }
    throw new Error('Respuesta inesperada del libro de IA');
  }

  async release(input: {
    userId: string;
    engine: AiEngine;
    generationRef: string | null;
    reservedUsd?: number;
  }): Promise<void> {
    await this.rpc('ai_release_v2', {
      p_user: userOf(input.userId),
      p_engine: input.engine,
      p_generation: input.generationRef,
      p_reserved: input.reservedUsd ?? 0,
    });
  }

  async settle(input: SettlementV2): Promise<void> {
    await this.rpc('ai_settle_v2', {
      p_user: input.userId === null ? null : userOf(input.userId),
      p_engine: input.engine,
      p_model: input.model,
      p_real: input.real,
      p_ok: input.ok,
      p_cost: input.costUsd,
      p_input: input.inputTokens,
      p_output: input.outputTokens,
      p_cache_read: input.cacheReadTokens,
      p_cache_write: input.cacheWriteTokens,
      p_latency: Math.round(input.latencyMs),
      p_mode: input.mode,
      p_outcome: input.outcome,
      p_prompt_version: input.promptVersion,
      p_refusal: input.refusalCategory,
      p_job: input.jobId,
      p_reserved: input.reservedUsd ?? 0,
    });
  }

  async summary(): Promise<UsageSummaryV2> {
    return SummarySchema.parse(await this.rpc('ai_usage_summary_v2', {}));
  }
}
