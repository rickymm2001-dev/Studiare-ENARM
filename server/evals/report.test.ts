import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RunDeps } from '../../supabase/functions/_shared/ai/run.ts';
import { createAiDeps } from '../src/ai/index.ts';
import { runBatchEvaluation, simulatedReply } from './batch.ts';
import { Budget } from './budget.ts';
import { buildCases } from './cases.ts';
import { createFakeBatchApi } from './fakeBatch.ts';
import { runMatrix } from './matrix.ts';
import type { OpenAiModel } from './openaiModels.ts';
import {
  BATCH_SECTION,
  formatBatchSection,
  formatOpenAiSection,
  OPENAI_SECTION,
  sectionOf,
  writeMatrixReport,
  writeReportSection,
} from './report.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function deps(): RunDeps {
  const ai = createAiDeps({
    credentials: { mode: 'mock', apiKey: null },
    files: { config: null, ledger: null },
  });
  return {
    provider: ai.provider,
    prompts: ai.prompts,
    config: ai.config(),
    sourceKeys: ai.sourceKeys,
  };
}

describe('archivo del reporte', () => {
  it('la elección de modelo conserva la comparación con OpenAI y el lote', () => {
    const dir = mkdtempSync(join(tmpdir(), 'enarm-report-'));
    dirs.push(dir);
    const file = join(dir, 'eval-ai-report.md');
    writeReportSection(file, OPENAI_SECTION, 'Comparación vieja');
    writeReportSection(file, BATCH_SECTION, 'Lote viejo');
    writeMatrixReport(
      file,
      '# Evaluación de modelos de IA (B12)\n\n## Resultado por motor\n\nNuevo\n',
    );
    const text = readFileSync(file, 'utf8');
    expect(sectionOf(text, 'Resultado por motor')).toBe('Nuevo');
    expect(sectionOf(text, OPENAI_SECTION)).toBe('Comparación vieja');
    expect(sectionOf(text, BATCH_SECTION)).toBe('Lote viejo');
    writeFileSync(file, '');
    writeMatrixReport(file, '# Título\n');
    expect(readFileSync(file, 'utf8')).toBe('# Título\n');
  });
});

describe('secciones', () => {
  it('la comparación con OpenAI dice precio, fecha, fuente y el sesgo posible del juez', async () => {
    const model: OpenAiModel = {
      id: 'modelo-de-prueba',
      tier: 'mid',
      price: { input: 1, output: 4, cachedInput: 0.1 },
      reasoningEffort: null,
      source: 'https://example.invalid/precios',
      checkedAt: '2026-10-15',
    };
    const config = deps().config;
    const matrix = await runMatrix(
      {
        deps: {
          ...deps(),
          config: {
            ...config,
            prices: {
              ...config.prices,
              [model.id]: { input: 1, output: 4, cacheRead: 0.1, cacheWrite: 1 },
            },
          },
        },
        cases: buildCases(),
        budget: new Budget(Number.POSITIVE_INFINITY),
      },
      {
        engines: ['bias_tips'],
        only: null,
        explicit: [
          {
            name: `openai:${model.id}`,
            id: model.id,
            effort: null,
            thinking: null,
            onlyIfNonePass: false,
            note: '',
          },
        ],
        repeat: 1,
        limitPerEngine: 2,
      },
    );
    expect(matrix.runs.map((run) => run.candidate.name)).toEqual(['openai:modelo-de-prueba']);
    const section = formatOpenAiSection({
      date: '2026-10-15',
      matrix,
      judges: new Map(),
      judged: false,
      models: [model],
      spentUsd: 0.5,
      maxCostUsd: 5,
    });
    expect(section).toContain('| bias_tips | modelo-de-prueba |');
    expect(section).toContain('leídos el 2026-10-15 en https://example.invalid/precios');
    expect(section).toContain('10.8');
    expect(section).toContain('Gasto 0.5000 dólares de un tope de 5.');
  });

  it('el lote dice cuántos lotes, el costo a la mitad y si se borraron', async () => {
    const cases = buildCases()
      .filter((golden) => golden.engine === 'forgetting')
      .slice(0, 2);
    const result = await runBatchEvaluation({
      deps: deps(),
      cases,
      api: createFakeBatchApi({ respond: simulatedReply('forgetting') }),
      budget: new Budget(1),
      sleep: () => Promise.resolve(),
    });
    const section = formatBatchSection({
      date: '2026-10-15',
      mode: 'mock',
      engine: 'forgetting',
      model: 'claude-haiku-4-5',
      result,
    });
    expect(section).toContain('1 lote con 2 peticiones');
    expect(section).toContain('Costo al 50%');
    expect(section).toContain('Lotes borrados en Anthropic al terminar sí');
  });
});
