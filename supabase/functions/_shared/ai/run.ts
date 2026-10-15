// Ejecuta un motor de IA de principio a fin (8.1). Arma el mensaje, llama al proveedor, valida la
// salida con el esquema del motor y con sus guardas de anclaje. Si algo falla, reintenta una vez
// diciéndole al modelo qué falló. Si vuelve a fallar, no devuelve nada y la app cae a su plantilla
// sin IA. Suma los tokens de todos los intentos, porque los dos cuestan. Una negativa del modelo no
// se reintenta (B12, 2.8). validateOutput la usa también la recolección de lotes (3.4).
import {
  ENGINE_CONTRACTS,
  type AiCallMeta,
  type AiEngine,
  type AiErrorCode,
  type EngineInputs,
} from './engines/aiContracts.ts';
import {
  GUARD_MESSAGES,
  guardFlashcards,
  guardOutput,
  type GuardResult,
} from './engines/aiGuards.ts';
import { MOCK_MODEL } from './engines/aiMock.ts';
import type { AiConfig } from './config.ts';
import { addUsage, EMPTY_USAGE, estimateCostUsd, worstCallCostUsd, type Usage } from './cost.ts';
import { ERROR_MESSAGES } from './messages.ts';
import type { CallOutcome } from './ports.ts';
import { buildUserMessage, type PromptSets } from './prompts.ts';
import { ProviderError, type AiProvider, type ProviderFailure } from './provider.ts';

/** Intentos con reintento por validación. Uno extra, como pide la especificación */
export const VALIDATION_RETRIES = 1;

/**
 * El peor costo de una llamada de este motor con esta entrada, antes de hacerla: sus dos intentos
 * (el primero y el reintento por validación) con la entrada completa y la salida llena hasta max_tokens,
 * según el modelo y los precios de la configuración. Es lo que la ruta reserva al admitirla (ai_admit_v2).
 * 0 si el modelo no tiene precio, porque entonces tampoco se cobra nada que reservar. No cuenta los
 * reintentos del SDK, que solo cobra la API cuando termina la respuesta
 */
export function worstCaseCostUsd(
  deps: Pick<RunDeps, 'config' | 'prompts'>,
  engine: AiEngine,
  input: unknown,
): number {
  const model = deps.config.models[engine];
  const price = deps.config.prices[model.id];
  if (!price) return 0;
  const text = `${deps.prompts[engine].text}${buildUserMessage(input)}`;
  return worstCallCostUsd(price, text, model.maxTokens, VALIDATION_RETRIES + 1);
}

export interface RunDeps {
  provider: AiProvider;
  prompts: PromptSets;
  config: AiConfig;
  /** Claves de los textos académicos que una controversia puede citar */
  sourceKeys: ReadonlySet<string>;
  /** Reloj en milisegundos, para medir la latencia */
  clock?: () => number;
}

export interface CostReport {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
}

/** Qué pasó en cada intento, para las evaluaciones. El esquema se mide en el primer intento */
export interface AttemptTrace {
  /** La salida cumplió el esquema del motor. false también si no hubo salida que leer */
  schemaValid: boolean;
  /** Pasó las guardas de anclaje. null si no llegó a revisarse */
  guardPassed: boolean | null;
  issues: string[];
}

export type RunResult =
  | { ok: true; output: unknown; meta: AiCallMeta; trace: AttemptTrace[] }
  | {
      ok: false;
      error: AiErrorCode;
      message: string;
      cost: CostReport;
      trace: AttemptTrace[];
      /** Cómo termina en ai_call_log.outcome (2.5) */
      outcome: CallOutcome;
      /** La categoría de la negativa del modelo, si se negó */
      refusalCategory: string | null;
    };

/** El código para la app y el resultado de la bitácora de cada falla del proveedor */
const PROVIDER_FAILURES: Record<ProviderFailure, { error: AiErrorCode; outcome: CallOutcome }> = {
  rate_limited: { error: 'rate_limited', outcome: 'rate_limited' },
  provider_error: { error: 'provider_error', outcome: 'provider_error' },
  // El límite de gasto de Anthropic. La app lo dice como pausa (2.8)
  org_limit: { error: 'paused', outcome: 'org_limit' },
};

const describeSchemaIssues = (issues: readonly { path: PropertyKey[]; message: string }[]) =>
  issues
    .slice(0, 8)
    .map((issue) => `${issue.path.map(String).join('.') || 'raíz'}: ${issue.message}`);

const describeGuard = (result: GuardResult) => result.issues.map((code) => GUARD_MESSAGES[code]);

export type Validation =
  | { ok: true; output: unknown; guardIssues: string[] }
  | { ok: false; schemaValid: boolean; issues: string[] };

/**
 * Revisa una salida contra el esquema y las guardas de anclaje de su motor. La comparten la llamada
 * al momento y la recolección de lotes, que valida cada resultado contra la entrada guardada (3.4).
 * En tarjetas devuelve solo las ancladas
 */
export function validateOutput<E extends AiEngine>(
  engine: E,
  raw: unknown,
  input: EngineInputs[E],
  sourceKeys: ReadonlySet<string>,
): Validation {
  const parsed = ENGINE_CONTRACTS[engine].output.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, schemaValid: false, issues: describeSchemaIssues(parsed.error.issues) };
  }
  let output: unknown = parsed.data;
  let guard: GuardResult;
  if (engine === 'flashcards') {
    const guarded = guardFlashcards(parsed.data as never, input as EngineInputs['flashcards'], {
      sourceKeys,
    });
    output = { cards: guarded.cards };
    guard = guarded.result;
  } else {
    guard = guardOutput(engine, parsed.data as never, input as never, { sourceKeys });
  }
  if (!guard.passed) return { ok: false, schemaValid: true, issues: describeGuard(guard) };
  return { ok: true, output, guardIssues: describeGuard(guard) };
}

export async function runEngine<E extends AiEngine>(
  deps: RunDeps,
  engine: E,
  input: EngineInputs[E],
): Promise<RunResult> {
  const clock = deps.clock ?? (() => Date.now());
  const started = clock();
  const model = deps.config.models[engine];
  const price = deps.config.prices[model.id];
  const prompt = deps.prompts[engine];
  const schema = ENGINE_CONTRACTS[engine].output;
  const real = deps.provider.mode === 'real';

  let usage: Usage = EMPTY_USAGE;
  const report = (): CostReport => ({
    model: real ? model.id : MOCK_MODEL,
    ...usage,
    estimatedCostUsd: price ? estimateCostUsd(price, usage) : 0,
    latencyMs: Math.max(0, Math.round(clock() - started)),
  });
  const failure = (
    error: AiErrorCode,
    outcome: CallOutcome,
    trace: AttemptTrace[],
    refusalCategory: string | null = null,
  ): RunResult => ({
    ok: false,
    error,
    message: ERROR_MESSAGES[error],
    cost: report(),
    trace,
    outcome,
    refusalCategory,
  });

  let issues: string[] = [];
  const trace: AttemptTrace[] = [];
  for (let attempt = 0; attempt <= VALIDATION_RETRIES; attempt += 1) {
    let raw: unknown;
    try {
      const result = await deps.provider.call({
        engine,
        model,
        system: prompt.text,
        user: buildUserMessage(input, issues),
        input,
        schema,
      });
      usage = addUsage(usage, result.usage);
      if (result.refusal) {
        // Una negativa no se reintenta. Se registra con su categoría y la app usa su plantilla
        trace.push({ schemaValid: false, guardPassed: null, issues: ['El modelo se negó'] });
        return failure('refused', 'refused', trace, result.refusal.category);
      }
      if (result.problem !== undefined) {
        issues = [result.problem];
        trace.push({ schemaValid: false, guardPassed: null, issues });
        continue;
      }
      raw = result.raw;
    } catch (error) {
      const kind = error instanceof ProviderError ? error.kind : 'provider_error';
      const mapped = PROVIDER_FAILURES[kind];
      return failure(mapped.error, mapped.outcome, trace);
    }

    const checked = validateOutput(engine, raw, input, deps.sourceKeys);
    if (!checked.ok) {
      issues = checked.issues;
      trace.push({
        schemaValid: checked.schemaValid,
        guardPassed: checked.schemaValid ? false : null,
        issues,
      });
      continue;
    }
    trace.push({ schemaValid: true, guardPassed: true, issues: checked.guardIssues });
    const cost = report();
    return {
      ok: true,
      output: checked.output,
      meta: {
        engine,
        mode: deps.provider.mode,
        model: cost.model,
        promptVersion: prompt.version,
        inputTokens: cost.inputTokens,
        outputTokens: cost.outputTokens,
        cacheWriteTokens: cost.cacheWriteTokens,
        cacheReadTokens: cost.cacheReadTokens,
        estimatedCostUsd: cost.estimatedCostUsd,
        latencyMs: cost.latencyMs,
        outcome: attempt === 0 ? 'ok' : 'retried_ok',
        validator: { passed: true, issues: checked.guardIssues },
      },
      trace,
    };
  }
  return failure('invalid_output', 'invalid_output', trace);
}
