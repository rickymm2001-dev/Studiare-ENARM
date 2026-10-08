import { describe, expect, it } from 'vitest';
import { AI_ENGINES } from '../../src/engines/aiContracts.ts';
import { mockOutput } from '../../src/engines/aiMock.ts';
import { createAiDeps } from '../src/ai/index.ts';
import { createAnthropicProvider, type AiProvider } from '../src/ai/provider.ts';
import type { RunDeps } from '../src/ai/run.ts';
import { fakeApi, fakeMessage } from '../src/ai/testing/fakes.ts';
import { buildCases } from './cases.ts';
import {
  checkTargets,
  evaluateCase,
  formatReport,
  runEvaluation,
  summarize,
  type CaseResult,
} from './run.ts';

const files = { config: null, ledger: null };

function mockDeps(provider?: AiProvider): RunDeps {
  const ai = createAiDeps({ credentials: { mode: 'mock', apiKey: null }, files });
  return {
    provider: provider ?? ai.provider,
    prompts: ai.prompts,
    config: ai.config(),
    sourceKeys: ai.sourceKeys,
  };
}

describe('casos dorados', () => {
  const cases = buildCases();

  it('hay de 10 a 20 por motor y cada ID es único', () => {
    for (const engine of AI_ENGINES) {
      const count = cases.filter((golden) => golden.engine === engine).length;
      expect(count, engine).toBeGreaterThanOrEqual(10);
      expect(count, engine).toBeLessThanOrEqual(20);
    }
    expect(new Set(cases.map((golden) => golden.id)).size).toBe(cases.length);
  });

  it('los hay con respuesta y sin ella', () => {
    expect(cases.filter((golden) => golden.expect === 'no_answer').length).toBeGreaterThanOrEqual(
      4,
    );
    expect(cases.filter((golden) => golden.expect === 'answer').length).toBeGreaterThan(40);
  });

  it('ninguna entrada trae datos personales', async () => {
    const { findPersonalData, hasPersonalData } = await import('../src/ai/pii.ts');
    for (const golden of cases) {
      expect(hasPersonalData(findPersonalData(golden.input)), golden.id).toBe(false);
    }
  });
});

describe('con las respuestas fijas', () => {
  it('cumple las tres metas de la sección 8.7', async () => {
    const { results, stoppedByBudget } = await runEvaluation(mockDeps());
    expect(stoppedByBudget).toBe(false);
    const summary = summarize(results);
    const total = summary.find((item) => item.engine === 'total');
    expect(total).toBeDefined();
    if (!total) return;
    expect(checkTargets(total)).toEqual({
      schema: true,
      grounding: true,
      rejection: true,
      met: true,
    });
    expect(results.filter((result) => !result.passed).map((result) => result.id)).toEqual([]);
    // Un renglón por motor y el total
    expect(summary.map((item) => item.engine)).toEqual([...AI_ENGINES, 'total']);
  });

  it('el reporte dice las metas y no inventa un costo real', async () => {
    const { results } = await runEvaluation(mockDeps());
    const report = formatReport(summarize(results), results, {
      mode: 'mock',
      stoppedByBudget: false,
    });
    expect(report).toContain('modo simulado');
    expect(report).toContain('Costo teórico');
    expect(report).toContain('Meta de esquema válido en 100% de los casos cumplida');
    expect(report).toContain('No hubo gasto real');
  });

  it('se puede correr un solo motor y limitar los casos', async () => {
    const { results } = await runEvaluation(mockDeps(), {
      engines: ['bias_tips'],
      limitPerEngine: 3,
    });
    expect(results).toHaveLength(3);
    expect(new Set(results.map((result) => result.engine))).toEqual(new Set(['bias_tips']));
  });

  it('se detiene cuando llega al tope de costo', async () => {
    const { results, stoppedByBudget } = await runEvaluation(mockDeps(), { maxCostUsd: 0.00001 });
    expect(stoppedByBudget).toBe(true);
    expect(results.length).toBeLessThan(buildCases().length);
  });
});

describe('con un modelo real falso', () => {
  it('un modelo que responde como las respuestas fijas cumple las metas y reporta costo real', async () => {
    const goldens = buildCases();
    // El modelo falso contesta lo que le toca a cada caso, en el orden en que se piden
    const replies = goldens.map((golden) =>
      fakeMessage(JSON.stringify(mockOutput(golden.engine, golden.input as never)), {
        usage: { input_tokens: 1200, output_tokens: 250 },
      }),
    );
    // Los casos que se rechazan piden dos intentos
    const expanded = goldens.flatMap((golden, index) =>
      golden.expect === 'no_answer' && golden.engine === 'restructure'
        ? [replies[index], replies[index]]
        : [replies[index]],
    );
    const api = fakeApi(expanded.flatMap((reply) => (reply ? [reply] : [])));
    const provider = createAnthropicProvider(api, () => ({ timeoutMs: 1000, maxRetries: 0 }));
    const { results } = await runEvaluation(mockDeps(provider));
    const total = summarize(results).find((item) => item.engine === 'total');
    expect(total && checkTargets(total).met).toBe(true);
    expect(total?.costUsd).toBeGreaterThan(0);
  });

  it('un modelo que inventa evidencia falla el anclaje y se nota en el reporte', async () => {
    const golden = buildCases().find((item) => item.id === 'forgetting-interference');
    if (!golden) throw new Error('Falta el caso');
    const bad = JSON.stringify({
      ...mockOutput('forgetting', golden.input as never),
      evidence: ['ev-inventada'],
    });
    const api = fakeApi([fakeMessage(bad), fakeMessage(bad)]);
    const provider = createAnthropicProvider(api, () => ({ timeoutMs: 1000, maxRetries: 0 }));
    const result = await evaluateCase(mockDeps(provider), golden);
    expect(result).toMatchObject({
      schemaValid: true,
      accepted: false,
      passed: false,
      error: 'invalid_output',
      retried: true,
    });
    const report = formatReport(summarize([result]), [result], {
      mode: 'real',
      stoppedByBudget: false,
    });
    expect(report).toContain('Meta de anclaje correcto en 100% de las respuestas NO cumplida');
    expect(report).toContain('forgetting-interference (invalid_output)');
  });

  it('un modelo que contesta algo donde no hay evidencia no cuenta como rechazo correcto', async () => {
    const golden = buildCases().find(
      (item) => item.expect === 'no_answer' && item.engine === 'forgetting',
    );
    if (!golden) throw new Error('Falta el caso');
    const input = golden.input as { evidence: { ref: string }[] };
    const stubborn = JSON.stringify({
      hypothesis: 'Hay un patrón claro en este tema.',
      evidence: [input.evidence[0]?.ref],
      confidence: 'low',
      actions: [],
      studentMessage: 'Revisa el tema con calma. Hazlo con ejemplos.',
    });
    const provider = createAnthropicProvider(fakeApi([fakeMessage(stubborn)]), () => ({
      timeoutMs: 1000,
      maxRetries: 0,
    }));
    const result = await evaluateCase(mockDeps(provider), golden);
    expect(result.accepted).toBe(true);
    expect(result.empty).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('una caída del proveedor no cuenta como rechazo correcto', async () => {
    const golden = buildCases().find(
      (item) => item.expect === 'no_answer' && item.engine === 'flashcards',
    );
    if (!golden) throw new Error('Falta el caso');
    const provider = createAnthropicProvider(fakeApi([new Error('sin red')]), () => ({
      timeoutMs: 1000,
      maxRetries: 0,
    }));
    const result = await evaluateCase(mockDeps(provider), golden);
    expect(result).toMatchObject({ passed: false, error: 'provider_error', schemaValid: false });
  });
});

describe('métricas', () => {
  const result = (overrides: Partial<CaseResult>): CaseResult => ({
    id: 'x',
    engine: 'forgetting',
    expect: 'answer',
    schemaValid: true,
    accepted: true,
    empty: false,
    retried: false,
    passed: true,
    error: null,
    costUsd: 0.01,
    latencyMs: 100,
    issues: [],
    ...overrides,
  });

  it('calcula porcentajes, costo y latencias', () => {
    const summary = summarize([
      result({ latencyMs: 100 }),
      result({ latencyMs: 300, schemaValid: false, passed: false }),
      result({ expect: 'no_answer', latencyMs: 200 }),
    ]);
    const total = summary.at(-1);
    expect(total).toMatchObject({
      cases: 3,
      answerCases: 2,
      rejectionCases: 1,
      schemaValid: 2,
      grounded: 1,
      rejectedRight: 1,
      costUsd: 0.03,
      avgLatencyMs: 200,
      p95LatencyMs: 300,
    });
    expect(total && checkTargets(total).met).toBe(false);
  });

  it('sin casos de un tipo, la meta de ese tipo se da por cumplida', () => {
    const total = summarize([result({})]).at(-1);
    expect(total && checkTargets(total)).toMatchObject({ rejection: true });
  });
});
