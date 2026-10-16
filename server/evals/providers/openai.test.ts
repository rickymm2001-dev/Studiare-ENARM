import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FlashcardsOutputSchema,
  HypothesisOutputSchema,
} from '../../../src/engines/aiContracts.ts';
import { mockOutput } from '../../../src/engines/aiMock.ts';
import type { RunDeps } from '../../../supabase/functions/_shared/ai/run.ts';
import { createAiDeps } from '../../src/ai/index.ts';
import { newProbe } from '../budget.ts';
import { buildCases } from '../cases.ts';
import { priceOf, resolveOpenAiModels, type OpenAiModel } from '../openaiModels.ts';
import { evaluateCase } from '../run.ts';
import { createOpenAiProvider, OPENAI_RESPONSES_URL, toStrictJsonSchema } from './openai.ts';

const MODEL: OpenAiModel = {
  id: 'modelo-barato-de-prueba',
  tier: 'cheap',
  price: { input: 0.2, output: 0.8, cachedInput: 0.02 },
  reasoningEffort: 'low',
  source: 'https://example.invalid/precios',
  checkedAt: '2026-10-15',
};
const KEY = 'clave-de-prueba-openai';

interface Sent {
  url: string;
  init: RequestInit;
}

function fakeFetch(reply: (sent: Sent) => Response | Promise<Response>) {
  const sent: Sent[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const entry = {
      url: typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
      init: init ?? {},
    };
    sent.push(entry);
    return reply(entry);
  }) as typeof fetch;
  return { fetcher, sent };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const completed = (text: string, usage = { input: 1200, cached: 200, output: 300 }) => ({
  id: 'resp_1',
  object: 'response',
  model: MODEL.id,
  status: 'completed',
  incomplete_details: null,
  output: [
    { type: 'reasoning', summary: [] },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
  ],
  usage: {
    input_tokens: usage.input,
    input_tokens_details: { cached_tokens: usage.cached },
    output_tokens: usage.output,
    output_tokens_details: { reasoning_tokens: 100 },
    total_tokens: usage.input + usage.output,
  },
});

function deps(): RunDeps {
  const ai = createAiDeps({
    credentials: { mode: 'mock', apiKey: null },
    files: { config: null, ledger: null },
  });
  const config = ai.config();
  return {
    provider: ai.provider,
    prompts: ai.prompts,
    sourceKeys: ai.sourceKeys,
    config: {
      ...config,
      prices: { ...config.prices, [MODEL.id]: priceOf(MODEL) },
      models: {
        ...config.models,
        flashcards: { id: MODEL.id, effort: null, thinking: null, maxTokens: 4000 },
      },
    },
  };
}

describe('esquema estricto de OpenAI', () => {
  it('pide todo, vuelve null lo opcional, cierra los objetos y quita la validación', () => {
    const schema = toStrictJsonSchema(FlashcardsOutputSchema);
    const card = (schema.properties as Record<string, { items: Record<string, unknown> }>).cards
      ?.items;
    expect(card?.required).toEqual(['kind', 'front', 'back', 'quote', 'controversy']);
    expect(card?.additionalProperties).toBe(false);
    const controversy = (card?.properties as Record<string, { anyOf?: unknown[] }>).controversy;
    expect(controversy?.anyOf).toContainEqual({ type: 'null' });
    const text = JSON.stringify(schema);
    for (const keyword of ['maxLength', 'minLength', 'maxItems', '"maximum"', '$schema']) {
      expect(text).not.toContain(keyword);
    }
    const locator = JSON.stringify(controversy);
    expect(locator).toContain('"locator"');
    // Una hipótesis nula sigue siendo válida
    expect(toStrictJsonSchema(HypothesisOutputSchema).required).toEqual([
      'hypothesis',
      'evidence',
      'confidence',
      'actions',
      'studentMessage',
    ]);
  });
});

describe('proveedor de OpenAI', () => {
  const golden = buildCases().find((item) => item.engine === 'flashcards');
  if (!golden) throw new Error('Falta el caso');
  const answer = JSON.stringify(mockOutput('flashcards', golden.input as never));

  it('manda la Responses API con salida estricta y pasa por las mismas guardas', async () => {
    const { fetcher, sent } = fakeFetch(() => json(completed(answer)));
    const probe = newProbe();
    const provider = createOpenAiProvider({
      apiKey: KEY,
      models: [MODEL],
      timeoutMs: 1000,
      probe,
      fetch: fetcher,
    });
    const result = await evaluateCase({ ...deps(), provider }, golden, { probe });
    expect(result).toMatchObject({ accepted: true, passed: true, schemaValid: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(OPENAI_RESPONSES_URL);
    expect(new Headers(sent[0]?.init.headers).get('authorization')).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(sent[0]?.init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: MODEL.id,
      max_output_tokens: 4000,
      store: false,
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_schema', name: 'flashcards_output', strict: true } },
    });
    expect(typeof body.instructions).toBe('string');
    expect(String(body.input)).toContain('<datos>');
    // 1,000 sin caché a 0.2, 200 de caché a 0.02 y 300 de salida a 0.8 por millón
    expect(probe.calls[0]).toMatchObject({ stopReason: 'end_turn', refusalCategory: null });
    expect(result.costUsd).toBeCloseTo((1000 * 0.2 + 200 * 0.02 + 300 * 0.8) / 1e6, 8);
  });

  it('una negativa y un filtro de contenido cuentan como negativa', async () => {
    for (const reply of [
      {
        ...completed(''),
        output: [
          { type: 'message', content: [{ type: 'refusal', refusal: 'No puedo ayudar con eso' }] },
        ],
      },
      {
        ...completed(''),
        status: 'incomplete',
        incomplete_details: { reason: 'content_filter' },
        output: [],
      },
    ]) {
      const probe = newProbe();
      const provider = createOpenAiProvider({
        apiKey: KEY,
        models: [MODEL],
        timeoutMs: 1000,
        probe,
        fetch: fakeFetch(() => json(reply)).fetcher,
      });
      const result = await evaluateCase({ ...deps(), provider }, golden, { probe });
      expect(result).toMatchObject({ refused: true, passed: false });
    }
  });

  it('un corte por max_output_tokens se reintenta y se cuenta', async () => {
    const probe = newProbe();
    const cut = {
      ...completed('{"cards":['),
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
    };
    const provider = createOpenAiProvider({
      apiKey: KEY,
      models: [MODEL],
      timeoutMs: 1000,
      probe,
      fetch: fakeFetch(() => json(cut)).fetcher,
    });
    const result = await evaluateCase({ ...deps(), provider }, golden, { probe });
    expect(result).toMatchObject({ cutoff: true, retried: true, passed: false });
    expect(probe.calls).toHaveLength(2);
  });

  it('los errores son propios, sin el texto de la API ni la clave', async () => {
    const cases: [Response | Error, string][] = [
      [json({ error: { message: `mala clave ${KEY}` } }, 401), 'provider_error'],
      [json({ error: { message: 'despacio' } }, 429), 'rate_limited'],
      [json({ error: { message: 'falla' } }, 500), 'provider_error'],
      [new Error('sin red'), 'provider_error'],
      [new Response('no es json', { status: 200 }), 'provider_error'],
    ];
    for (const [reply, error] of cases) {
      const provider = createOpenAiProvider({
        apiKey: KEY,
        models: [MODEL],
        timeoutMs: 1000,
        fetch: fakeFetch(() => {
          if (reply instanceof Error) throw reply;
          return reply;
        }).fetcher,
      });
      const outcome = await provider
        .call({
          engine: 'flashcards',
          model: { id: MODEL.id, effort: null, thinking: null, maxTokens: 500 },
          system: 's',
          user: 'u',
          input: golden.input,
          schema: FlashcardsOutputSchema,
        })
        .then(
          () => null,
          (thrown: unknown) => thrown as { kind: string; message: string },
        );
      expect(outcome?.kind).toBe(error);
      expect(outcome?.message).not.toContain(KEY);
      expect(outcome?.message).not.toContain('mala clave');
    }
  });

  it('un modelo fuera de la tabla no sale', async () => {
    const { fetcher, sent } = fakeFetch(() => json(completed(answer)));
    const provider = createOpenAiProvider({
      apiKey: KEY,
      models: [MODEL],
      timeoutMs: 1000,
      fetch: fetcher,
    });
    await expect(
      provider.call({
        engine: 'flashcards',
        model: { id: 'otro', effort: null, thinking: null, maxTokens: 500 },
        system: 's',
        user: 'u',
        input: golden.input,
        schema: FlashcardsOutputSchema,
      }),
    ).rejects.toThrow('no está en la tabla');
    expect(sent).toEqual([]);
  });
});

describe('tabla de modelos de OpenAI', () => {
  it('pide modelos con precio, fecha y fuente', () => {
    expect(() => resolveOpenAiModels([], [MODEL])).toThrow('--models');
    expect(() => resolveOpenAiModels(['otro'], [MODEL])).toThrow('no está en server/evals');
    expect(() => resolveOpenAiModels([MODEL.id], [{ ...MODEL, checkedAt: 'hoy' }])).toThrow(
      'fecha o fuente',
    );
    expect(resolveOpenAiModels([MODEL.id], [MODEL])).toEqual([MODEL]);
    expect(priceOf(MODEL)).toEqual({ input: 0.2, output: 0.8, cacheWrite: 0.2, cacheRead: 0.02 });
  });
});

describe('OpenAI solo vive en las evaluaciones', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const files = (dir: string): string[] =>
    readdirSync(join(root, dir)).flatMap((name) => {
      const path = join(dir, name);
      return statSync(join(root, path)).isDirectory()
        ? files(path)
        : /\.(ts|tsx|js|json|sql)$/.test(name)
          ? [path]
          : [];
    });

  it('ni la app, ni el proxy, ni las funciones mencionan su clave, su API o este proveedor', () => {
    const needles = ['ENARM_OPENAI_KEY', 'api.openai.com', 'evals/providers'];
    const offenders = ['src', 'server/src', 'supabase/functions'].flatMap((dir) =>
      files(dir).filter((file) => {
        const text = readFileSync(join(root, file), 'utf8');
        return needles.some((needle) => text.includes(needle));
      }),
    );
    expect(offenders.map((file) => relative('.', file))).toEqual([]);
  });
});
