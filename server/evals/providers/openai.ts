// Proveedor de OpenAI para comparar calidad en npm run eval-ai (B12, 4.5 del plan y respuesta 38).
// Implementa AiProvider con fetch a la Responses API y salida estructurada con text.format
// json_schema estricto, así pasa por el mismo runEngine, las mismas guardas y el mismo juez que
// Claude. Sin el paquete de OpenAI, para que no entre a las dependencias, y solo desde server/evals.
// Nada fuera de server/evals y de scripts/eval-ai.ts importa este archivo.
//
// Forma confirmada el 2026-10-15 en la especificación OpenAPI de OpenAI en GitHub
// (openai/openai-openapi, master, versión 2.3.0). CreateResponse con model, instructions, input,
// max_output_tokens, store, reasoning.effort y text.format de tipo json_schema con name, schema y
// strict. Response con status, incomplete_details.reason (max_output_tokens o content_filter), output
// con mensajes cuyo contenido es output_text o refusal, y usage con input_tokens,
// input_tokens_details.cached_tokens y output_tokens.
//
// Solo viajan los casos de evaluación, con texto del banco o sintético y referencias seudónimas,
// nunca texto de alumnos. La clave llega como parámetro y nunca se imprime ni se guarda.
import { z } from 'zod';
import type { Usage } from '../../../supabase/functions/_shared/ai/cost.ts';
import { estimateCostUsd } from '../../../supabase/functions/_shared/ai/cost.ts';
import {
  ProviderError,
  type AiProvider,
  type ProviderResult,
} from '../../../supabase/functions/_shared/ai/provider.ts';
import type { CallProbe } from '../budget.ts';
import { priceOf, type OpenAiModel } from '../openaiModels.ts';

export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

// ---------------------------------------------------------------------------------------------
// Esquema estricto

/** Palabras de validación que se quitan del esquema. Las revisa zod al leer la respuesta */
const VALIDATION_KEYWORDS = [
  '$schema',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minItems',
  'maxItems',
  'pattern',
  'format',
  'default',
] as const;

type JsonNode = Record<string, unknown>;

const isNode = (value: unknown): value is JsonNode =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function nullable(node: JsonNode): JsonNode {
  const options: unknown = node.anyOf;
  if (Array.isArray(options)) {
    const list = options as unknown[];
    return list.some((option) => isNode(option) && option.type === 'null')
      ? node
      : { ...node, anyOf: [...list, { type: 'null' }] };
  }
  return { anyOf: [node, { type: 'null' }] };
}

function strictNode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strictNode);
  if (!isNode(value)) return value;
  const node: JsonNode = {};
  for (const [key, child] of Object.entries(value)) {
    if ((VALIDATION_KEYWORDS as readonly string[]).includes(key)) continue;
    node[key] = key === 'properties' || key === '$defs' ? child : strictNode(child);
  }
  const properties = node.properties;
  if (isNode(properties)) {
    const required = new Set(Array.isArray(node.required) ? (node.required as string[]) : []);
    const next: JsonNode = {};
    for (const [key, child] of Object.entries(properties)) {
      const strict = strictNode(child) as JsonNode;
      // En modo estricto todo es requerido. Lo opcional se vuelve nullable y zod acepta el null
      next[key] = required.has(key) ? strict : nullable(strict);
    }
    node.properties = next;
    node.required = Object.keys(next);
    node.additionalProperties = false;
  }
  const defs = node.$defs;
  if (isNode(defs)) {
    node.$defs = Object.fromEntries(
      Object.entries(defs).map(([key, child]) => [key, strictNode(child)]),
    );
  }
  return node;
}

/**
 * El JSON Schema estricto de un esquema de zod (4.5). Todo campo requerido, lo opcional como null,
 * sin propiedades de más y sin palabras de validación, que revisa zod del lado del cliente
 */
export function toStrictJsonSchema(schema: z.ZodType): JsonNode {
  return strictNode(z.toJSONSchema(schema, { io: 'output' })) as JsonNode;
}

// ---------------------------------------------------------------------------------------------
// Respuesta

const ResponseSchema = z.object({
  model: z.string().optional(),
  status: z.string(),
  incomplete_details: z.object({ reason: z.string().optional() }).nullable().optional(),
  output: z
    .array(
      z.object({
        type: z.string(),
        content: z
          .array(
            z.object({
              type: z.string(),
              text: z.string().optional(),
              refusal: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .default([]),
  usage: z
    .object({
      input_tokens: z.number(),
      input_tokens_details: z.object({ cached_tokens: z.number().optional() }).optional(),
      output_tokens: z.number(),
    })
    .optional(),
});

function usageOf(response: z.infer<typeof ResponseSchema>): Usage {
  const usage = response.usage;
  const cached = usage?.input_tokens_details?.cached_tokens ?? 0;
  return {
    inputTokens: Math.max(0, (usage?.input_tokens ?? 0) - cached),
    outputTokens: usage?.output_tokens ?? 0,
    cacheWriteTokens: 0,
    cacheReadTokens: cached,
  };
}

export interface OpenAiProviderOptions {
  apiKey: string;
  models: readonly OpenAiModel[];
  timeoutMs: number;
  /** La sonda del caso, que registra cómo terminó cada llamada y cuánto costó */
  probe?: CallProbe;
  fetch?: typeof fetch;
}

export function createOpenAiProvider(options: OpenAiProviderOptions): AiProvider {
  const send = options.fetch ?? fetch;
  return {
    mode: 'real',
    async call(call): Promise<ProviderResult> {
      const model = options.models.find((entry) => entry.id === call.model.id);
      if (!model) {
        throw new ProviderError('provider_error', 'El modelo no está en la tabla de OpenAI');
      }
      const body = {
        model: model.id,
        instructions: call.system,
        input: call.user,
        max_output_tokens: call.model.maxTokens,
        // Nada de lo que se manda queda guardado del lado de OpenAI para recuperarlo después
        store: false,
        ...(model.reasoningEffort ? { reasoning: { effort: model.reasoningEffort } } : {}),
        text: {
          format: {
            type: 'json_schema',
            name: `${call.engine}_output`,
            schema: toStrictJsonSchema(call.schema),
            strict: true,
          },
        },
      };
      let response: Response;
      try {
        response = await send(OPENAI_RESPONSES_URL, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(options.timeoutMs),
        });
      } catch {
        throw new ProviderError('provider_error', 'No se pudo conectar con OpenAI');
      }
      if (response.status === 429) {
        throw new ProviderError('rate_limited', 'OpenAI está saturado', 429);
      }
      if (!response.ok) {
        const text =
          response.status === 401 || response.status === 403
            ? 'La clave de OpenAI no es válida o no tiene permiso'
            : 'OpenAI respondió con un error';
        throw new ProviderError('provider_error', text, response.status);
      }
      const parsed = ResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) {
        throw new ProviderError('provider_error', 'OpenAI respondió con una forma desconocida');
      }
      const result = parsed.data;
      const usage = usageOf(result);
      const content = result.output
        .filter((item) => item.type === 'message')
        .flatMap((item) => item.content ?? []);
      const refusal = content.some((part) => part.type === 'refusal');
      const reason = result.incomplete_details?.reason ?? null;
      const stopReason =
        refusal || reason === 'content_filter'
          ? 'refusal'
          : result.status === 'incomplete' && reason === 'max_output_tokens'
            ? 'max_tokens'
            : result.status === 'completed'
              ? 'end_turn'
              : result.status;
      options.probe?.calls.push({
        stopReason,
        refusalCategory: reason === 'content_filter' ? 'content_filter' : null,
        usage,
        costUsd: estimateCostUsd(priceOf(model), usage),
      });
      const served = result.model ?? model.id;
      if (stopReason === 'refusal') {
        throw new ProviderError('provider_error', 'El modelo no atendió esta petición');
      }
      if (stopReason === 'max_tokens') {
        return {
          raw: undefined,
          usage,
          model: served,
          problem: 'La respuesta se cortó por tamaño',
        };
      }
      const text = content.find((part) => part.type === 'output_text')?.text;
      if (text === undefined) {
        return { raw: undefined, usage, model: served, problem: 'La respuesta no trajo texto' };
      }
      try {
        return { raw: JSON.parse(text) as unknown, usage, model: served };
      } catch {
        return {
          raw: undefined,
          usage,
          model: served,
          problem: 'La respuesta no es un JSON válido',
        };
      }
    },
  };
}
