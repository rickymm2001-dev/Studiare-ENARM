// Reglas de razonamiento y esfuerzo por modelo (B12, 2.8 y 0.5). La API rechaza con 400 ciertas
// combinaciones, como apagar el razonamiento de Opus 5.5 o mandar esfuerzo a Haiku 4.5. Aquí se
// decide qué se manda para cada modelo y se rechaza una configuración que no cumple al guardarla en
// la pantalla 25, nunca a media llamada. Datos de la referencia de la API del 2026-10-06:
//   claude-haiku-4-5   sin esfuerzo y sin razonamiento configurable
//   claude-haiku-5-5   esfuerzo de low a max. off se manda como disabled, solo con low, medium o high
//   claude-sonnet-5-5  esfuerzo de low a max. off se manda como between_tools, solo con high o menos
//   claude-opus-5-5    esfuerzo de low a max. El razonamiento no se puede apagar
//   otro modelo        solo esfuerzo null y razonamiento adaptive, y necesita su precio
import type { ThinkingConfigParam } from '@anthropic-ai/sdk/resources/messages';
import type { AiEffort } from './engines/aiContracts.ts';
import type { ModelChoice } from './config.ts';

interface ModelRule {
  /** Esfuerzos aceptados. Vacío si el modelo no acepta esfuerzo */
  efforts: readonly AiEffort[];
  /** Cómo se apaga el razonamiento, o null si no se puede */
  off: ThinkingConfigParam | null;
  /** Esfuerzos con los que se puede apagar el razonamiento */
  offEfforts: readonly AiEffort[];
  /** El modelo razona de forma configurable. Sin esto el razonamiento va en null */
  thinking: boolean;
}

const ALL_EFFORTS: readonly AiEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const UP_TO_HIGH: readonly AiEffort[] = ['low', 'medium', 'high'];

export const MODEL_RULES: Readonly<Record<string, ModelRule>> = {
  'claude-haiku-4-5': { efforts: [], off: null, offEfforts: [], thinking: false },
  'claude-haiku-5-5': {
    efforts: ALL_EFFORTS,
    off: { type: 'disabled' },
    offEfforts: UP_TO_HIGH,
    thinking: true,
  },
  'claude-sonnet-5-5': {
    efforts: ALL_EFFORTS,
    off: { type: 'between_tools' },
    offEfforts: UP_TO_HIGH,
    thinking: true,
  },
  'claude-opus-5-5': { efforts: ALL_EFFORTS, off: null, offEfforts: [], thinking: true },
};

/** Por qué una elección de modelo no se puede mandar a la API, o null si se puede */
export function modelChoiceProblem(
  choice: Pick<ModelChoice, 'id' | 'effort' | 'thinking'>,
): string | null {
  const rule = MODEL_RULES[choice.id];
  if (!rule) {
    if (choice.effort !== null)
      return `${choice.id} no está en la tabla de modelos y va sin esfuerzo`;
    if (choice.thinking === 'off')
      return `${choice.id} no está en la tabla de modelos y no se apaga su razonamiento`;
    return null;
  }
  if (choice.effort !== null && !rule.efforts.includes(choice.effort)) {
    return rule.efforts.length === 0
      ? `${choice.id} no acepta esfuerzo`
      : `${choice.id} no acepta el esfuerzo ${choice.effort}`;
  }
  if (!rule.thinking) {
    return choice.thinking === null ? null : `${choice.id} va sin razonamiento configurable`;
  }
  if (choice.thinking === 'off') {
    if (!rule.off) return `${choice.id} no deja apagar el razonamiento`;
    if (choice.effort === null || !rule.offEfforts.includes(choice.effort)) {
      return `${choice.id} solo apaga el razonamiento con esfuerzo low, medium o high`;
    }
  }
  return null;
}

/**
 * El razonamiento que se manda. Solo se manda para apagarlo. Con adaptive no se manda nada, porque
 * en Haiku 5.5, Sonnet 5.5 y Opus 5.5 omitirlo ya es razonamiento adaptativo, y así un modelo nuevo
 * que no conozca el parámetro tampoco lo recibe
 */
export function thinkingParam(choice: ModelChoice): ThinkingConfigParam | undefined {
  const rule = MODEL_RULES[choice.id];
  if (!rule?.thinking || choice.thinking !== 'off') return undefined;
  return rule.off ?? undefined;
}

/** El esfuerzo que se manda en output_config. undefined si el modelo no lo acepta */
export function effortParam(choice: ModelChoice): AiEffort | undefined {
  const rule = MODEL_RULES[choice.id];
  if (!rule || choice.effort === null || !rule.efforts.includes(choice.effort)) return undefined;
  return choice.effort;
}
