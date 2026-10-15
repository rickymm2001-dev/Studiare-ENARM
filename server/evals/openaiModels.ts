// Modelos de OpenAI para la comparación de calidad de npm run eval-ai (B12, 4.5 y respuesta 38).
// Solo evaluaciones. OpenAI nunca llega a producción, ni a la app, ni a las funciones.
//
// Los modelos y sus precios se toman de la lista vigente de OpenAI el día de la corrida y se anotan
// aquí con la fecha y la URL donde se leyeron. Van dos, uno barato y uno de gama media. Mientras la
// tabla esté vacía, --provider=openai se detiene antes de llamar a nada, porque sin precio no hay
// tope de costo que se pueda cumplir.
//
// El 2026-10-15 la página de precios no abrió desde el entorno de la sesión, así que la tabla quedó
// vacía. La especificación OpenAPI de GitHub (openai/openai-openapi, rama master) confirma la forma
// de la Responses API que usa providers/openai.ts. Una entrada se ve así:
//
//   {
//     id: 'nombre-exacto-del-modelo',
//     tier: 'cheap',
//     price: { input: 0, output: 0, cachedInput: 0 },
//     reasoningEffort: 'low',
//     source: 'https://openai.com/api/pricing',
//     checkedAt: 'AAAA-MM-DD',
//   },
import type { ModelPrice } from '../../supabase/functions/_shared/ai/config.ts';

export interface OpenAiModel {
  /** El nombre exacto del modelo en la API */
  id: string;
  /** cheap es el barato y mid el de gama media */
  tier: 'cheap' | 'mid';
  /** Dólares por millón de tokens */
  price: { input: number; output: number; cachedInput: number };
  /** reasoning.effort de la Responses API, o null si el modelo no razona */
  reasoningEffort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | null;
  /** Dónde se leyó el precio */
  source: string;
  /** Cuándo se leyó, AAAA-MM-DD */
  checkedAt: string;
}

export const OPENAI_MODELS: readonly OpenAiModel[] = [];

/** El precio con la forma del núcleo. OpenAI no cobra aparte la escritura de caché */
export function priceOf(model: OpenAiModel): ModelPrice {
  return {
    input: model.price.input,
    output: model.price.output,
    cacheWrite: model.price.input,
    cacheRead: model.price.cachedInput,
  };
}

/**
 * Los modelos de --models, revisados contra la tabla. Falla con un mensaje claro si falta alguno o si
 * su precio no tiene fecha ni fuente
 */
export function resolveOpenAiModels(
  ids: readonly string[],
  table: readonly OpenAiModel[] = OPENAI_MODELS,
): OpenAiModel[] {
  if (ids.length === 0) {
    throw new Error('Pasa los modelos de OpenAI con --models=uno,otro.');
  }
  return ids.map((id) => {
    const model = table.find((entry) => entry.id === id);
    if (!model) {
      throw new Error(
        `El modelo ${id} no está en server/evals/openaiModels.ts. Agrégalo con su precio vigente, la fecha y la URL donde lo leíste.`,
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(model.checkedAt) || !model.source.startsWith('https://')) {
      throw new Error(
        `El precio de ${id} no tiene fecha o fuente en server/evals/openaiModels.ts.`,
      );
    }
    return model;
  });
}
