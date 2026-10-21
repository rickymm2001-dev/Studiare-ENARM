// Cómo se lee lo que publica la calibración nocturna: la foto de la comparación y la línea base de la población
// (B14, 1.9 del plan de B14). Son las formas de src/data/model/contracts.ts, validadas con zod porque vienen de
// la base o de lo que el navegador guardó de ella. Un valor que no cumple se descarta entero y la tarjeta
// dice calibrando, nunca se pinta a medias. Los números llevan sus cotas: un corte es un número finito y los
// 19 cortes de una celda no bajan.
import { z } from 'zod';
import type {
  ComparisonSnapshot,
  FatigueValidationState,
  PopulationBaselines,
} from '@/data/model/contracts';

const count = z.number().int().min(0);
const rate = z.number();

const ComparisonCellSchema = z.object({
  cohort: z.enum(['all', 'specialty']),
  metric: z.enum(['sim_accuracy', 'reviews', 'consistency']),
  branch: z.string().min(1).max(64),
  students: count,
  state: z.enum(['ready', 'calibrating']),
  cuts: z
    .array(z.number())
    .length(19)
    .refine((cuts) => cuts.every((cut, index) => index === 0 || cut >= (cuts[index - 1] as number)))
    .nullable(),
});

export const ComparisonSnapshotSchema = z.object({
  available: z.boolean(),
  runAt: z.string().nullable(),
  studyDay: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  windowDays: z.number().int().min(1).max(366),
  minGroupSize: z.number().int().min(1),
  specialty: z.string().nullable(),
  cells: z.array(ComparisonCellSchema),
}) satisfies z.ZodType<ComparisonSnapshot>;

const FatigueStateSchema = z.enum([
  'calibrating',
  'validated',
  'not_valid',
]) satisfies z.ZodType<FatigueValidationState>;

export const PopulationBaselinesSchema = z.object({
  available: z.boolean(),
  runAt: z.string().nullable(),
  bias: z.record(z.string(), z.object({ students: count, rate })),
  motives: z.record(z.string(), z.record(z.string(), rate)),
  topics: z.record(
    z.string(),
    z.object({ students: count, accuracy: rate, difficulty: rate.nullable() }),
  ),
  indicators: z.record(z.string(), z.object({ students: count, rate })),
  fatigue: z.object({ state: FatigueStateSchema, students: count, longSessions: count }),
}) satisfies z.ZodType<PopulationBaselines>;
