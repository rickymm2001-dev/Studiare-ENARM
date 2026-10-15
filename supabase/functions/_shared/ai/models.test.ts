import { describe, expect, it } from 'vitest';
import { configProblem, DEFAULT_CONFIG } from './config.ts';
import { AI_EFFORTS } from './engines/aiContracts.ts';
import { effortParam, modelChoiceProblem, MODEL_RULES } from './models.ts';

const choice = (
  id: string,
  effort: (typeof AI_EFFORTS)[number] | null,
  thinking: 'adaptive' | 'off' | null,
) => ({
  id,
  effort,
  thinking,
});

describe('reglas por modelo (2.8)', () => {
  it('la configuración de fábrica las cumple', () => {
    expect(configProblem(DEFAULT_CONFIG)).toBeNull();
  });

  it('Haiku 4.5 no acepta esfuerzo ni razonamiento', () => {
    expect(modelChoiceProblem(choice('claude-haiku-4-5', null, null))).toBeNull();
    expect(modelChoiceProblem(choice('claude-haiku-4-5', 'low', null))).toBe(
      'claude-haiku-4-5 no acepta esfuerzo',
    );
    expect(modelChoiceProblem(choice('claude-haiku-4-5', null, 'adaptive'))).toMatch(
      /sin razonamiento configurable/,
    );
  });

  it('Haiku 5.5 y Sonnet 5.5 apagan el razonamiento solo con esfuerzo de low a high', () => {
    for (const id of ['claude-haiku-5-5', 'claude-sonnet-5-5']) {
      for (const effort of ['low', 'medium', 'high'] as const) {
        expect(modelChoiceProblem(choice(id, effort, 'off')), `${id} ${effort}`).toBeNull();
      }
      for (const effort of ['xhigh', 'max', null] as const) {
        expect(modelChoiceProblem(choice(id, effort, 'off')), `${id} ${String(effort)}`).toMatch(
          /solo apaga el razonamiento/,
        );
      }
      for (const effort of AI_EFFORTS) {
        expect(modelChoiceProblem(choice(id, effort, 'adaptive'))).toBeNull();
      }
    }
  });

  it('Opus 5.5 nunca apaga el razonamiento', () => {
    expect(modelChoiceProblem(choice('claude-opus-5-5', 'low', 'off'))).toBe(
      'claude-opus-5-5 no deja apagar el razonamiento',
    );
    expect(modelChoiceProblem(choice('claude-opus-5-5', 'max', 'adaptive'))).toBeNull();
  });

  it('un modelo fuera de la tabla solo va sin esfuerzo y sin apagar el razonamiento', () => {
    expect(MODEL_RULES['claude-nuevo-6']).toBeUndefined();
    expect(modelChoiceProblem(choice('claude-nuevo-6', null, 'adaptive'))).toBeNull();
    expect(modelChoiceProblem(choice('claude-nuevo-6', null, null))).toBeNull();
    expect(modelChoiceProblem(choice('claude-nuevo-6', 'low', 'adaptive'))).toMatch(/sin esfuerzo/);
    expect(modelChoiceProblem(choice('claude-nuevo-6', null, 'off'))).toMatch(/no se apaga/);
    expect(
      effortParam({ ...choice('claude-nuevo-6', 'low', null), maxTokens: 1000 }),
    ).toBeUndefined();
  });

  it('configProblem dice el motor y el motivo', () => {
    const config = {
      ...DEFAULT_CONFIG,
      models: {
        ...DEFAULT_CONFIG.models,
        restructure: {
          id: 'claude-opus-5-5',
          effort: 'low' as const,
          thinking: 'off' as const,
          maxTokens: 4000,
        },
      },
    };
    expect(configProblem(config)).toBe(
      'El motor restructure no se puede guardar así. claude-opus-5-5 no deja apagar el razonamiento',
    );
  });
});
