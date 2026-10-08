import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AI_ENGINES } from '../../../src/engines/aiContracts.ts';
import {
  AiConfigPatchSchema,
  DEFAULT_CONFIG,
  loadAiConfig,
  mergeConfig,
  saveAiConfig,
} from './config.ts';

const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-config-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

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

  it('Haiku 4.5 no recibe esfuerzo, que ese modelo no acepta', () => {
    expect(DEFAULT_CONFIG.models.forgetting.effort).toBeNull();
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
  });
});

describe('archivo local', () => {
  it('guarda y vuelve a leer la configuración completa', () => {
    const file = join(tempDir(), 'ai-config.local.json');
    const next = mergeConfig(DEFAULT_CONFIG, { limits: { perStudentPerDay: { forgetting: 7 } } });
    saveAiConfig(file, next);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
      limits: { perStudentPerDay: { forgetting: 7 } },
    });
    // Leer un archivo completo como cambios mezcla igual
    expect(loadAiConfig(file).limits.perStudentPerDay.forgetting).toBe(7);
  });

  it('sin archivo, con archivo dañado o con valores inválidos usa los de fábrica', () => {
    expect(loadAiConfig(null)).toBe(DEFAULT_CONFIG);
    const dir = tempDir();
    expect(loadAiConfig(join(dir, 'no-existe.json'))).toBe(DEFAULT_CONFIG);
    const broken = join(dir, 'roto.json');
    writeFileSync(broken, '{ no es json');
    expect(loadAiConfig(broken)).toBe(DEFAULT_CONFIG);
    const invalid = join(dir, 'invalido.json');
    writeFileSync(invalid, JSON.stringify({ limits: { perStudentPerDay: { forgetting: -4 } } }));
    expect(loadAiConfig(invalid)).toBe(DEFAULT_CONFIG);
  });
});
