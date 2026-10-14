import { describe, expect, it } from 'vitest';
import { AiConfigPatchSchema, DEFAULT_CONFIG, mergeConfig } from './config.ts';
import { AI_ENGINES } from './engines/aiContracts.ts';

describe('configuración de fábrica', () => {
  it('cada motor tiene modelo, sin sufijo de fecha, y el modelo tiene precio', () => {
    for (const engine of AI_ENGINES) {
      const model = DEFAULT_CONFIG.models[engine];
      expect(model.id, engine).toMatch(/^claude-[a-z0-9-]+$/);
      expect(model.id, engine).not.toMatch(/-\d{8}$/);
      expect(DEFAULT_CONFIG.prices[model.id], engine).toBeDefined();
    }
  });

  it('usa los modelos y precios de la especificación', () => {
    expect(DEFAULT_CONFIG.models.forgetting.id).toBe('claude-haiku-4-5');
    expect(DEFAULT_CONFIG.models.flashcards.id).toBe('claude-sonnet-5-5');
    expect(DEFAULT_CONFIG.prices['claude-haiku-4-5']).toEqual({
      input: 1,
      output: 5,
      cacheWrite: 1.25,
      cacheRead: 0.1,
    });
    expect(DEFAULT_CONFIG.prices['claude-sonnet-5-5']?.output).toBe(10);
    expect(DEFAULT_CONFIG.prices['claude-opus-5-5']?.input).toBe(4);
  });

  it('Haiku 4.5 no recibe esfuerzo ni razonamiento, que ese modelo no configura', () => {
    expect(DEFAULT_CONFIG.models.forgetting.effort).toBeNull();
    expect(DEFAULT_CONFIG.models.forgetting.thinking).toBeNull();
    expect(DEFAULT_CONFIG.models.flashcards.thinking).toBe('adaptive');
  });

  it('trae los límites de B12 con los valores de 2.4 del plan', () => {
    const limits = DEFAULT_CONFIG.limits;
    expect(limits.perUserDailyUsd).toBe(0.3);
    expect(limits.cardGenerationsPerDay).toBe(20);
    expect(limits.sectionsPerGeneration).toBe(12);
    expect(limits.maxPendingJobs).toBe(12);
    expect(limits.engineShare).toEqual({
      forgetting: 0.1,
      weekly_report: 0.1,
      flashcards: 0.55,
      bias_tips: 0.1,
      restructure: 0.15,
    });
    // Son techos y no apartados. Hoy suman justo el presupuesto completo
    const total = AI_ENGINES.reduce((sum, engine) => sum + limits.engineShare[engine], 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('cambios', () => {
  it('mezcla solo lo que se manda', () => {
    const next = mergeConfig(DEFAULT_CONFIG, {
      models: { bias_tips: { id: 'claude-haiku-5-5', effort: 'low', maxTokens: 800 } },
      limits: { perStudentPerDay: { bias_tips: 5 } },
    });
    expect(next.models.bias_tips.id).toBe('claude-haiku-5-5');
    expect(next.models.forgetting).toEqual(DEFAULT_CONFIG.models.forgetting);
    expect(next.limits.perStudentPerDay.bias_tips).toBe(5);
    expect(next.limits.perStudentPerDay.flashcards).toBe(
      DEFAULT_CONFIG.limits.perStudentPerDay.flashcards,
    );
    expect(next.limits.dailyBudgetUsd).toBe(DEFAULT_CONFIG.limits.dailyBudgetUsd);
  });

  it('no acepta un modelo sin precio', () => {
    expect(() =>
      mergeConfig(DEFAULT_CONFIG, {
        models: { forgetting: { id: 'claude-otro-1', effort: null, maxTokens: 500 } },
      }),
    ).toThrow('Falta el precio');
    const priced = mergeConfig(DEFAULT_CONFIG, {
      models: { forgetting: { id: 'claude-otro-1', effort: null, maxTokens: 500 } },
      prices: { 'claude-otro-1': { input: 1, output: 1, cacheWrite: 1, cacheRead: 1 } },
    });
    expect(priced.models.forgetting.id).toBe('claude-otro-1');
  });

  it('el esquema rechaza fechas en el ID, campos de más y valores absurdos', () => {
    const bad = (value: unknown) => AiConfigPatchSchema.safeParse(value).success;
    expect(
      bad({
        models: { forgetting: { id: 'claude-haiku-4-5-20251001', effort: null, maxTokens: 500 } },
      }),
    ).toBe(false);
    expect(bad({ apiKey: 'x' })).toBe(false);
    expect(bad({ limits: { perStudentPerDay: { forgetting: 0 } } })).toBe(false);
    expect(bad({ limits: { dailyBudgetUsd: -1 } })).toBe(false);
    expect(bad({ models: { otro: { id: 'claude-x', effort: null, maxTokens: 500 } } })).toBe(false);
    expect(bad({ limits: { perStudentPerDay: { forgetting: 10 } } })).toBe(true);
    expect(bad({ limits: { engineShare: { flashcards: 1.5 } } })).toBe(false);
    expect(bad({ limits: { perUserDailyUsd: -0.1 } })).toBe(false);
    expect(bad({ limits: { sectionsPerGeneration: 0 } })).toBe(false);
    expect(
      bad({
        models: {
          forgetting: { id: 'claude-x', effort: 'max', thinking: 'siempre', maxTokens: 500 },
        },
      }),
    ).toBe(false);
    expect(
      bad({
        models: {
          forgetting: { id: 'claude-x', effort: 'xhigh', thinking: 'off', maxTokens: 500 },
        },
      }),
    ).toBe(true);
  });

  it('mezcla las cuotas por motor sin perder las demás', () => {
    const next = mergeConfig(DEFAULT_CONFIG, {
      limits: { engineShare: { flashcards: 0.4 }, perUserDailyUsd: 0.5 },
    });
    expect(next.limits.engineShare.flashcards).toBe(0.4);
    expect(next.limits.engineShare.restructure).toBe(0.15);
    expect(next.limits.perUserDailyUsd).toBe(0.5);
    expect(next.limits.cardGenerationsPerDay).toBe(DEFAULT_CONFIG.limits.cardGenerationsPerDay);
  });

  it('un cambio sin razonamiento lo conserva si el modelo es el mismo y lo deja en null si cambia', () => {
    const same = mergeConfig(DEFAULT_CONFIG, {
      models: { flashcards: { id: 'claude-sonnet-5-5', effort: 'medium', maxTokens: 7000 } },
    });
    expect(same.models.flashcards).toEqual({
      id: 'claude-sonnet-5-5',
      effort: 'medium',
      thinking: 'adaptive',
      maxTokens: 7000,
    });
    const other = mergeConfig(DEFAULT_CONFIG, {
      models: { flashcards: { id: 'claude-haiku-4-5', effort: null, maxTokens: 7000 } },
    });
    expect(other.models.flashcards.thinking).toBeNull();
    const explicit = mergeConfig(DEFAULT_CONFIG, {
      models: {
        flashcards: { id: 'claude-haiku-5-5', effort: 'low', thinking: 'off', maxTokens: 4000 },
      },
    });
    expect(explicit.models.flashcards.thinking).toBe('off');
  });
});
