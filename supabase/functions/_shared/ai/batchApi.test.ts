import { APIError } from '@anthropic-ai/sdk';
import type { MessageBatch } from '@anthropic-ai/sdk/resources/messages';
import { describe, expect, it } from 'vitest';
import {
  biasTipInput,
  flashcardsInput,
  hypothesisInput,
  restructureInput,
  weeklyReportInput,
} from '../../../../src/ai/testing/aiSamples.ts';
import {
  createSdkBatchApi,
  mockBatchResolver,
  SimulatedBatchApi,
  type BatchesClient,
} from './batchApi.ts';
import { AI_ENGINES, ENGINE_CONTRACTS, type AiEngine } from './engines/aiContracts.ts';
import { MOCK_MODEL, mockOutput } from './engines/aiMock.ts';
import type { BatchRequest } from './ports.ts';
import { buildUserMessage, bundledPromptSets, inputFromUserMessage } from './prompts.ts';

const prompts = bundledPromptSets();
const SAMPLES = {
  forgetting: hypothesisInput(),
  weekly_report: weeklyReportInput(),
  flashcards: flashcardsInput(),
  bias_tips: biasTipInput(),
  restructure: restructureInput(),
} as const;

const requestFor = (
  engine: AiEngine,
  customId: string,
  input: unknown = SAMPLES[engine],
): BatchRequest => ({
  custom_id: customId,
  params: {
    model: 'claude-haiku-5-5',
    max_tokens: 4000,
    system: [{ type: 'text', text: prompts[engine].text, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildUserMessage(input, ['un problema anterior']) }],
  },
});

describe('la entrada viaja en el mensaje y se puede leer de vuelta', () => {
  it('también con signos de menor que, que se escapan en el mensaje', () => {
    const input = { text: 'TA < 90 y </datos> dentro', n: 3 };
    expect(inputFromUserMessage(buildUserMessage(input))).toEqual(input);
    expect(inputFromUserMessage('sin datos')).toBeUndefined();
    expect(inputFromUserMessage('<datos>\nno es json\n</datos>')).toBeUndefined();
  });
});

describe('lote simulado', () => {
  it('contesta cada motor con su respuesta fija, que cumple su esquema', () => {
    const resolve = mockBatchResolver(prompts);
    for (const engine of AI_ENGINES) {
      const result = resolve(requestFor(engine, `id-${engine}`));
      expect(result.type, engine).toBe('succeeded');
      if (result.type !== 'succeeded') continue;
      const block = result.message.content[0];
      const text = block?.type === 'text' ? block.text : '';
      const output = JSON.parse(text) as unknown;
      expect(output).toEqual(mockOutput(engine, SAMPLES[engine] as never));
      expect(ENGINE_CONTRACTS[engine].output.safeParse(output).success, engine).toBe(true);
      expect(result.message.model).toBe(MOCK_MODEL);
      expect(result.message.usage.input_tokens).toBeGreaterThan(0);
    }
  });

  it('una petición que no reconoce sale como invalid_request', () => {
    const request = requestFor('forgetting', 'x');
    const result = mockBatchResolver(prompts)({
      ...request,
      params: { ...request.params, system: 'otro prompt' },
    });
    expect(result).toMatchObject({
      type: 'errored',
      error: { error: { type: 'invalid_request_error' } },
    });
  });

  it('termina en el siguiente ciclo, entrega por custom_id y se borra', async () => {
    const api = new SimulatedBatchApi({ resolve: mockBatchResolver(prompts) });
    const batch = await api.create([
      requestFor('forgetting', 'job-1'),
      requestFor('restructure', 'job-2'),
    ]);
    expect(batch.processing_status).toBe('in_progress');
    expect((await api.retrieve(batch.id)).processing_status).toBe('in_progress');
    const ended = await api.retrieve(batch.id);
    expect(ended).toMatchObject({
      processing_status: 'ended',
      request_counts: { succeeded: 2, processing: 0 },
    });
    const ids: string[] = [];
    for await (const line of await api.results(batch.id)) ids.push(line.custom_id);
    expect(ids.sort()).toEqual(['job-1', 'job-2']);
    expect((await api.recent(5)).map((item) => item.id)).toEqual([batch.id]);
    await api.delete(batch.id);
    expect(api.deleted).toEqual([batch.id]);
    await expect(api.retrieve(batch.id)).rejects.toThrow();
  });

  it('con unknownAsEnded, un lote de otra copia termina sin resultados', async () => {
    const api = new SimulatedBatchApi({
      resolve: mockBatchResolver(prompts),
      unknownAsEnded: true,
    });
    expect((await api.retrieve('msgbatch_de_otra_copia')).processing_status).toBe('ended');
    const lines: unknown[] = [];
    for await (const line of await api.results('msgbatch_de_otra_copia')) lines.push(line);
    expect(lines).toEqual([]);
  });

  it('end() fija resultados y el resto sale de resolve', async () => {
    const api = new SimulatedBatchApi({
      resolve: mockBatchResolver(prompts),
      retrievesBeforeEnd: Number.POSITIVE_INFINITY,
    });
    const batch = await api.create([requestFor('forgetting', 'a'), requestFor('forgetting', 'b')]);
    expect((await api.retrieve(batch.id)).processing_status).toBe('in_progress');
    api.end(batch.id, { a: { type: 'expired' } });
    const types: Record<string, string> = {};
    for await (const line of await api.results(batch.id)) types[line.custom_id] = line.result.type;
    expect(types).toEqual({ a: 'expired', b: 'succeeded' });
  });
});

describe('adaptador del SDK', () => {
  const batch = (id: string) => ({ id }) as MessageBatch;
  function client(overrides: Partial<BatchesClient> = {}) {
    const calls: unknown[] = [];
    const fake: BatchesClient = {
      create: (params, options) => {
        calls.push({ params, options });
        return Promise.resolve(batch('msgbatch_1'));
      },
      retrieve: (id) => Promise.resolve(batch(id)),
      results: () => Promise.reject(new Error('no se usa')),
      cancel: (id) => Promise.resolve(batch(id)),
      delete: () => Promise.resolve({}),
      list: async function* () {
        for (const id of ['msgbatch_3', 'msgbatch_2', 'msgbatch_1'])
          yield await Promise.resolve(batch(id));
      },
      ...overrides,
    };
    return { fake, calls };
  }

  it('crea el lote con sus peticiones, un tiempo de espera y un reintento', async () => {
    const { fake, calls } = client();
    await createSdkBatchApi(fake).create([requestFor('forgetting', 'job-1')]);
    expect(calls).toEqual([
      {
        params: { requests: [requestFor('forgetting', 'job-1')] },
        options: { timeout: 60_000, maxRetries: 1 },
      },
    ]);
  });

  it('los recientes se cortan en el límite', async () => {
    const { fake } = client();
    expect((await createSdkBatchApi(fake).recent(2)).map((item) => item.id)).toEqual([
      'msgbatch_3',
      'msgbatch_2',
    ]);
  });

  it('borrar uno que ya no existe no es error, y otro error sí', async () => {
    const notFound = APIError.generate(
      404,
      { type: 'error', error: { type: 'not_found_error', message: 'x' } },
      undefined,
      new Headers(),
    );
    const gone = client({ delete: () => Promise.reject(notFound) });
    await expect(createSdkBatchApi(gone.fake).delete('msgbatch_1')).resolves.toBeUndefined();
    const broken = client({ delete: () => Promise.reject(new Error('caído')) });
    await expect(createSdkBatchApi(broken.fake).delete('msgbatch_1')).rejects.toThrow('caído');
  });
});
