/**
 * Costos de IA (8.1, pantalla 23).
 *
 * Qué hace. Resume la bitácora de llamadas a los motores de IA. Cuánto se gastó, cuánto por motor y
 * por día, y cuánto costaría un alumno al mes si siguiera usando la IA igual. Separa el gasto real
 * del teórico, que es lo que costarían las respuestas simuladas con los precios configurados y
 * nunca se cobra.
 * Entradas. Las llamadas de la bitácora, la zona horaria y los mínimos para proyectar.
 * Salidas. Totales por modo, por motor y por día, y la proyección por alumno al mes.
 * Método. Sumas simples. La proyección divide el costo entre los alumnos y los días que abarca la
 * bitácora y lo lleva a 30 días. Con pocas llamadas o pocos días no se proyecta y se calibra.
 * Umbrales. Los pasa quien llama. Por omisión 30 llamadas y 3 días.
 */
import type { AiEngine } from './aiContracts.ts';
import { AI_ENGINES } from './aiContracts.ts';
import { studyDayOf } from './studyDay';

export type CallMode = 'real' | 'mock' | 'template';

export interface CallRecord {
  userId?: string | null | undefined;
  engine: AiEngine;
  mode: CallMode;
  model: string;
  at: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  outcome: 'ok' | 'retried_ok' | 'fallback' | 'error';
}

export interface CostBucket {
  calls: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  avgLatencyMs: number;
  /** Llamadas que acabaron en la plantilla sin IA o en error */
  failed: number;
  retried: number;
}

const EMPTY: CostBucket = {
  calls: 0,
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  avgLatencyMs: 0,
  failed: 0,
  retried: 0,
};

const money = (value: number) => Math.round(value * 1e6) / 1e6;

export function bucketOf(calls: readonly CallRecord[]): CostBucket {
  if (calls.length === 0) return EMPTY;
  const sum = (pick: (call: CallRecord) => number) =>
    calls.reduce((total, call) => total + pick(call), 0);
  return {
    calls: calls.length,
    costUsd: money(sum((call) => call.estimatedCostUsd)),
    inputTokens: sum((call) => call.inputTokens),
    outputTokens: sum((call) => call.outputTokens),
    cacheWriteTokens: sum((call) => call.cacheWriteTokens),
    cacheReadTokens: sum((call) => call.cacheReadTokens),
    avgLatencyMs: Math.round(sum((call) => call.latencyMs) / calls.length),
    failed: calls.filter((call) => call.outcome === 'fallback' || call.outcome === 'error').length,
    retried: calls.filter((call) => call.outcome === 'retried_ok').length,
  };
}

export interface CostSummary {
  total: CostBucket;
  /** El gasto real es el de las llamadas al modelo. El simulado es teórico y no se cobra */
  real: CostBucket;
  simulated: CostBucket;
  byEngine: { engine: AiEngine; real: CostBucket; simulated: CostBucket }[];
  /** Del día más reciente al más antiguo */
  byDay: { day: string; calls: number; realCostUsd: number; simulatedCostUsd: number }[];
}

export function summarizeCosts(calls: readonly CallRecord[], timeZone: string): CostSummary {
  const real = calls.filter((call) => call.mode === 'real');
  const simulated = calls.filter((call) => call.mode !== 'real');
  const engines = AI_ENGINES.filter((engine) => calls.some((call) => call.engine === engine));
  const days = new Map<string, { calls: number; real: number; simulated: number }>();
  for (const call of calls) {
    const day = studyDayOf(new Date(call.at), timeZone);
    const entry = days.get(day) ?? { calls: 0, real: 0, simulated: 0 };
    entry.calls += 1;
    if (call.mode === 'real') entry.real += call.estimatedCostUsd;
    else entry.simulated += call.estimatedCostUsd;
    days.set(day, entry);
  }
  return {
    total: bucketOf(calls),
    real: bucketOf(real),
    simulated: bucketOf(simulated),
    byEngine: engines.map((engine) => ({
      engine,
      real: bucketOf(real.filter((call) => call.engine === engine)),
      simulated: bucketOf(simulated.filter((call) => call.engine === engine)),
    })),
    byDay: [...days.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, entry]) => ({
        day,
        calls: entry.calls,
        realCostUsd: money(entry.real),
        simulatedCostUsd: money(entry.simulated),
      })),
  };
}

export const PROJECTION_MIN_CALLS = 30;
export const PROJECTION_MIN_DAYS = 3;
const DAYS_PER_MONTH = 30;

export type Projection =
  | { ready: false; have: number; need: number; unit: 'calls' | 'days' }
  | {
      ready: true;
      usdPerStudentMonth: number;
      /** De qué gasto sale. Real si ya hubo llamadas al modelo, y teórico si solo hubo simuladas */
      basis: 'real' | 'simulated';
      students: number;
      days: number;
      calls: number;
    };

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

/** Lo que costaría un alumno al mes si usara la IA como lo hizo en la bitácora */
export function projectMonthlyPerStudent(
  calls: readonly CallRecord[],
  timeZone: string,
  minimums: { calls?: number; days?: number } = {},
): Projection {
  const minCalls = minimums.calls ?? PROJECTION_MIN_CALLS;
  const minDays = minimums.days ?? PROJECTION_MIN_DAYS;
  const real = calls.filter((call) => call.mode === 'real');
  const basis = real.length > 0 ? 'real' : 'simulated';
  const used = basis === 'real' ? real : calls;
  if (used.length < minCalls)
    return { ready: false, have: used.length, need: minCalls, unit: 'calls' };

  const days = used.map((call) => dayNumber(studyDayOf(new Date(call.at), timeZone)));
  const span = Math.max(...days) - Math.min(...days) + 1;
  if (span < minDays) return { ready: false, have: span, need: minDays, unit: 'days' };

  const students = new Set(used.map((call) => call.userId ?? 'sin-alumno')).size;
  const cost = used.reduce((total, call) => total + call.estimatedCostUsd, 0);
  return {
    ready: true,
    usdPerStudentMonth: money((cost / students / span) * DAYS_PER_MONTH),
    basis,
    students,
    days: span,
    calls: used.length,
  };
}
