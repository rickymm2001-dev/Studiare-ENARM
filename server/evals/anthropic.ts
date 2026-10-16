// Cliente de Anthropic de las evaluaciones (B12, 4.4 y 10.29 del plan). Se crea con la clave
// explícita y con authToken, webhookKey, baseURL y logLevel fijos, para que el SDK no busque ninguna
// credencial en el entorno ni escriba nada en el registro. Solo lo usa scripts/eval-ai.ts con --real,
// y scripts/ai/gate-sample.ts. Los adaptadores son los puertos del núcleo (MessagesApi y BatchApi),
// así las pruebas ponen dobles sin red.
import Anthropic from '@anthropic-ai/sdk';
import type { BatchApi } from '../../supabase/functions/_shared/ai/ports.ts';
import type { MessagesApi } from '../../supabase/functions/_shared/ai/provider.ts';

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

/** Tiempo máximo de una llamada de evaluación. Opus con esfuerzo alto puede tardar */
export const EVAL_TIMEOUT_MS = 120_000;

export function createEvalClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    authToken: null,
    webhookKey: null,
    baseURL: ANTHROPIC_BASE_URL,
    logLevel: 'off',
    maxRetries: 2,
    timeout: EVAL_TIMEOUT_MS,
  });
}

export function messagesApiOf(client: Anthropic): MessagesApi {
  return {
    create: (params, options) => client.messages.create(params, options),
  };
}

export function batchApiOf(client: Anthropic): BatchApi {
  return {
    create: (requests) => client.messages.batches.create({ requests: [...requests] }),
    retrieve: (batchId) => client.messages.batches.retrieve(batchId),
    results: (batchId) => client.messages.batches.results(batchId),
    cancel: (batchId) => client.messages.batches.cancel(batchId),
    delete: async (batchId) => {
      await client.messages.batches.delete(batchId);
    },
    recent: async (limit) => (await client.messages.batches.list({ limit })).data,
  };
}

/** Lo que se usa de la Models API, para revisar que la cuenta tenga cada modelo antes de gastar */
export interface ModelsApi {
  retrieve(modelId: string): Promise<{ id: string; display_name: string }>;
}

export function modelsApiOf(client: Anthropic): ModelsApi {
  return { retrieve: (modelId) => client.models.retrieve(modelId) };
}

export interface ModelCheck {
  id: string;
  available: boolean;
  displayName: string | null;
}

/**
 * Consulta cada modelo con models.retrieve (4.1). Un 404 es un modelo que la cuenta no tiene. Una
 * clave inválida o sin permiso detiene todo con un mensaje propio, sin el texto de la API
 */
export async function checkModels(api: ModelsApi, ids: readonly string[]): Promise<ModelCheck[]> {
  const checks: ModelCheck[] = [];
  for (const id of ids) {
    try {
      const model = await api.retrieve(id);
      checks.push({ id, available: true, displayName: model.display_name });
    } catch (error) {
      if (error instanceof Anthropic.NotFoundError) {
        checks.push({ id, available: false, displayName: null });
      } else if (
        error instanceof Anthropic.AuthenticationError ||
        error instanceof Anthropic.PermissionDeniedError
      ) {
        throw new Error('La clave de evaluaciones no es válida o no tiene permiso.', {
          cause: error,
        });
      } else {
        throw new Error(`No se pudo consultar el modelo ${id} en la Models API.`, {
          cause: error,
        });
      }
    }
  }
  return checks;
}
