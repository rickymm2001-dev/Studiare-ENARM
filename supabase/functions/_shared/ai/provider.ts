// Proveedores de IA del proxy (8.1). El real llama al SDK oficial de Anthropic con salida
// estructurada. El simulado calcula la respuesta fija del motor sin red y sin clave. Los dos
// devuelven la salida sin validar y los tokens usados. Validar, reintentar y revisar el anclaje
// es trabajo de run.ts, así los dos caminos pasan por las mismas reglas.
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { APIConnectionError, APIError, RateLimitError } from '@anthropic-ai/sdk';
import type { z } from 'zod';
import type { AiEngine, EngineInputs } from './engines/aiContracts.ts';
import { mockOutput, MOCK_MODEL } from './engines/aiMock.ts';
import type { AiLimits, ModelChoice } from './config.ts';
import { approximateTokens, type Usage } from './cost.ts';
import { effortParam, thinkingParam } from './models.ts';

export interface ProviderCall {
  engine: AiEngine;
  model: ModelChoice;
  /** El bloque fijo del motor, que va en caché */
  system: string;
  user: string;
  /** La entrada ya validada. El simulado calcula su respuesta con ella */
  input: unknown;
  schema: z.ZodType;
}

export interface ProviderResult {
  /** La salida tal como vino, sin validar. undefined si no se pudo leer como JSON */
  raw: unknown;
  usage: Usage;
  /** Por qué no hay salida que revisar, para el reintento */
  problem?: string;
  /** El modelo se negó (stop_reason refusal). No se reintenta y cuesta lo que se usó (2.8) */
  refusal?: { category: string | null };
  /** El modelo que respondió */
  model: string;
}

/**
 * rate_limited es un 429 por minuto. org_limit es el tope mensual de la organización (429 con
 * enforced_spend_limit_reached) o el límite de gasto de un espacio de trabajo (400), que la app dice
 * como pausa. provider_error es todo lo demás
 */
export type ProviderFailure = 'rate_limited' | 'provider_error' | 'org_limit';

/** Falla del proveedor. El mensaje es nuestro y nunca incluye lo que contestó la API */
export class ProviderError extends Error {
  readonly kind: ProviderFailure;
  readonly status: number | undefined;

  constructor(kind: ProviderFailure, message: string, status?: number) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
    this.status = status;
  }
}

export interface AiProvider {
  readonly mode: 'real' | 'mock';
  call(call: ProviderCall): Promise<ProviderResult>;
}

// ---------------------------------------------------------------------------------------------
// Simulado

export function createMockProvider(): AiProvider {
  return {
    mode: 'mock',
    call(call) {
      const raw = mockOutput(call.engine, call.input as EngineInputs[typeof call.engine]);
      return Promise.resolve({
        raw,
        model: MOCK_MODEL,
        // Tokens aproximados, para que la bitácora y las proyecciones tengan con qué trabajar
        usage: {
          inputTokens: approximateTokens(`${call.system}${call.user}`),
          outputTokens: approximateTokens(JSON.stringify(raw)),
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
        },
      });
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Petición y lectura, iguales al momento y por lote (2.8)

/**
 * La petición a la API. Igual para una llamada al momento y para una petición de un lote. El bloque
 * fijo va con caché de 5 minutos, la salida con su esquema y el esfuerzo y el razonamiento según las
 * reglas del modelo (models.ts). Nunca lleva metadata, herramientas ni datos del alumno aparte del
 * mensaje
 */
export function buildMessageParams(
  call: Pick<ProviderCall, 'model' | 'system' | 'user' | 'schema'>,
): MessageCreateParamsNonStreaming {
  const effort = effortParam(call.model);
  const thinking = thinkingParam(call.model);
  return {
    model: call.model.id,
    max_tokens: call.model.maxTokens,
    system: [{ type: 'text', text: call.system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: call.user }],
    output_config: {
      format: zodOutputFormat(call.schema),
      ...(effort ? { effort } : {}),
    },
    ...(thinking ? { thinking } : {}),
  };
}

function usageOf(message: Message): Usage {
  return {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
  };
}

/**
 * Lee un mensaje de la API. El texto se busca por tipo de bloque, porque antes puede venir un bloque
 * de razonamiento. Una negativa trae su categoría. Cortado por max_tokens o sin JSON es un problema
 * que va al reintento, sin perder los tokens
 */
export function readMessage(message: Message): ProviderResult {
  const usage = usageOf(message);
  const model = message.model;
  if (message.stop_reason === 'refusal') {
    return {
      raw: undefined,
      usage,
      model,
      refusal: { category: message.stop_details?.category ?? null },
    };
  }
  if (message.stop_reason === 'max_tokens') {
    return { raw: undefined, usage, model, problem: 'La respuesta se cortó por tamaño' };
  }
  const text = message.content.find((block) => block.type === 'text')?.text;
  if (text === undefined) {
    return { raw: undefined, usage, model, problem: 'La respuesta no trajo texto' };
  }
  try {
    return { raw: JSON.parse(text) as unknown, usage, model };
  } catch {
    return { raw: undefined, usage, model, problem: 'La respuesta no es un JSON válido' };
  }
}

// ---------------------------------------------------------------------------------------------
// Real

/** Lo único que se usa del cliente del SDK. Las pruebas ponen uno falso */
export interface MessagesApi {
  /** timeout en milisegundos y reintentos del SDK con espera exponencial ante fallas de red o 5xx */
  create(
    params: MessageCreateParamsNonStreaming,
    options: { timeout: number; maxRetries: number },
  ): Promise<Message>;
}

/**
 * Lo que dice un error de la API sobre el límite de gasto de la cuenta. El tope mensual de la organización
 * llega como 429 con enforced_spend_limit_reached y el de un espacio de trabajo como 400 con un mensaje
 * que empieza con "You have reached your specified" (documentación de rate limits, 2026-10-15). No se
 * confía en en qué campo viene: el SDK 0.132.1 declara solo message y type en el error, así que se busca
 * en el cuerpo serializado completo y en el mensaje. Nunca se copia nada de lo que contestó la API
 */
const SPEND_LIMIT_MARKERS = ['enforced_spend_limit_reached', 'you have reached your specified'];

function isSpendLimit(error: { error: unknown; message: string }): boolean {
  // El cuerpo viene de JSON.parse, así que serializarlo no falla. Sin cuerpo solo cuenta el mensaje
  const text = `${JSON.stringify(error.error)} ${error.message}`.toLowerCase();
  return SPEND_LIMIT_MARKERS.some((marker) => text.includes(marker));
}

export function toProviderError(error: unknown): ProviderError {
  if (error instanceof RateLimitError) {
    if (isSpendLimit(error)) {
      return new ProviderError('org_limit', 'Se alcanzó el límite de gasto de la IA', 429);
    }
    return new ProviderError('rate_limited', 'El servicio de IA está saturado', 429);
  }
  if (error instanceof APIConnectionError) {
    return new ProviderError('provider_error', 'No se pudo conectar con el servicio de IA');
  }
  if (error instanceof APIError) {
    if (isSpendLimit(error)) {
      return new ProviderError(
        'org_limit',
        'Se alcanzó el límite de gasto de la IA',
        error.status as number | undefined,
      );
    }
    const text =
      error.status === 401 || error.status === 403
        ? 'La clave de IA no es válida o no tiene permiso'
        : 'El servicio de IA respondió con un error';
    return new ProviderError('provider_error', text, error.status as number | undefined);
  }
  return new ProviderError('provider_error', 'La llamada a la IA falló');
}

/**
 * La salida estructurada se pide con output_config.format y se lee a mano, sin messages.parse.
 * Así cuando la salida no cumple el esquema también se conocen los tokens que costó, que parse
 * perdería al lanzar un error, y el reintento recibe el motivo exacto
 */
export function createAnthropicProvider(
  api: MessagesApi,
  limits: () => Pick<AiLimits, 'timeoutMs' | 'maxRetries'>,
): AiProvider {
  return {
    mode: 'real',
    async call(call) {
      const { timeoutMs, maxRetries } = limits();
      let message: Message;
      try {
        message = await api.create(buildMessageParams(call), { timeout: timeoutMs, maxRetries });
      } catch (error) {
        throw toProviderError(error);
      }
      return readMessage(message);
    },
  };
}
