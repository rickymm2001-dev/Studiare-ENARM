// Lo que la IA escribe en el tutor y cómo se guarda (8.2, 8.3, 8.5). Cada resultado vive en el
// campo `ai` del contenido del artefacto que ya existe para esa hipótesis, informe o consejo, y se
// valida otra vez al leerlo, así un artefacto viejo o dañado nunca rompe la pantalla. Todo es
// borrador. Un resultado vale 7 días, el informe una semana, y pasado ese tiempo se pide de nuevo.
import { z } from 'zod';
import type { AiArtifact } from '@/data/schemas/activity';
import { UtcDateTimeSchema } from '@/data/schemas/common';
import { stableUlid } from '@/demo/stableId';
import {
  BiasTipOutputSchema,
  HypothesisOutputSchema,
  WeeklyReportOutputSchema,
} from '@/engines/aiContracts';

/** Días que vale un resultado antes de pedirlo de nuevo. Como máximo una vez por patrón cada 7 días (8.2) */
export const AI_REFRESH_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const ID_TIME = Date.UTC(2026, 0, 1);

const stamp = {
  generatedAt: UtcDateTimeSchema,
  /** real, simulado del proxy, o respuestas fijas del propio cliente */
  mode: z.enum(['real', 'mock', 'template']),
};

export const HypothesisAiSchema = HypothesisOutputSchema.extend(stamp);
export type HypothesisAi = z.infer<typeof HypothesisAiSchema>;

export const ReportAiSchema = WeeklyReportOutputSchema.extend({
  ...stamp,
  /** El lunes de la semana del informe, en el día de estudio del alumno */
  week: z.string(),
});
export type ReportAi = z.infer<typeof ReportAiSchema>;

export const BiasTipAiSchema = BiasTipOutputSchema.extend(stamp);
export type BiasTipAi = z.infer<typeof BiasTipAiSchema>;

/** El resultado de la IA guardado en un artefacto, o undefined si no hay o no es válido */
export function readAi<S extends z.ZodType>(
  schema: S,
  artifact: Pick<AiArtifact, 'content'> | undefined,
): z.infer<S> | undefined {
  const parsed = schema.safeParse(artifact?.content.ai);
  return parsed.success ? parsed.data : undefined;
}

export function isFresh(ai: { generatedAt: string } | undefined, now: Date): boolean {
  if (!ai) return false;
  const age = now.getTime() - Date.parse(ai.generatedAt);
  return age >= 0 && age < AI_REFRESH_DAYS * DAY_MS;
}

/** El lunes de la semana de un día de estudio AAAA-MM-DD */
export function weekStart(day: string): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date));
  const sinceMonday = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - sinceMonday);
  return utc.toISOString().slice(0, 10);
}

export const reportArtifactId = (userId: string, week: string) =>
  stableUlid(`weekly_report|${userId}|${week}`, ID_TIME);
export const biasTipArtifactId = (userId: string, tag: string) =>
  stableUlid(`bias_tip|${userId}|${tag}`, ID_TIME);
