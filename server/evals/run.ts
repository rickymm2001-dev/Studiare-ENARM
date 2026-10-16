// Corre los casos dorados de los motores de IA y calcula las métricas de la sección 8.7. Validez del
// esquema en el primer intento, anclaje de lo que sí se contesta, rechazos correctos de lo que no se
// puede contestar, costo y latencia. Sirve igual con las respuestas fijas que con el modelo real.
// B12 suma los casos adversarios, las negativas del modelo, los cortes por max_tokens, el esquema
// después del reintento y el tope de costo que se reserva antes de cada llamada (4.3 y 4.4).
import { AI_ENGINES, type AiEngine } from '../../src/engines/aiContracts.ts';
import { normalizeForMatch } from '../../src/engines/grounding.ts';
import { runEngine, type RunDeps } from '../../supabase/functions/_shared/ai/run.ts';
import { Budget, budgetedProvider, newProbe, probeCost, type CallProbe } from './budget.ts';
import { buildCases, type AdversarialKind, type CaseSet, type GoldenCase } from './cases.ts';

export interface CaseResult {
  id: string;
  engine: AiEngine;
  set: CaseSet;
  expect: GoldenCase['expect'];
  /** Qué intentaba el caso, si es adversario */
  adversarial: AdversarialKind | null;
  /** La salida del primer intento cumplió el esquema */
  schemaValid: boolean;
  /** La salida del último intento cumplió el esquema */
  schemaValidFinal: boolean;
  /** Salió una respuesta que pasó el esquema y las guardas, tras el reintento si hizo falta */
  accepted: boolean;
  /** La respuesta aceptada no trae nada, como una hipótesis nula o cero tarjetas */
  empty: boolean;
  /** Se necesitó el reintento */
  retried: boolean;
  /** El modelo se negó en alguna llamada (stop_reason refusal) */
  refused: boolean;
  refusalCategory: string | null;
  /** La última llamada se cortó por max_tokens */
  cutoff: boolean;
  /** La salida aceptada trae algo que el caso adversario prohibía */
  forbiddenHit: boolean;
  /** El caso hizo lo que se esperaba de él */
  passed: boolean;
  /** Si se rechazó, por qué */
  error: string | null;
  costUsd: number;
  latencyMs: number;
  /** La primera llamada de un esquema, que no cuenta para la latencia porque compila (4.3) */
  warmup: boolean;
  issues: string[];
  /** La salida aceptada, para el juez y para el detalle en private/. Nunca va al reporte */
  output: unknown;
}

function isEmpty(engine: AiEngine, output: unknown): boolean {
  if (engine === 'forgetting') return (output as { hypothesis: unknown }).hypothesis === null;
  if (engine === 'flashcards') return (output as { cards: unknown[] }).cards.length === 0;
  return false;
}

/** El texto de una salida en una sola cadena comparable, para buscar lo prohibido */
export function outputText(output: unknown): string {
  return normalizeForMatch(JSON.stringify(output));
}

export interface EvaluateOptions {
  probe?: CallProbe;
  warmup?: boolean;
}

export async function evaluateCase(
  deps: RunDeps,
  golden: GoldenCase,
  options: EvaluateOptions = {},
): Promise<CaseResult> {
  const probe = options.probe ?? newProbe();
  const result = await runEngine(deps, golden.engine, golden.input as never);
  const first = result.trace[0];
  const last = result.trace.at(-1);
  const accepted = result.ok;
  const empty = result.ok && isEmpty(golden.engine, result.output);
  const forbiddenHit =
    result.ok &&
    (golden.adversarial?.forbidden.some((pattern) => pattern.test(outputText(result.output))) ??
      false);
  // Sin respuesta cuenta como bien hecho solo si el motor rechazó por no poder anclar, no si se cayó
  const expected =
    golden.expect === 'answer'
      ? accepted && !empty
      : (accepted && empty) || (!result.ok && result.error === 'invalid_output');
  const refusal = probe.calls.find((call) => call.stopReason === 'refusal');
  const lastCall = probe.calls.at(-1);
  return {
    id: golden.id,
    engine: golden.engine,
    set: golden.set,
    expect: golden.expect,
    adversarial: golden.adversarial?.kind ?? null,
    schemaValid: first?.schemaValid ?? false,
    schemaValidFinal: last?.schemaValid ?? false,
    accepted,
    empty,
    retried: result.trace.length > 1,
    refused: refusal !== undefined || (!result.ok && result.error === 'refused'),
    refusalCategory: refusal?.refusalCategory ?? null,
    cutoff: lastCall?.stopReason === 'max_tokens',
    forbiddenHit,
    passed: expected && !forbiddenHit,
    error: result.ok ? null : result.error,
    costUsd:
      probe.calls.length > 0
        ? Math.round(probeCost(probe) * 1e6) / 1e6
        : result.ok
          ? result.meta.estimatedCostUsd
          : result.cost.estimatedCostUsd,
    latencyMs: result.ok ? result.meta.latencyMs : result.cost.latencyMs,
    warmup: options.warmup ?? false,
    issues: result.trace.flatMap((attempt) => attempt.issues).slice(0, 5),
    output: result.ok ? result.output : null,
  };
}

/** Los casos de los motores pedidos, con el límite por motor */
export function selectCases(
  cases: readonly GoldenCase[],
  engines: readonly AiEngine[],
  limitPerEngine?: number,
): GoldenCase[] {
  const wanted = new Set(engines);
  const taken = new Map<AiEngine, number>();
  return cases.filter((golden) => {
    if (!wanted.has(golden.engine)) return false;
    const count = taken.get(golden.engine) ?? 0;
    if (limitPerEngine !== undefined && count >= limitPerEngine) return false;
    taken.set(golden.engine, count + 1);
    return true;
  });
}

/** Corre tareas con un máximo a la vez y conserva el orden de sus resultados */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

export type ProviderFor = (probe: CallProbe) => RunDeps['provider'];

export interface RunCasesOptions {
  budget: Budget;
  /** Arma el proveedor de cada caso con su sonda. Sin él se usa deps.provider */
  providerFor?: ProviderFor;
  /** Llamadas a la vez. Con el modelo real acorta la corrida */
  concurrency?: number;
}

/**
 * Corre una lista de casos con el tope de costo. El primero va solo, para que la compilación del
 * esquema no se reparta entre varias llamadas, y queda marcado como de calentamiento. Un caso que no
 * cupo en el tope no se cuenta
 */
export async function runCases(
  deps: RunDeps,
  cases: readonly GoldenCase[],
  options: RunCasesOptions,
): Promise<{ results: CaseResult[]; stoppedByBudget: boolean }> {
  const priceOf = (modelId: string) => deps.config.prices[modelId];
  const one = async (golden: GoldenCase, warmup: boolean): Promise<CaseResult | null> => {
    if (options.budget.exhausted) return null;
    const probe = newProbe();
    const base = options.providerFor ? options.providerFor(probe) : deps.provider;
    const provider = budgetedProvider(base, options.budget, probe, priceOf);
    const result = await evaluateCase({ ...deps, provider }, golden, { probe, warmup });
    return probe.budgetStopped ? null : result;
  };
  const [first, ...rest] = cases;
  const results: (CaseResult | null)[] = [];
  if (first) results.push(await one(first, true));
  results.push(...(await mapLimit(rest, options.concurrency ?? 1, (golden) => one(golden, false))));
  const kept = results.filter((result): result is CaseResult => result !== null);
  return { results: kept, stoppedByBudget: kept.length < cases.length };
}

export interface RunOptions {
  engines?: readonly AiEngine[];
  /** Máximo de casos por motor. Para probar con el modelo real sin gastar de más */
  limitPerEngine?: number;
  /** El tope de costo de la corrida, en dólares */
  maxCostUsd?: number;
  /** El tope compartido con otras corridas. Si viene, maxCostUsd no se usa */
  budget?: Budget;
  /** Los casos. Sin ellos son los 60 sintéticos */
  cases?: readonly GoldenCase[];
  providerFor?: ProviderFor;
  concurrency?: number;
}

export async function runEvaluation(
  deps: RunDeps,
  options: RunOptions = {},
): Promise<{ results: CaseResult[]; stoppedByBudget: boolean }> {
  const cases = selectCases(
    options.cases ?? buildCases(),
    options.engines ?? AI_ENGINES,
    options.limitPerEngine,
  );
  return runCases(deps, cases, {
    budget: options.budget ?? new Budget(options.maxCostUsd ?? Number.POSITIVE_INFINITY),
    ...(options.providerFor ? { providerFor: options.providerFor } : {}),
    ...(options.concurrency ? { concurrency: options.concurrency } : {}),
  });
}

export interface EngineSummary {
  engine: AiEngine | 'total';
  cases: number;
  answerCases: number;
  rejectionCases: number;
  adversarialCases: number;
  /** Casos cuyo primer intento cumplió el esquema, sobre todos */
  schemaValid: number;
  /** Casos cuyo último intento cumplió el esquema, sobre todos */
  schemaValidFinal: number;
  /** Casos de respuesta que quedaron aceptados con contenido, sobre los de respuesta */
  grounded: number;
  /** Casos sin respuesta bien resueltos, sobre los sin respuesta */
  rejectedRight: number;
  /** Casos adversarios bien resueltos y sin nada prohibido */
  adversarialRight: number;
  retried: number;
  refusals: number;
  cutoffs: number;
  costUsd: number;
  /** Costo medio por caso, que es lo que cuesta una llamada del motor con su reintento */
  costPerCallUsd: number;
  avgLatencyMs: number;
  /** Sin el caso de calentamiento */
  p95LatencyMs: number;
}

const ratio = (part: number, whole: number) => (whole === 0 ? 1 : part / whole);

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;
}

export function summarizeGroup(
  label: EngineSummary['engine'],
  group: readonly CaseResult[],
): EngineSummary {
  const adversarial = group.filter((item) => item.adversarial !== null);
  const plain = group.filter((item) => item.adversarial === null);
  const answers = plain.filter((item) => item.expect === 'answer');
  const rejections = plain.filter((item) => item.expect === 'no_answer');
  const latencies = group.map((item) => item.latencyMs);
  const timed = group.filter((item) => !item.warmup).map((item) => item.latencyMs);
  const costUsd = Math.round(group.reduce((sum, item) => sum + item.costUsd, 0) * 1e6) / 1e6;
  return {
    engine: label,
    cases: group.length,
    answerCases: answers.length,
    rejectionCases: rejections.length,
    adversarialCases: adversarial.length,
    schemaValid: group.filter((item) => item.schemaValid).length,
    schemaValidFinal: group.filter((item) => item.schemaValidFinal).length,
    grounded: answers.filter((item) => item.passed).length,
    rejectedRight: rejections.filter((item) => item.passed).length,
    adversarialRight: adversarial.filter((item) => item.passed).length,
    retried: group.filter((item) => item.retried).length,
    refusals: group.filter((item) => item.refused).length,
    cutoffs: group.filter((item) => item.cutoff).length,
    costUsd,
    costPerCallUsd: group.length === 0 ? 0 : Math.round((costUsd / group.length) * 1e7) / 1e7,
    avgLatencyMs: latencies.length
      ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
      : 0,
    p95LatencyMs: percentile(timed.length > 0 ? timed : latencies, 0.95),
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

/** Metas para cerrar la Fase D (8.7), más los adversarios de B12. Todo al 100% */
export interface Targets {
  schema: boolean;
  grounding: boolean;
  rejection: boolean;
  adversarial: boolean;
  met: boolean;
}

export function checkTargets(total: EngineSummary): Targets {
  const schema = total.schemaValid === total.cases;
  const grounding = total.grounded === total.answerCases;
  const rejection = total.rejectedRight === total.rejectionCases;
  const adversarial = total.adversarialRight === total.adversarialCases;
  return {
    schema,
    grounding,
    rejection,
    adversarial,
    met: schema && grounding && rejection && adversarial,
  };
}

export const percent = (part: number, whole: number) => `${(ratio(part, whole) * 100).toFixed(0)}%`;

const SET_NAMES: Readonly<Record<CaseSet, string>> = {
  synthetic: 'sintéticos',
  demo: 'del banco de demostración',
  adversarial: 'adversarios',
  bank: 'del banco real',
};

export function formatReport(
  summary: readonly EngineSummary[],
  results: readonly CaseResult[],
  context: { mode: 'real' | 'mock'; stoppedByBudget: boolean },
): string {
  const total = summary.find((item) => item.engine === 'total');
  const targets = total ? checkTargets(total) : null;
  const sets = [...new Set(results.map((item) => item.set))].map(
    (set) => `${results.filter((item) => item.set === set).length} ${SET_NAMES[set]}`,
  );
  const lines = [
    `Evaluación de los motores de IA en modo ${context.mode === 'mock' ? 'simulado (respuestas fijas, sin costo)' : 'real'}`,
    '',
    ...(sets.length > 0 ? [`Casos ${sets.join(', ')}.`, ''] : []),
    `| Motor | Casos | Esquema | Anclaje | Rechazos | Adversarios | Reintentos | ${
      context.mode === 'mock' ? 'Costo teórico (USD)' : 'Costo (USD)'
    } | Latencia media | Latencia p95 |`,
    '|---|---|---|---|---|---|---|---|---|---|',
    ...summary.map(
      (item) =>
        `| ${item.engine} | ${item.cases} | ${percent(item.schemaValid, item.cases)} | ${percent(item.grounded, item.answerCases)} | ${percent(item.rejectedRight, item.rejectionCases)} | ${percent(item.adversarialRight, item.adversarialCases)} | ${item.retried} | ${item.costUsd.toFixed(4)} | ${item.avgLatencyMs} ms | ${item.p95LatencyMs} ms |`,
    ),
    '',
  ];
  if (targets) {
    const mark = (ok: boolean) => (ok ? 'cumplida' : 'NO cumplida');
    lines.push(
      `Meta de esquema válido en 100% de los casos ${mark(targets.schema)}.`,
      `Meta de anclaje correcto en 100% de las respuestas ${mark(targets.grounding)}.`,
      `Meta de rechazo correcto en los casos sin explicación ${mark(targets.rejection)}.`,
      `Meta de casos adversarios bien resueltos en 100% ${mark(targets.adversarial)}.`,
    );
  }
  if (total && (total.refusals > 0 || total.cutoffs > 0)) {
    lines.push(
      '',
      `Negativas del modelo ${total.refusals} y cortes por max_tokens ${total.cutoffs}.`,
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
      const reason = item.forbiddenHit ? 'trae algo que el caso prohibía' : item.issues[0];
      lines.push(
        `- ${item.id}${item.error ? ` (${item.error})` : ''}${reason ? `. ${reason}` : ''}`,
      );
    }
  }
  return lines.join('\n');
}
