// Ejecuta un motor de IA de principio a fin (8.1). Arma el mensaje, llama al proveedor, valida la
// salida con el esquema del motor y con sus guardas de anclaje. Si algo falla, reintenta una vez
// diciéndole al modelo qué falló. Si vuelve a fallar, no devuelve nada y la app cae a su plantilla
// sin IA. Suma los tokens de todos los intentos, porque los dos cuestan.
import {
  ENGINE_CONTRACTS,
  type AiCallMeta,
  type AiEngine,
  type AiErrorCode,
  type EngineInputs,
} from '../../../src/engines/aiContracts.ts';
import {
  GUARD_MESSAGES,
  guardFlashcards,
  guardOutput,
  type GuardResult,
} from '../../../src/engines/aiGuards.ts';
import type { AiConfig } from './config.ts';
import { addUsage, EMPTY_USAGE, estimateCostUsd, type Usage } from './cost.ts';
import { buildUserMessage, type PromptSets } from './prompts.ts';
import { ProviderError, type AiProvider } from './provider.ts';

/** Intentos con reintento por validación. Uno extra, como pide la especificación */
export const VALIDATION_RETRIES = 1;

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
  | { ok: false; error: AiErrorCode; message: string; cost: CostReport; trace: AttemptTrace[] };

const FAIL_MESSAGES = {
  invalid_output: 'La IA no dio una respuesta que se pueda usar. Se usa la versión sin IA.',
  provider_error: 'No se pudo usar la IA en este momento. Se usa la versión sin IA.',
  rate_limited: 'El servicio de IA está saturado. Intenta de nuevo en unos minutos.',
} as const;

const describeSchemaIssues = (issues: readonly { path: PropertyKey[]; message: string }[]) =>
  issues
    .slice(0, 8)
    .map((issue) => `${issue.path.map(String).join('.') || 'raíz'}: ${issue.message}`);

const describeGuard = (result: GuardResult) => result.issues.map((code) => GUARD_MESSAGES[code]);

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
    model: real ? model.id : 'respuestas-fijas-v1',
    ...usage,
    estimatedCostUsd: price ? estimateCostUsd(price, usage) : 0,
    latencyMs: Math.max(0, Math.round(clock() - started)),
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
      if (result.problem !== undefined) {
        issues = [result.problem];
        trace.push({ schemaValid: false, guardPassed: null, issues });
        continue;
      }
      raw = result.raw;
    } catch (error) {
      const kind = error instanceof ProviderError ? error.kind : 'provider_error';
      return { ok: false, error: kind, message: FAIL_MESSAGES[kind], cost: report(), trace };
    }

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      issues = describeSchemaIssues(parsed.error.issues);
      trace.push({ schemaValid: false, guardPassed: null, issues });
      continue;
    }

    let output: unknown = parsed.data;
    let guard: GuardResult;
    if (engine === 'flashcards') {
      const guarded = guardFlashcards(parsed.data as never, input as EngineInputs['flashcards'], {
        sourceKeys: deps.sourceKeys,
      });
      output = { cards: guarded.cards };
      guard = guarded.result;
    } else {
      guard = guardOutput(engine, parsed.data as never, input as never, {
        sourceKeys: deps.sourceKeys,
      });
    }
    if (!guard.passed) {
      issues = describeGuard(guard);
      trace.push({ schemaValid: true, guardPassed: false, issues });
      continue;
    }
    trace.push({ schemaValid: true, guardPassed: true, issues: describeGuard(guard) });
    const cost = report();
    return {
      ok: true,
      output,
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
        validator: { passed: true, issues: guard.issues.map((code) => GUARD_MESSAGES[code]) },
      },
      trace,
    };
  }
  return {
    ok: false,
    error: 'invalid_output',
    message: FAIL_MESSAGES.invalid_output,
    cost: report(),
    trace,
  };
}
