// Borrador de modelos, precios y límites de la pantalla 25, con su validación y los cambios que se
// mandan al proxy. Aparte del formulario para poder probarlo sin pintar nada.
import type { AdminConfig, AdminConfigPatch } from '@/ai/admin';
import { AI_ENGINES, type AiEngine } from '@/engines/aiContracts';
import { adminText } from '@/i18n/admin';

export type Effort = AdminConfig['models'][AiEngine]['effort'];
export const EFFORTS: readonly Effort[] = [null, 'low', 'medium', 'high', 'xhigh', 'max'];
/** El razonamiento que se elige. Vacío es un modelo sin razonamiento configurable, como Haiku 4.5 */
export const THINKINGS = ['', 'adaptive', 'off'] as const;
export type ThinkingChoice = (typeof THINKINGS)[number];
const MODEL_ID = /^claude-[a-z0-9-]+$/;
const DATED = /-\d{8}$/;

/** Los límites de la nube de B12. null si el servicio es uno de desarrollo anterior que no los manda */
export interface CloudLimitsDraft {
  perUserDailyUsd: string;
  cardGenerationsPerDay: string;
  sectionsPerGeneration: string;
  maxPendingJobs: string;
  /** En porcentaje del presupuesto del día, de 0 a 100 */
  engineShare: Record<AiEngine, string>;
}

export interface AiDraft {
  models: Record<
    AiEngine,
    { id: string; effort: string; thinking: ThinkingChoice; maxTokens: string }
  >;
  limits: Record<AiEngine, string>;
  budget: string;
  cloud: CloudLimitsDraft | null;
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
          thinking: config.models[engine].thinking ?? '',
          maxTokens: String(config.models[engine].maxTokens),
        },
      ]),
    ) as AiDraft['models'],
    limits: Object.fromEntries(
      AI_ENGINES.map((engine) => [engine, String(config.limits.perStudentPerDay[engine])]),
    ) as AiDraft['limits'],
    budget: String(config.limits.dailyBudgetUsd),
    cloud: cloudDraftOf(config),
    newModel: emptyModel,
  };
}

function cloudDraftOf({ limits }: AdminConfig): CloudLimitsDraft | null {
  const { perUserDailyUsd, cardGenerationsPerDay, sectionsPerGeneration, maxPendingJobs } = limits;
  if (
    perUserDailyUsd === undefined ||
    cardGenerationsPerDay === undefined ||
    sectionsPerGeneration === undefined ||
    maxPendingJobs === undefined ||
    limits.engineShare === undefined
  ) {
    return null;
  }
  const share = limits.engineShare;
  return {
    perUserDailyUsd: String(perUserDailyUsd),
    cardGenerationsPerDay: String(cardGenerationsPerDay),
    sectionsPerGeneration: String(sectionsPerGeneration),
    maxPendingJobs: String(maxPendingJobs),
    engineShare: Object.fromEntries(
      AI_ENGINES.map((engine) => [engine, String(round(share[engine] * 100))]),
    ) as CloudLimitsDraft['engineShare'],
  };
}

/** 0.55 * 100 da 55.00000000000001, y eso no se le enseña a nadie */
const round = (value: number) => Math.round(value * 100) / 100;

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
  const text = adminText.adminConfig.aiForm;
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
  const cloud = draft.cloud;
  if (cloud) {
    if (!isMoney(cloud.perUserDailyUsd) || Number(cloud.perUserDailyUsd) > 1000) {
      errors.perUserDailyUsd = text.budgetError;
    }
    if (!isInt(cloud.cardGenerationsPerDay, 1, 1000)) {
      errors.cardGenerationsPerDay = text.integerError;
    }
    if (!isInt(cloud.sectionsPerGeneration, 1, 12))
      errors.sectionsPerGeneration = text.sectionsError;
    if (!isInt(cloud.maxPendingJobs, 1, 1000)) errors.maxPendingJobs = text.integerError;
    for (const engine of AI_ENGINES) {
      const share = Number(cloud.engineShare[engine]);
      if (
        cloud.engineShare[engine].trim() === '' ||
        !Number.isFinite(share) ||
        share < 0 ||
        share > 100
      ) {
        errors[`share.${engine}`] = text.shareError;
      }
    }
  }
  if (adding) {
    const { id, input, output, cacheWrite, cacheRead } = draft.newModel;
    if (!MODEL_ID.test(id.trim()) || DATED.test(id.trim())) errors['new.id'] = text.newModelIdError;
    for (const [key, raw] of Object.entries({ input, output, cacheWrite, cacheRead })) {
      if (!isMoney(raw)) errors[`new.${key}`] = text.priceError;
    }
  }
  return errors;
}

/** Los límites de la nube que cambiaron contra lo que el servicio ya tiene */
function cloudPatchOf(cloud: CloudLimitsDraft, config: AdminConfig) {
  const patch: Pick<
    NonNullable<AdminConfigPatch['limits']>,
    | 'perUserDailyUsd'
    | 'cardGenerationsPerDay'
    | 'sectionsPerGeneration'
    | 'maxPendingJobs'
    | 'engineShare'
  > = {};
  const { limits } = config;
  if (Number(cloud.perUserDailyUsd) !== limits.perUserDailyUsd) {
    patch.perUserDailyUsd = Number(cloud.perUserDailyUsd);
  }
  if (Number(cloud.cardGenerationsPerDay) !== limits.cardGenerationsPerDay) {
    patch.cardGenerationsPerDay = Number(cloud.cardGenerationsPerDay);
  }
  if (Number(cloud.sectionsPerGeneration) !== limits.sectionsPerGeneration) {
    patch.sectionsPerGeneration = Number(cloud.sectionsPerGeneration);
  }
  if (Number(cloud.maxPendingJobs) !== limits.maxPendingJobs) {
    patch.maxPendingJobs = Number(cloud.maxPendingJobs);
  }
  const shares: Partial<Record<AiEngine, number>> = {};
  for (const engine of AI_ENGINES) {
    const value = round(Number(cloud.engineShare[engine])) / 100;
    if (value !== limits.engineShare?.[engine]) shares[engine] = value;
  }
  if (Object.keys(shares).length > 0) patch.engineShare = shares;
  return patch;
}

/**
 * Los motores abiertos a los alumnos que quedarían cerrados con estos cambios, porque cambia su modelo,
 * su esfuerzo o su razonamiento (B12, 5.5 y 10.12). Un cambio del tope de tokens no cierra nada, porque
 * la compuerta ata el motor al modelo, al esfuerzo, al razonamiento y al prompt que se auditaron
 */
export function enginesClosedBy(
  patch: AdminConfigPatch,
  config: AdminConfig,
  open: ReadonlySet<AiEngine>,
): AiEngine[] {
  return AI_ENGINES.filter((engine) => {
    const next = patch.models?.[engine];
    if (!open.has(engine) || next === undefined) return false;
    const before = config.models[engine];
    return (
      next.id !== before.id ||
      next.effort !== before.effort ||
      (next.thinking !== undefined && next.thinking !== (before.thinking ?? null))
    );
  });
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
    const thinking = row.thinking === '' ? null : row.thinking;
    const before = config.models[engine];
    const thinkingChanged = thinking !== (before.thinking ?? null);
    if (
      next.id !== before.id ||
      next.effort !== before.effort ||
      next.maxTokens !== before.maxTokens ||
      thinkingChanged
    ) {
      // Sin razonamiento en el cambio, el servicio conserva el de antes si el modelo no cambia. Si el
      // modelo cambia, hay que decirlo, porque cada modelo acepta el suyo
      models[engine] = next.id !== before.id || thinkingChanged ? { ...next, thinking } : next;
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
  if (draft.cloud) Object.assign(limits, cloudPatchOf(draft.cloud, config));
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
