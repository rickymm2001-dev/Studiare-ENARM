// Corre los casos dorados de los motores de IA y calcula las métricas de la sección 8.7. Validez del
// esquema en el primer intento, anclaje de lo que sí se contesta, rechazos correctos de lo que no se
// puede contestar, costo y latencia. Sirve igual con las respuestas fijas que con el modelo real.
import { AI_ENGINES, type AiEngine } from '../../src/engines/aiContracts.ts';
import { runEngine, type RunDeps } from '../src/ai/run.ts';
import { buildCases, type GoldenCase } from './cases.ts';

export interface CaseResult {
  id: string;
  engine: AiEngine;
  expect: GoldenCase['expect'];
  /** La salida del primer intento cumplió el esquema */
  schemaValid: boolean;
  /** Salió una respuesta que pasó el esquema y las guardas, tras el reintento si hizo falta */
  accepted: boolean;
  /** La respuesta aceptada no trae nada, como una hipótesis nula o cero tarjetas */
  empty: boolean;
  /** Se necesitó el reintento */
  retried: boolean;
  /** El caso hizo lo que se esperaba de él */
  passed: boolean;
  /** Si se rechazó, por qué */
  error: string | null;
  costUsd: number;
  latencyMs: number;
  issues: string[];
}

function isEmpty(engine: AiEngine, output: unknown): boolean {
  if (engine === 'forgetting') return (output as { hypothesis: unknown }).hypothesis === null;
  if (engine === 'flashcards') return (output as { cards: unknown[] }).cards.length === 0;
  return false;
}

export async function evaluateCase(deps: RunDeps, golden: GoldenCase): Promise<CaseResult> {
  const result = await runEngine(deps, golden.engine, golden.input as never);
  const first = result.trace[0];
  const accepted = result.ok;
  const empty = result.ok && isEmpty(golden.engine, result.output);
  // Sin respuesta cuenta como bien hecho solo si el motor rechazó por no poder anclar, no si se cayó
  const passed =
    golden.expect === 'answer'
      ? accepted && !empty
      : (accepted && empty) || (!result.ok && result.error === 'invalid_output');
  return {
    id: golden.id,
    engine: golden.engine,
    expect: golden.expect,
    schemaValid: first?.schemaValid ?? false,
    accepted,
    empty,
    retried: result.trace.length > 1,
    passed,
    error: result.ok ? null : result.error,
    costUsd: result.ok ? result.meta.estimatedCostUsd : result.cost.estimatedCostUsd,
    latencyMs: result.ok ? result.meta.latencyMs : result.cost.latencyMs,
    issues: result.trace.flatMap((attempt) => attempt.issues).slice(0, 5),
  };
}

export interface RunOptions {
  engines?: readonly AiEngine[];
  /** Máximo de casos por motor. Para probar con el modelo real sin gastar de más */
  limitPerEngine?: number;
  /** Para de correr cuando el costo acumulado pasa de esta cifra */
  maxCostUsd?: number;
}

export async function runEvaluation(
  deps: RunDeps,
  options: RunOptions = {},
): Promise<{ results: CaseResult[]; stoppedByBudget: boolean }> {
  const engines = new Set(options.engines ?? AI_ENGINES);
  const taken = new Map<AiEngine, number>();
  const cases = buildCases().filter((golden) => {
    if (!engines.has(golden.engine)) return false;
    const count = taken.get(golden.engine) ?? 0;
    if (options.limitPerEngine !== undefined && count >= options.limitPerEngine) return false;
    taken.set(golden.engine, count + 1);
    return true;
  });
  const results: CaseResult[] = [];
  let spent = 0;
  for (const golden of cases) {
    if (options.maxCostUsd !== undefined && spent >= options.maxCostUsd) {
      return { results, stoppedByBudget: true };
    }
    const result = await evaluateCase(deps, golden);
    spent += result.costUsd;
    results.push(result);
  }
  return { results, stoppedByBudget: false };
}

export interface EngineSummary {
  engine: AiEngine | 'total';
  cases: number;
  answerCases: number;
  rejectionCases: number;
  /** Casos cuyo primer intento cumplió el esquema, sobre todos */
  schemaValid: number;
  /** Casos de respuesta que quedaron aceptados con contenido, sobre los de respuesta */
  grounded: number;
  /** Casos sin respuesta bien resueltos, sobre los sin respuesta */
  rejectedRight: number;
  retried: number;
  costUsd: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
}

const ratio = (part: number, whole: number) => (whole === 0 ? 1 : part / whole);

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;
}

function summarizeGroup(
  label: EngineSummary['engine'],
  group: readonly CaseResult[],
): EngineSummary {
  const answers = group.filter((item) => item.expect === 'answer');
  const rejections = group.filter((item) => item.expect === 'no_answer');
  const latencies = group.map((item) => item.latencyMs);
  return {
    engine: label,
    cases: group.length,
    answerCases: answers.length,
    rejectionCases: rejections.length,
    schemaValid: group.filter((item) => item.schemaValid).length,
    grounded: answers.filter((item) => item.passed).length,
    rejectedRight: rejections.filter((item) => item.passed).length,
    retried: group.filter((item) => item.retried).length,
    costUsd: Math.round(group.reduce((sum, item) => sum + item.costUsd, 0) * 1e6) / 1e6,
    avgLatencyMs: latencies.length
      ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
      : 0,
    p95LatencyMs: percentile(latencies, 0.95),
  };
}

export function summarize(results: readonly CaseResult[]): EngineSummary[] {
  const engines = AI_ENGINES.filter((engine) => results.some((item) => item.engine === engine));
  return [
    ...engines.map((engine) =>
      summarizeGroup(
        engine,
        results.filter((item) => item.engine === engine),
      ),
    ),
    summarizeGroup('total', results),
  ];
}

/** Metas para cerrar la Fase D (8.7). Todo al 100% */
export interface Targets {
  schema: boolean;
  grounding: boolean;
  rejection: boolean;
  met: boolean;
}

export function checkTargets(total: EngineSummary): Targets {
  const schema = total.schemaValid === total.cases;
  const grounding = total.grounded === total.answerCases;
  const rejection = total.rejectedRight === total.rejectionCases;
  return { schema, grounding, rejection, met: schema && grounding && rejection };
}

const percent = (part: number, whole: number) => `${(ratio(part, whole) * 100).toFixed(0)}%`;

export function formatReport(
  summary: readonly EngineSummary[],
  results: readonly CaseResult[],
  context: { mode: 'real' | 'mock'; stoppedByBudget: boolean },
): string {
  const total = summary.find((item) => item.engine === 'total');
  const targets = total ? checkTargets(total) : null;
  const lines = [
    `Evaluación de los motores de IA en modo ${context.mode === 'mock' ? 'simulado (respuestas fijas, sin costo)' : 'real'}`,
    '',
    `| Motor | Casos | Esquema | Anclaje | Rechazos | Reintentos | ${
      context.mode === 'mock' ? 'Costo teórico (USD)' : 'Costo (USD)'
    } | Latencia media | Latencia p95 |`,
    '|---|---|---|---|---|---|---|---|---|',
    ...summary.map(
      (item) =>
        `| ${item.engine} | ${item.cases} | ${percent(item.schemaValid, item.cases)} | ${percent(item.grounded, item.answerCases)} | ${percent(item.rejectedRight, item.rejectionCases)} | ${item.retried} | ${item.costUsd.toFixed(4)} | ${item.avgLatencyMs} ms | ${item.p95LatencyMs} ms |`,
    ),
    '',
  ];
  if (targets) {
    const mark = (ok: boolean) => (ok ? 'cumplida' : 'NO cumplida');
    lines.push(
      `Meta de esquema válido en 100% de los casos ${mark(targets.schema)}.`,
      `Meta de anclaje correcto en 100% de las respuestas ${mark(targets.grounding)}.`,
      `Meta de rechazo correcto en los casos sin explicación ${mark(targets.rejection)}.`,
    );
  }
  if (context.mode === 'mock') {
    lines.push(
      '',
      'El costo teórico se calcula con los precios configurados y los tokens aproximados de las respuestas fijas. No hubo gasto real.',
    );
  }
  if (context.stoppedByBudget)
    lines.push('', 'Se detuvo antes de terminar porque llegó al tope de costo.');
  const failed = results.filter((item) => !item.passed);
  if (failed.length > 0) {
    lines.push('', 'Casos que no hicieron lo esperado');
    for (const item of failed) {
      lines.push(
        `- ${item.id}${item.error ? ` (${item.error})` : ''}${item.issues[0] ? `. ${item.issues[0]}` : ''}`,
      );
    }
  }
  return lines.join('\n');
}
