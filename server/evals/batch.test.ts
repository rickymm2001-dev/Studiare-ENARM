import { describe, expect, it } from 'vitest';
import { mockOutput } from '../../src/engines/aiMock.ts';
import { createAnthropicProvider } from '../../supabase/functions/_shared/ai/provider.ts';
import type { RunDeps } from '../../supabase/functions/_shared/ai/run.ts';
import { fakeApi, fakeMessage } from '../../supabase/functions/_shared/ai/testing/fakes.ts';
import { createAiDeps } from '../src/ai/index.ts';
import { runBatchEvaluation, simulatedReply } from './batch.ts';
import { Budget } from './budget.ts';
import { buildCases, type GoldenCase } from './cases.ts';
import { createFakeBatchApi, errored, expired, succeeded } from './fakeBatch.ts';
import { evaluateCase } from './run.ts';

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

const forgetting = buildCases()
  .filter((golden) => golden.engine === 'forgetting' && golden.expect === 'answer')
  .slice(0, 3);
const noSleep = () => Promise.resolve();
const answerFor = (golden: GoldenCase) =>
  JSON.stringify(mockOutput('forgetting', golden.input as never));

describe('camino por lotes', () => {
  it('manda los casos en un lote con la misma petición del camino al momento y lo borra', async () => {
    const api = createFakeBatchApi({ respond: simulatedReply('forgetting'), pollsUntilEnded: 2 });
    const budget = new Budget(1);
    const result = await runBatchEvaluation({
      deps: deps(),
      cases: forgetting,
      api,
      budget,
      sleep: noSleep,
    });
    expect(result.results.map((item) => item.passed)).toEqual([true, true, true]);
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0]).toMatchObject({ requests: 3, canceled: false, deleted: true });
    expect(api.deleted).toEqual(['msgbatch_fake_1']);
    expect(api.created[0]?.map((request) => request.custom_id)).toEqual([
      'r1_c0',
      'r1_c1',
      'r1_c2',
    ]);
    // La petición del lote es la del camino al momento
    const first = forgetting[0];
    if (!first) throw new Error('Falta el caso');
    const sync = fakeApi([fakeMessage(answerFor(first))]);
    await evaluateCase(
      {
        ...deps(),
        provider: createAnthropicProvider(sync, () => deps().config.limits),
      },
      first,
    );
    // Lo que viaja es el JSON, así que se comparan como JSON
    const wire = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;
    expect(wire(api.created[0]?.[0]?.params)).toEqual(wire(sync.calls[0]?.params));
    // Cuesta la mitad y queda asentado en el tope
    expect(result.costUsd).toBeGreaterThan(0);
    expect(budget.spentUsd).toBeCloseTo(result.costUsd, 6);
  });

  it('una respuesta que no pasa vuelve en un segundo lote con lo que falló', async () => {
    const first = forgetting[0];
    if (!first) throw new Error('Falta el caso');
    const invented = JSON.stringify({
      ...mockOutput('forgetting', first.input as never),
      evidence: ['ev-inventada'],
    });
    const api = createFakeBatchApi({
      respond: (request) =>
        request.custom_id.startsWith('r1_')
          ? succeeded(fakeMessage(invented))
          : succeeded(fakeMessage(answerFor(first))),
    });
    const result = await runBatchEvaluation({
      deps: deps(),
      cases: [first],
      api,
      budget: new Budget(1),
      sleep: noSleep,
    });
    expect(result.rounds).toHaveLength(2);
    expect(result.results[0]).toMatchObject({ passed: true, retried: true, schemaValid: true });
    const retry = api.created[1]?.[0]?.params.messages[0]?.content;
    expect(JSON.stringify(retry)).toContain('Tu respuesta anterior no cumplió estas reglas');
    expect(api.deleted).toEqual(['msgbatch_fake_1', 'msgbatch_fake_2']);
  });

  it('errored, expired y una negativa quedan como fallas y se cuentan', async () => {
    const replies = [
      errored('api_error'),
      expired(),
      succeeded(fakeMessage(null, { stop: 'refusal' })),
    ];
    const api = createFakeBatchApi({
      respond: (request) => replies[Number(request.custom_id.slice(4))] ?? expired(),
    });
    const result = await runBatchEvaluation({
      deps: deps(),
      cases: forgetting,
      api,
      budget: new Budget(1),
      sleep: noSleep,
    });
    expect(result.failures).toEqual({ errored: 1, expired: 1 });
    expect(result.results.map((item) => [item.passed, item.error, item.refused])).toEqual([
      [false, 'provider_error', false],
      [false, 'provider_error', false],
      [false, 'provider_error', true],
    ]);
  });

  it('sin lugar en el tope no crea ningún lote', async () => {
    const api = createFakeBatchApi({ respond: simulatedReply('forgetting') });
    const result = await runBatchEvaluation({
      deps: deps(),
      cases: forgetting,
      api,
      budget: new Budget(0.0000001),
      sleep: noSleep,
    });
    expect(api.created).toEqual([]);
    expect(result).toMatchObject({ stoppedByBudget: true, results: [] });
  });

  it('cancela un lote que pasa de una hora', async () => {
    let now = 0;
    const api = createFakeBatchApi({
      respond: simulatedReply('forgetting'),
      pollsUntilEnded: 10_000,
    });
    const result = await runBatchEvaluation({
      deps: deps(),
      cases: forgetting.slice(0, 1),
      api,
      budget: new Budget(1),
      clock: () => now,
      sleep: (ms) => {
        now += ms;
        return Promise.resolve();
      },
    });
    expect(api.canceled).toEqual(['msgbatch_fake_1']);
    expect(result.rounds[0]?.canceled).toBe(true);
    expect(result.failures).toEqual({ canceled: 1 });
  });
});
