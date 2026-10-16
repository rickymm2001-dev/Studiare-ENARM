import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, mergeConfig } from '../../../supabase/functions/_shared/ai/config.ts';
import { loadAiConfig, saveAiConfig } from './configFile.ts';

const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-config-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
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
    expect(loadAiConfig(file)).toEqual(next);
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

  it('un archivo guardado antes de B12, sin razonamiento ni límites nuevos, se sigue leyendo', () => {
    const file = join(tempDir(), 'ai-config.local.json');
    const before = {
      models: {
        forgetting: { id: 'claude-haiku-4-5', effort: null, maxTokens: 1500 },
        weekly_report: { id: 'claude-haiku-4-5', effort: null, maxTokens: 1500 },
        flashcards: { id: 'claude-sonnet-5-5', effort: 'low', maxTokens: 6000 },
        bias_tips: { id: 'claude-haiku-4-5', effort: null, maxTokens: 900 },
        restructure: { id: 'claude-sonnet-5-5', effort: 'low', maxTokens: 4000 },
      },
      prices: DEFAULT_CONFIG.prices,
      limits: {
        perStudentPerDay: DEFAULT_CONFIG.limits.perStudentPerDay,
        dailyBudgetUsd: 3,
        timeoutMs: 30_000,
        maxRetries: 2,
      },
    };
    writeFileSync(file, JSON.stringify(before));
    const loaded = loadAiConfig(file);
    expect(loaded.models.bias_tips.maxTokens).toBe(900);
    expect(loaded.models.flashcards.thinking).toBe('adaptive');
    expect(loaded.limits.dailyBudgetUsd).toBe(3);
    expect(loaded.limits.perUserDailyUsd).toBe(DEFAULT_CONFIG.limits.perUserDailyUsd);
  });
});
