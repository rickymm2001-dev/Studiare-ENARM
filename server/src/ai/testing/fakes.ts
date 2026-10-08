// Ayudas de prueba del proxy de IA. Un cliente falso del SDK que contesta lo que se le diga y
// guarda lo que recibió, y utilidades para armar peticiones válidas.
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages';
import type { AiEngine, EngineInputs } from '../../../../src/engines/aiContracts.ts';
import { DEFAULT_CONFIG, type AiConfig } from '../config.ts';
import type { MessagesApi } from '../provider.ts';

export interface FakeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function fakeMessage(
  text: string | null,
  options: { stop?: Message['stop_reason']; usage?: FakeUsage; model?: string } = {},
): Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: options.model ?? 'claude-haiku-4-5-20251001',
    content: text === null ? [] : [{ type: 'text', text, citations: null }],
    stop_reason: options.stop ?? 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 200,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      ...options.usage,
    },
  } as unknown as Message;
}

export interface FakeApi extends MessagesApi {
  calls: {
    params: MessageCreateParamsNonStreaming;
    options: { timeout: number; maxRetries: number };
  }[];
}

/** Contesta en orden con cada elemento. Un Error se lanza en vez de devolverse */
export function fakeApi(replies: readonly (Message | Error)[]): FakeApi {
  const calls: FakeApi['calls'] = [];
  let next = 0;
  return {
    calls,
    create(params, options) {
      calls.push({ params, options });
      const reply = replies[Math.min(next, replies.length - 1)];
      next += 1;
      if (!reply) return Promise.reject(new Error('Sin respuesta preparada'));
      return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
    },
  };
}

export const withLimits = (limits: Partial<AiConfig['limits']>): AiConfig => ({
  ...DEFAULT_CONFIG,
  limits: { ...DEFAULT_CONFIG.limits, ...limits },
});

export const STUDENT = '01HZX0000000000000000000AA';

export function requestBody<E extends AiEngine>(
  input: EngineInputs[E],
  extra: Record<string, unknown> = {},
) {
  return { studentRef: STUDENT, promptVersion: 'forgetting.base.v1', input, ...extra };
}
