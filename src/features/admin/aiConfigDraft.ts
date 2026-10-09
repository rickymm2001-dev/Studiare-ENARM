// Borrador de modelos, precios y límites de la pantalla 25, con su validación y los cambios que se
// mandan al proxy. Aparte del formulario para poder probarlo sin pintar nada.
import type { AdminConfig, AdminConfigPatch } from '@/ai/admin';
import { AI_ENGINES, type AiEngine } from '@/engines/aiContracts';
import { t } from '@/i18n/es-MX';

export type Effort = AdminConfig['models'][AiEngine]['effort'];
export const EFFORTS: readonly Effort[] = [null, 'low', 'medium', 'high'];
const MODEL_ID = /^claude-[a-z0-9-]+$/;
const DATED = /-\d{8}$/;

export interface AiDraft {
  models: Record<AiEngine, { id: string; effort: string; maxTokens: string }>;
  limits: Record<AiEngine, string>;
  budget: string;
  newModel: { id: string; input: string; output: string; cacheWrite: string; cacheRead: string };
}

export const emptyModel = { id: '', input: '', output: '', cacheWrite: '', cacheRead: '' };

export function draftOf(config: AdminConfig): AiDraft {
  return {
    models: Object.fromEntries(
      AI_ENGINES.map((engine) => [
        engine,
        {
          id: config.models[engine].id,
          effort: config.models[engine].effort ?? '',
          maxTokens: String(config.models[engine].maxTokens),
        },
      ]),
    ) as AiDraft['models'],
    limits: Object.fromEntries(
      AI_ENGINES.map((engine) => [engine, String(config.limits.perStudentPerDay[engine])]),
    ) as AiDraft['limits'],
    budget: String(config.limits.dailyBudgetUsd),
    newModel: emptyModel,
  };
}

const isInt = (raw: string, min: number, max: number) => {
  const value = Number(raw);
  return raw.trim() !== '' && Number.isInteger(value) && value >= min && value <= max;
};
const isMoney = (raw: string) => {
  const value = Number(raw);
  return raw.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= 100_000;
};

/** Los errores del borrador, por campo. Vacío si todo se puede guardar */
export function validateAiDraft(draft: AiDraft, config: AdminConfig): Record<string, string> {
  const text = t.adminConfig.aiForm;
  const errors: Record<string, string> = {};
  const known = new Set(Object.keys(config.prices));
  const adding = draft.newModel.id.trim() !== '';
  if (adding) known.add(draft.newModel.id.trim());
  for (const engine of AI_ENGINES) {
    const row = draft.models[engine];
    if (!known.has(row.id)) errors[`model.${engine}`] = text.unknownModel;
    if (!isInt(row.maxTokens, 200, 32_000)) errors[`tokens.${engine}`] = text.tokensError;
    if (!isInt(draft.limits[engine], 1, 10_000)) errors[`limit.${engine}`] = text.limitError;
  }
  if (!isMoney(draft.budget)) errors.budget = text.budgetError;
  if (adding) {
    const { id, input, output, cacheWrite, cacheRead } = draft.newModel;
    if (!MODEL_ID.test(id.trim()) || DATED.test(id.trim())) errors['new.id'] = text.newModelIdError;
    for (const [key, raw] of Object.entries({ input, output, cacheWrite, cacheRead })) {
      if (!isMoney(raw)) errors[`new.${key}`] = text.priceError;
    }
  }
  return errors;
}

/** Lo que se manda al proxy. Solo los cambios contra lo que el proxy ya tiene */
export function patchOf(draft: AiDraft, config: AdminConfig): AdminConfigPatch {
  const patch: AdminConfigPatch = {};
  const models: Partial<AdminConfig['models']> = {};
  for (const engine of AI_ENGINES) {
    const row = draft.models[engine];
    const next = {
      id: row.id,
      effort: (row.effort === '' ? null : row.effort) as Effort,
      maxTokens: Number(row.maxTokens),
    };
    const before = config.models[engine];
    if (
      next.id !== before.id ||
      next.effort !== before.effort ||
      next.maxTokens !== before.maxTokens
    ) {
      models[engine] = next;
    }
  }
  if (Object.keys(models).length > 0) patch.models = models;

  const perStudentPerDay: Partial<AdminConfig['limits']['perStudentPerDay']> = {};
  for (const engine of AI_ENGINES) {
    const value = Number(draft.limits[engine]);
    if (value !== config.limits.perStudentPerDay[engine]) perStudentPerDay[engine] = value;
  }
  const budget = Number(draft.budget);
  const limits: NonNullable<AdminConfigPatch['limits']> = {};
  if (Object.keys(perStudentPerDay).length > 0) limits.perStudentPerDay = perStudentPerDay;
  if (budget !== config.limits.dailyBudgetUsd) limits.dailyBudgetUsd = budget;
  if (Object.keys(limits).length > 0) patch.limits = limits;

  const adding = draft.newModel.id.trim();
  if (adding !== '') {
    patch.prices = {
      [adding]: {
        input: Number(draft.newModel.input),
        output: Number(draft.newModel.output),
        cacheWrite: Number(draft.newModel.cacheWrite),
        cacheRead: Number(draft.newModel.cacheRead),
      },
    };
  }
  return patch;
}
