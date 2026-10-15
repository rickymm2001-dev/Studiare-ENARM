// Una muestra de la compuerta 1 armada a mano para las pruebas (B12, 5.1). Cumple
// AiGateSampleFileSchema, con las respuestas fijas de cada motor como texto de la IA, así lo que importa
// la pantalla de auditoría y lo que guarda la base simulada es lo mismo que el archivo de verdad. Solo la
// usan las pruebas.
import {
  biasTipInput,
  flashcardsInput,
  hypothesisInput,
  restructureInput,
  weeklyReportInput,
} from '@/ai/testing/aiSamples';
import {
  AiGateSampleFileSchema,
  type AiEngine,
  type AiGateSampleFile,
} from '@/engines/aiContracts';
import { mockOutput } from '@/engines/aiMock';

const INPUTS = {
  forgetting: hypothesisInput,
  weekly_report: weeklyReportInput,
  flashcards: flashcardsInput,
  bias_tips: biasTipInput,
  restructure: restructureInput,
} as const;

const MODELS: Record<AiEngine, { model: string; effort: 'low' | 'medium'; version: string }> = {
  forgetting: { model: 'claude-haiku-5-5', effort: 'low', version: 'forgetting.base.v1' },
  weekly_report: { model: 'claude-haiku-5-5', effort: 'low', version: 'weekly_report.base.v1' },
  flashcards: { model: 'claude-sonnet-5-5', effort: 'low', version: 'flashcards.provisional.v1' },
  bias_tips: { model: 'claude-haiku-5-5', effort: 'low', version: 'bias_tips.base.v1' },
  restructure: { model: 'claude-sonnet-5-5', effort: 'low', version: 'restructure.base.v1' },
};

const hex = (seed: number) => seed.toString(16).padStart(12, '0');

/** Un uuid válido (versión 4) para el texto número n de la muestra */
const itemId = (n: number) => `5c7e0c3e-2f6a-4b1a-8d8e-${hex(n)}`;

/**
 * Una muestra con tantos textos de cada motor como se pida. Cada texto es la respuesta fija del motor a
 * su entrada de ejemplo. Una tarjeta es siempre una sola tarjeta
 */
export function gateSampleFile(
  id: string,
  perEngine: Partial<Record<AiEngine, number>>,
): AiGateSampleFile {
  let n = 0;
  const items = (Object.entries(perEngine) as [AiEngine, number][]).flatMap(([engine, count]) =>
    Array.from({ length: count }, () => {
      n += 1;
      const input = INPUTS[engine]();
      const output = mockOutput(engine, input as never) as unknown;
      const info = MODELS[engine];
      return {
        id: itemId(n),
        engine,
        model: info.model,
        effort: info.effort,
        thinking: 'adaptive' as const,
        promptVersion: info.version,
        promptHash: 'a'.repeat(64),
        sourceKind: 'demo' as const,
        input,
        output:
          engine === 'flashcards'
            ? { cards: (output as { cards: unknown[] }).cards.slice(0, 1) }
            : output,
      };
    }),
  );
  return AiGateSampleFileSchema.parse({
    version: 1,
    id,
    createdAt: '2026-10-20T10:00:00.000Z',
    items,
  });
}
