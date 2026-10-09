// Cliente de los motores de IA (8.1, D-098). La app nunca llama a Anthropic. Le pide cada motor al
// proxy local, que filtra, limita y valida, y aquí se vuelve a validar todo porque el cliente no
// confía en nadie. Sin proxy, como en la demo publicada, la respuesta sale de las respuestas fijas
// del propio cliente, y sin conexión la función dice que necesita conexión. Cuando algo falla, quien
// llama usa su plantilla sin IA y la falla queda en la bitácora de costo.
import { ACADEMIC_SOURCE_KEYS } from '@/config/academicSources';
import {
  AiErrorSchema,
  AiSuccessSchema,
  ENGINE_CONTRACTS,
  type AiEngine,
  type AiErrorCode,
  type EngineInputs,
  type EngineOutputs,
} from '@/engines/aiContracts';
import { GUARD_MESSAGES, guardFlashcards, guardOutput } from '@/engines/aiGuards';
import { MOCK_MODEL, mockOutput } from '@/engines/aiMock';
import { scrubPersonalData } from '@/engines/piiFilter';
import type { AiStatus } from './client';
import { AI_BASE_URL, aiAuthHeaders } from './endpoint';

export const ENGINE_URL = `${AI_BASE_URL}/ai`;
const TIMEOUT_MS = 40_000;
const SOURCE_KEYS: ReadonlySet<string> = new Set(ACADEMIC_SOURCE_KEYS);

export type CallMode = 'real' | 'mock' | 'template';

/** Lo que cada llamada deja en la bitácora de costo (8.1) */
export interface CallMeta {
  engine: AiEngine;
  mode: CallMode;
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  outcome: 'ok' | 'retried_ok' | 'fallback';
  /** Lo que revisaron las guardas, con una línea por cada problema */
  validator: { passed: boolean; issues: string[] };
}

export type FailureReason = AiErrorCode | 'offline' | 'network' | 'bad_response';

export type EngineCall<E extends AiEngine> =
  | { ok: true; output: EngineOutputs[E]; meta: CallMeta }
  | { ok: false; reason: FailureReason; message: string; meta: CallMeta | null };

export interface CallOptions {
  status: AiStatus;
  /** El ID seudónimo del alumno. Nunca su nombre ni su correo */
  studentRef: string;
  /** Nombres que no deben llegar al proxy ni al modelo, como el alias y el nombre del alumno */
  names?: readonly string[];
  fetchImpl?: typeof fetch;
  /** Reloj en milisegundos, para medir la latencia */
  clock?: () => number;
}

/** Un ID, no un texto. Los IDs no se filtran porque una corrida de dígitos al azar no es un teléfono */
const isIdLike = (text: string) => /^[A-Za-z0-9_.:-]{1,64}$/.test(text) && /[A-Za-z]/.test(text);

function scrubDeep(value: unknown, names: readonly string[]): unknown {
  if (typeof value === 'string') {
    return isIdLike(value) ? value : scrubPersonalData(value, names).text;
  }
  if (Array.isArray(value)) return value.map((item) => scrubDeep(item, names));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, scrubDeep(item, names)]),
    );
  }
  return value;
}

/** La entrada sin datos personales. Es la que viaja y la que se usa para revisar la respuesta */
export function scrubInput<T>(input: T, names: readonly string[] = []): T {
  return scrubDeep(input, names) as T;
}

const OFFLINE_MESSAGE = 'Esta función de IA necesita conexión. Se usa la versión sin IA.';
const NETWORK_MESSAGE = 'No se pudo conectar con la IA. Se usa la versión sin IA.';
const BAD_RESPONSE_MESSAGE =
  'La IA respondió algo que no pasó la revisión. Se usa la versión sin IA.';

const empty = (engine: AiEngine, mode: CallMode, latencyMs: number): CallMeta => ({
  engine,
  mode,
  model: mode === 'template' ? MOCK_MODEL : 'proxy',
  promptVersion: `${engine}.local.v1`,
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  estimatedCostUsd: 0,
  latencyMs,
  outcome: 'fallback',
  validator: { passed: false, issues: [] },
});

/** Revisa la salida contra el esquema del motor y sus guardas. null si no pasó */
function checkOutput<E extends AiEngine>(
  engine: E,
  raw: unknown,
  input: EngineInputs[E],
): { output: EngineOutputs[E]; issues: string[] } | null {
  const parsed = ENGINE_CONTRACTS[engine].output.safeParse(raw);
  if (!parsed.success) return null;
  if (engine === 'flashcards') {
    const guarded = guardFlashcards(parsed.data as never, input as EngineInputs['flashcards'], {
      sourceKeys: SOURCE_KEYS,
    });
    if (!guarded.result.passed) return null;
    return {
      output: { cards: guarded.cards } as EngineOutputs[E],
      issues: guarded.result.issues.map((code) => GUARD_MESSAGES[code]),
    };
  }
  const guard = guardOutput(engine, parsed.data as never, input as never, {
    sourceKeys: SOURCE_KEYS,
  });
  if (!guard.passed) return null;
  return { output: parsed.data as EngineOutputs[E], issues: [] };
}

export async function callEngine<E extends AiEngine>(
  engine: E,
  rawInput: EngineInputs[E],
  options: CallOptions,
): Promise<EngineCall<E>> {
  const clock = options.clock ?? (() => Date.now());
  const started = clock();
  const elapsed = () => Math.max(0, Math.round(clock() - started));
  const { status } = options;
  const parsedInput = ENGINE_CONTRACTS[engine].input.safeParse(rawInput);
  if (!parsedInput.success) {
    return { ok: false, reason: 'invalid_request', message: BAD_RESPONSE_MESSAGE, meta: null };
  }
  const input = scrubInput(parsedInput.data as EngineInputs[E], options.names);

  if (status.kind === 'offline') {
    return { ok: false, reason: 'offline', message: OFFLINE_MESSAGE, meta: null };
  }

  // Sin proxy o todavía sin saber si hay. Las respuestas fijas del cliente, que son las mismas
  if (status.kind === 'no-proxy' || status.kind === 'checking') {
    const checked = checkOutput(engine, mockOutput(engine, input), input);
    if (!checked) {
      return {
        ok: false,
        reason: 'bad_response',
        message: BAD_RESPONSE_MESSAGE,
        meta: empty(engine, 'template', elapsed()),
      };
    }
    return {
      ok: true,
      output: checked.output,
      meta: {
        ...empty(engine, 'template', elapsed()),
        outcome: 'ok',
        validator: { passed: true, issues: checked.issues },
      },
    };
  }

  const mode: CallMode = status.kind;
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${ENGINE_URL}/${engine}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(await aiAuthHeaders()),
      },
      body: JSON.stringify({
        studentRef: options.studentRef,
        promptVersion: `${engine}.local.v1`,
        ...(options.names && options.names.length > 0
          ? { blockedNames: options.names.slice(0, 5) }
          : {}),
        input,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return {
      ok: false,
      reason: 'network',
      message: NETWORK_MESSAGE,
      meta: empty(engine, mode, elapsed()),
    };
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = AiErrorSchema.safeParse(body);
    if (!failure.success) {
      return {
        ok: false,
        reason: 'bad_response',
        message: BAD_RESPONSE_MESSAGE,
        meta: empty(engine, mode, elapsed()),
      };
    }
    const cost = failure.data.cost;
    return {
      ok: false,
      reason: failure.data.error,
      message: failure.data.message,
      meta: {
        ...empty(engine, mode, cost?.latencyMs ?? elapsed()),
        ...(cost ? { ...cost, mode } : {}),
      },
    };
  }

  const success = AiSuccessSchema.safeParse(body);
  const checked = success.success ? checkOutput(engine, success.data.output, input) : null;
  if (!success.success || !checked) {
    return {
      ok: false,
      reason: 'bad_response',
      message: BAD_RESPONSE_MESSAGE,
      meta: {
        ...empty(engine, mode, elapsed()),
        ...(success.success ? { ...success.data.meta, mode, outcome: 'fallback' as const } : {}),
      },
    };
  }
  return {
    ok: true,
    output: checked.output,
    meta: {
      ...success.data.meta,
      mode,
      validator: {
        passed: true,
        issues: [...new Set([...success.data.meta.validator.issues, ...checked.issues])],
      },
    },
  };
}
