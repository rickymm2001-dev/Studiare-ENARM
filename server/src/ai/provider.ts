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
import type { AiEngine, EngineInputs } from '../../../src/engines/aiContracts.ts';
import { mockOutput, MOCK_MODEL } from '../../../src/engines/aiMock.ts';
import type { AiLimits, ModelChoice } from './config.ts';
import { approximateTokens, type Usage } from './cost.ts';

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
  /** El modelo que respondió */
  model: string;
}

export type ProviderFailure = 'rate_limited' | 'provider_error';

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
// Real

/** Lo único que se usa del cliente del SDK. Las pruebas ponen uno falso */
export interface MessagesApi {
  /** timeout en milisegundos y reintentos del SDK con espera exponencial ante fallas de red o 5xx */
  create(
    params: MessageCreateParamsNonStreaming,
    options: { timeout: number; maxRetries: number },
  ): Promise<Message>;
}

function usageOf(message: Message): Usage {
  return {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
  };
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof RateLimitError) {
    return new ProviderError('rate_limited', 'El servicio de IA está saturado', 429);
  }
  if (error instanceof APIConnectionError) {
    return new ProviderError('provider_error', 'No se pudo conectar con el servicio de IA');
  }
  if (error instanceof APIError) {
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
      let message: Message;
      const { timeoutMs, maxRetries } = limits();
      try {
        message = await api.create(
          {
            model: call.model.id,
            max_tokens: call.model.maxTokens,
            system: [{ type: 'text', text: call.system, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: call.user }],
            output_config: {
              format: zodOutputFormat(call.schema),
              ...(call.model.effort ? { effort: call.model.effort } : {}),
            },
          },
          { timeout: timeoutMs, maxRetries },
        );
      } catch (error) {
        throw toProviderError(error);
      }
      const usage = usageOf(message);
      const model = message.model;
      if (message.stop_reason === 'refusal') {
        throw new ProviderError('provider_error', 'El modelo no atendió esta petición');
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
    },
  };
}
