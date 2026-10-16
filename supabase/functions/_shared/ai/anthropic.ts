// El cliente del SDK oficial de Anthropic (B12, 1.4 y 10.29). Se crea siempre igual en la Edge Function
// y en el proxy de desarrollo. Con la clave, authToken y webhookKey en null, la dirección y el registro
// explícitos, el SDK 0.132.1 no busca credenciales en el entorno ni escribe en el log. La clave llega
// como argumento desde quien lee ENARM_ANTHROPIC_KEY y nunca se guarda en otro lado.
import Anthropic from '@anthropic-ai/sdk';
import type { BatchesClient } from './batchApi.ts';
import type { MessagesApi } from './provider.ts';

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

export interface AnthropicClients {
  messages: MessagesApi;
  batches: BatchesClient;
}

export function createAnthropicClients(apiKey: string): AnthropicClients {
  const client = new Anthropic({
    apiKey,
    authToken: null,
    webhookKey: null,
    baseURL: ANTHROPIC_BASE_URL,
    logLevel: 'off',
    maxRetries: 1,
    timeout: 30_000,
  });
  return {
    messages: { create: (params, options) => client.messages.create(params, options) },
    batches: {
      create: (params, options) => client.messages.batches.create(params, options),
      retrieve: (batchId) => client.messages.batches.retrieve(batchId),
      results: (batchId) => client.messages.batches.results(batchId),
      cancel: (batchId) => client.messages.batches.cancel(batchId),
      delete: (batchId) => client.messages.batches.delete(batchId),
      list: (params) => client.messages.batches.list(params),
    },
  };
}
