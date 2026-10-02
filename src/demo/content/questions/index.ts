// Lotes de preguntas de demostración. Cada lote mezcla las 4 ramas para revisarse uno a la vez (D-042).
import { DemoQuestionBatchSchema, type DemoQuestionBatch } from '@/data/schemas/content';

const files = import.meta.glob<{ default: unknown }>('./batch-*.json', { eager: true });

export const questionBatches: DemoQuestionBatch[] = Object.keys(files)
  .sort()
  .map((path) => DemoQuestionBatchSchema.parse((files[path] as { default: unknown }).default));
