// Libro del día alojado (D-103, Fase G bloque G1). Hace lo mismo que Ledger, pero en Postgres, con
// las funciones ai_admit, ai_release, ai_settle y ai_usage_summary de la migración 20261010000001.
// Así los límites por alumno y el presupuesto sobreviven a reiniciar el servidor y se comparten
// entre copias. Solo el servidor lo usa, con la llave de servicio. No guarda texto de alumnos.
import { z } from 'zod';
import { AI_ENGINES, type AiEngine } from '../../../src/engines/aiContracts.ts';
import type { Admission, LedgerPort, Settlement, UsageSummary } from './ledger.ts';

/** Llama a una función de Postgres y devuelve su resultado. Falla si el servidor contesta con error */
export type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;

const SummarySchema = z.object({
  day: z.string(),
  calls: z.number(),
  students: z.number(),
  spentUsd: z.number(),
  byEngine: z.partialRecord(
    z.enum(AI_ENGINES),
    z.object({ calls: z.number(), costUsd: z.number() }),
  ),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El libro necesita un UUID de Supabase. Cualquier otra cosa es un error nuestro y se dice */
function userOf(studentRef: string): string {
  if (!UUID.test(studentRef)) throw new Error('El libro de IA alojado pide el ID de la cuenta');
  return studentRef;
}

export class PgLedger implements LedgerPort {
  private readonly rpc: Rpc;

  constructor(rpc: Rpc) {
    this.rpc = rpc;
  }

  async admit(input: {
    studentRef: string;
    engine: AiEngine;
    perStudentPerDay: number;
    dailyBudgetUsd: number;
  }): Promise<Admission> {
    const result = await this.rpc('ai_admit', {
      p_user: userOf(input.studentRef),
      p_engine: input.engine,
      p_per_student: input.perStudentPerDay,
      p_budget: input.dailyBudgetUsd,
    });
    if (result === 'ok') return { ok: true };
    if (result === 'student_limit' || result === 'budget_exceeded') {
      return { ok: false, reason: result };
    }
    throw new Error('Respuesta inesperada del libro de IA');
  }

  async release(input: { studentRef: string; engine: AiEngine }): Promise<void> {
    await this.rpc('ai_release', { p_user: userOf(input.studentRef), p_engine: input.engine });
  }

  async settle(input: Settlement): Promise<void> {
    await this.rpc('ai_settle', {
      p_user: input.studentRef ? userOf(input.studentRef) : null,
      p_engine: input.engine,
      p_model: input.model ?? null,
      p_real: input.real,
      p_ok: input.ok ?? true,
      p_cost: input.costUsd,
      p_input: input.inputTokens ?? null,
      p_output: input.outputTokens ?? null,
      p_latency: input.latencyMs === undefined ? null : Math.round(input.latencyMs),
    });
  }

  async summary(): Promise<UsageSummary> {
    return SummarySchema.parse(await this.rpc('ai_usage_summary', {}));
  }
}

/** Llama a las funciones por la API REST de Supabase con la llave de servicio */
export function createRestRpc(options: {
  url: string;
  serviceKey: string;
  fetchImpl?: typeof fetch;
}): Rpc {
  const fetchImpl = options.fetchImpl ?? fetch;
  return async (name, args) => {
    const response = await fetchImpl(`${options.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: options.serviceKey,
        authorization: `Bearer ${options.serviceKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // Nunca se vuelca el cuerpo, que podría traer datos de la petición
      throw new Error(`La función ${name} contestó ${String(response.status)}`);
    }
    // Una función que no devuelve nada contesta con el cuerpo vacío
    const text = await response.text();
    return text === '' ? null : (JSON.parse(text) as unknown);
  };
}
