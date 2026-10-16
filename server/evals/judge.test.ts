import { describe, expect, it } from 'vitest';
import { mockOutput } from '../../src/engines/aiMock.ts';
import { DEFAULT_CONFIG } from '../../supabase/functions/_shared/ai/config.ts';
import {
  createMockProvider,
  type AiProvider,
} from '../../supabase/functions/_shared/ai/provider.ts';
import type { RunDeps } from '../../supabase/functions/_shared/ai/run.ts';
import { fakeMessage } from '../../supabase/functions/_shared/ai/testing/fakes.ts';
import { createAiDeps } from '../src/ai/index.ts';
import { Budget } from './budget.ts';
import { CANDIDATES } from './candidates.ts';
import { buildCases } from './cases.ts';
import { chooseForEngine, runKey, type CandidateRun } from './choice.ts';
import { createFakeBatchApi, errored, expired, succeeded } from './fakeBatch.ts';
import {
  buildJudgeRequest,
  createBatchJudge,
  createSimulatedJudge,
  judgeMatrix,
  simulatedVerdict,
  summarizeVerdicts,
  type JudgeItem,
} from './judge.ts';
import { runMatrix } from './matrix.ts';
import { rubricPrompt, verdictSchema } from './rubrics.ts';
import type { CaseResult } from './run.ts';

const OPUS = DEFAULT_CONFIG.prices['claude-opus-5-5'];
if (!OPUS) throw new Error('Falta el precio de Opus');

function mockDeps(): RunDeps {
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

const golden = buildCases().find((item) => item.engine === 'bias_tips');
if (!golden) throw new Error('Falta el caso');
const tipItem = (id: string, output: unknown = mockOutput('bias_tips', golden.input as never)) =>
  ({ id, engine: 'bias_tips', input: golden.input, output }) satisfies JudgeItem;

const verdictJson = (scores: Record<string, number>, critical = false) =>
  JSON.stringify({ scores, critical, reason: 'Bien anclado' });
const FOUR = { accuracy: 4, usefulness: 4, clarity: 4, format: 4 };

describe('petición del juez', () => {
  it('va a Opus 5.5 con esfuerzo alto, caché del bloque fijo y sin decir qué modelo escribió', () => {
    const request = buildJudgeRequest(tipItem('j1_0001'));
    expect(request.custom_id).toBe('j1_0001');
    expect(request.params.model).toBe('claude-opus-5-5');
    expect(request.params.output_config?.effort).toBe('high');
    expect(request.params.system).toEqual([
      { type: 'text', text: rubricPrompt('bias_tips'), cache_control: { type: 'ephemeral' } },
    ]);
    const serialized = JSON.stringify(request);
    for (const name of Object.keys(CANDIDATES)) expect(serialized).not.toContain(name);
    expect(serialized).not.toContain('haiku');
    expect(serialized).not.toContain('sonnet');
    expect(() => buildJudgeRequest(tipItem('id con espacios'))).toThrow('custom_id');
  });

  it('las reestructuradas suman distractores y transformación', () => {
    expect(rubricPrompt('restructure')).toContain('distractors');
    expect(rubricPrompt('bias_tips')).not.toContain('distractors');
    expect(
      verdictSchema('restructure').safeParse({
        scores: { ...FOUR, distractors: 3, transform: 4 },
        critical: false,
        reason: 'x',
      }).success,
    ).toBe(true);
    expect(
      verdictSchema('bias_tips').safeParse({
        scores: { ...FOUR, accuracy: 5 },
        critical: false,
        reason: 'x',
      }).success,
    ).toBe(false);
  });
});

describe('juez por lote', () => {
  it('manda un lote, lo sondea, lee cada calificación a mitad de precio y lo borra', async () => {
    const api = createFakeBatchApi({
      pollsUntilEnded: 3,
      respond: (request) =>
        succeeded(
          fakeMessage(
            request.custom_id === 'j1_0002' ? verdictJson(FOUR, true) : verdictJson(FOUR),
            {
              usage: { input_tokens: 2000, output_tokens: 1000 },
            },
          ),
        ),
    });
    const sleeps: number[] = [];
    const budget = new Budget(1);
    const judge = createBatchJudge({
      api,
      budget,
      price: OPUS,
      pollMs: 60_000,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });
    const outcome = await judge.judge([tipItem('j1_0001'), tipItem('j1_0002')]);
    expect(api.created).toHaveLength(1);
    expect(api.created[0]?.map((request) => request.custom_id)).toEqual(['j1_0001', 'j1_0002']);
    expect(sleeps).toEqual([60_000, 60_000, 60_000]);
    expect(outcome.verdicts.map((verdict) => [verdict.id, verdict.critical]).sort()).toEqual([
      ['j1_0001', false],
      ['j1_0002', true],
    ]);
    // 2,000 de entrada a 4 y 1,000 de salida a 20 por millón, a la mitad por lote, dos veces
    expect(outcome.costUsd).toBeCloseTo(2 * ((2000 * 4 + 1000 * 20) / 1e6) * 0.5, 6);
    expect(budget.spentUsd).toBeCloseTo(outcome.costUsd, 6);
    expect(api.deleted).toEqual(['msgbatch_fake_1']);
    expect(outcome.unjudged).toEqual([]);
  });

  it('una negativa, un corte, un error, un vencido o un JSON inválido quedan sin calificar', async () => {
    const replies: Record<string, ReturnType<typeof succeeded>> = {
      j1_0001: succeeded(fakeMessage(null, { stop: 'refusal' })),
      j1_0002: succeeded(fakeMessage('{"scores":', { stop: 'max_tokens' })),
      j1_0003: errored('api_error'),
      j1_0004: expired(),
      j1_0005: succeeded(fakeMessage('no es json')),
      j1_0006: succeeded(
        fakeMessage(JSON.stringify({ scores: { accuracy: 9 }, critical: false, reason: '' })),
      ),
    };
    const api = createFakeBatchApi({
      respond: (request) => replies[request.custom_id] ?? expired(),
    });
    const judge = createBatchJudge({
      api,
      budget: new Budget(1),
      price: OPUS,
      sleep: () => Promise.resolve(),
    });
    const outcome = await judge.judge(Object.keys(replies).map((id) => tipItem(id)));
    expect(outcome.verdicts).toEqual([]);
    expect(outcome.unjudged.sort()).toEqual(Object.keys(replies));
  });

  it('solo manda lo que cabe en el tope y dice que se detuvo', async () => {
    const api = createFakeBatchApi({ respond: () => succeeded(fakeMessage(verdictJson(FOUR))) });
    const judge = createBatchJudge({
      api,
      budget: new Budget(0.05),
      price: OPUS,
      sleep: () => Promise.resolve(),
    });
    const outcome = await judge.judge(
      Array.from({ length: 5 }, (_, index) => tipItem(`j1_000${index}`)),
    );
    expect(outcome.stoppedByBudget).toBe(true);
    const sent = api.created[0]?.length ?? 0;
    expect(sent).toBeGreaterThan(0);
    expect(sent).toBeLessThan(5);
    expect(outcome.unjudged).toHaveLength(5 - sent);
  });

  it('sin lugar en el tope no crea ningún lote', async () => {
    const api = createFakeBatchApi({ respond: () => succeeded(fakeMessage(verdictJson(FOUR))) });
    const judge = createBatchJudge({
      api,
      budget: new Budget(0.000001),
      price: OPUS,
      sleep: () => Promise.resolve(),
    });
    const outcome = await judge.judge([tipItem('j1_0001')]);
    expect(api.created).toEqual([]);
    expect(outcome).toMatchObject({ stoppedByBudget: true, unjudged: ['j1_0001'] });
  });

  it('cancela un lote que pasa del tiempo y recoge lo que haya', async () => {
    let now = 0;
    const api = createFakeBatchApi({
      pollsUntilEnded: 1_000,
      respond: () => succeeded(fakeMessage(verdictJson(FOUR))),
    });
    const judge = createBatchJudge({
      api,
      budget: new Budget(1),
      price: OPUS,
      maxWaitMs: 120_000,
      clock: () => now,
      sleep: (ms) => {
        now += ms;
        return Promise.resolve();
      },
    });
    const outcome = await judge.judge([tipItem('j1_0001')]);
    expect(api.canceled).toEqual(['msgbatch_fake_1']);
    expect(outcome.unjudged).toEqual(['j1_0001']);
    expect(api.deleted).toEqual(['msgbatch_fake_1']);
  });
});

describe('juez simulado', () => {
  it('las respuestas fijas pasan sin marcas críticas', () => {
    const verdict = simulatedVerdict(tipItem('a'));
    expect(verdict.critical).toBe(false);
    const summary = summarizeVerdicts('bias_tips', [{ id: 'a', ...verdict }], 0);
    expect(summary.mean).toBeGreaterThanOrEqual(3.3);
    expect(summary.passed).toBe(true);
  });

  it('marca crítica una dosis o un fármaco que la fuente no trae, y baja lo vago', () => {
    const input = golden.input as { examples: { ref: string }[] };
    const refs = input.examples.map((example) => example.ref);
    expect(
      simulatedVerdict(
        tipItem('a', { tip: 'Da 40 mg de digoxina siempre. Revisa.', exampleRefs: refs }),
      ).critical,
    ).toBe(true);
    const vague = simulatedVerdict(tipItem('b', { tip: 'Revisa bien.', exampleRefs: refs }));
    expect(vague.scores).toMatchObject({ usefulness: 2, format: 2 });
    expect(summarizeVerdicts('bias_tips', [{ id: 'b', ...vague }], 0).passed).toBe(false);
  });

  it('un texto sin calificar no deja pasar', () => {
    const verdict = { id: 'a', ...simulatedVerdict(tipItem('a')) };
    expect(summarizeVerdicts('bias_tips', [verdict], 1).passed).toBe(false);
    expect(summarizeVerdicts('bias_tips', [], 0).passed).toBe(false);
  });
});

describe('juez sobre la matriz', () => {
  const result = (id: string, output: unknown, cost = 0.001): CaseResult => ({
    id,
    engine: 'bias_tips',
    set: 'synthetic',
    expect: 'answer',
    adversarial: null,
    schemaValid: true,
    schemaValidFinal: true,
    accepted: true,
    empty: false,
    retried: false,
    refused: false,
    refusalCategory: null,
    cutoff: false,
    forbiddenHit: false,
    passed: true,
    error: null,
    costUsd: cost,
    latencyMs: 100,
    warmup: false,
    issues: [],
    output,
  });
  const run = (name: keyof typeof CANDIDATES, cost: number, output: unknown): CandidateRun => ({
    engine: 'bias_tips',
    candidate: CANDIDATES[name],
    repeats: [[result(golden.id, output, cost)], [result(golden.id, output, cost)]],
    complete: true,
  });
  const good = mockOutput('bias_tips', golden.input as never);
  const inputs = new Map([[golden.id, golden.input]]);

  it('si el más barato pasa, los más caros no se califican', async () => {
    const seen: JudgeItem[][] = [];
    const judge = createSimulatedJudge();
    const spy = {
      ...judge,
      judge: (items: readonly JudgeItem[]) => {
        seen.push([...items]);
        return judge.judge(items);
      },
    };
    const runs = [run('sonnet55-low', 0.004, good), run('haiku55-low', 0.0002, good)];
    const result = await judgeMatrix(runs, spy, { inputs });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(1);
    expect([...result.summaries.keys()]).toEqual([runKey('bias_tips', 'haiku55-low')]);
    // Ids ciegos, sin el nombre del candidato
    expect(seen[0]?.[0]?.id).toMatch(/^j1_\d{4}$/);
  });

  it('si el más barato no pasa, sigue con el siguiente y califica juntos a los que empatan', async () => {
    const seen: JudgeItem[][] = [];
    const judge = createSimulatedJudge();
    const vague = { tip: 'Revisa bien.', exampleRefs: good.exampleRefs };
    const spy = {
      ...judge,
      judge: (items: readonly JudgeItem[]) => {
        seen.push([...items]);
        return judge.judge(items);
      },
    };
    const runs = [
      run('haiku55-off', 0.0002, vague),
      run('haiku55-low', 0.000205, vague),
      run('haiku45', 0.0016, good),
      run('sonnet55-low', 0.004, good),
    ];
    const result = await judgeMatrix(runs, spy, { inputs });
    expect(seen.map((round) => round.length)).toEqual([2, 1]);
    expect(result.summaries.get(runKey('bias_tips', 'haiku45'))?.passed).toBe(true);
    expect(result.summaries.has(runKey('bias_tips', 'sonnet55-low'))).toBe(false);
    const choice = chooseForEngine('bias_tips', runs, result.summaries, { judged: true });
    expect(choice.chosen?.name).toBe('haiku45');
  });

  it('con all califica a todos los que pasaron las compuertas en una sola ronda', async () => {
    const runs = [run('haiku55-low', 0.0002, good), run('sonnet55-low', 0.004, good)];
    const result = await judgeMatrix(runs, createSimulatedJudge(), { inputs, all: true });
    expect(result.summaries.size).toBe(2);
    expect(result.details).toHaveLength(2);
  });
});

describe('el juez simulado elige bien con la matriz completa', () => {
  it('un modelo barato que pasa las guardas con textos vagos pierde contra uno que escribe bien', async () => {
    const mock = createMockProvider();
    // Haiku 5.5 contesta consejos de dos palabras que pasan las guardas pero no ayudan a estudiar
    const provider: AiProvider = {
      mode: 'mock',
      async call(call) {
        const reply = await mock.call(call);
        if (call.model.id !== 'claude-haiku-5-5') return reply;
        const raw = reply.raw as { exampleRefs: string[] };
        return { ...reply, raw: { tip: 'Revisa bien.', exampleRefs: raw.exampleRefs } };
      },
    };
    const cases = buildCases();
    const matrix = await runMatrix(
      {
        deps: mockDeps(),
        cases,
        budget: new Budget(Number.POSITIVE_INFINITY),
        providerFor: () => provider,
      },
      { engines: ['bias_tips'], only: null, repeat: 2, limitPerEngine: 4 },
    );
    const inputs = new Map(cases.map((item) => [item.id, item.input as unknown]));
    const judged = await judgeMatrix(matrix.runs, createSimulatedJudge(), { inputs });
    const choice = chooseForEngine('bias_tips', matrix.runs, judged.summaries, { judged: true });
    expect(choice.ranked[0]?.candidate.id).toBe('claude-haiku-5-5');
    expect(choice.ranked[0]?.gate.passed).toBe(true);
    expect(choice.ranked[0]?.judge?.passed).toBe(false);
    expect(choice.chosen?.name).toBe('haiku45');
  });
});
