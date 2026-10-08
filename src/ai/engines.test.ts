import { describe, expect, it } from 'vitest';
import { AI_ENGINES, type AiEngine } from '@/engines/aiContracts';
import { mockHypothesis } from '@/engines/aiMock';
import { callEngine, scrubInput, type CallOptions } from './engines';
import {
  biasTipInput,
  flashcardsInput,
  hypothesisInput,
  restructureInput,
  weeklyReportInput,
} from './testing/aiSamples';

const STUDENT = '01HZX0000000000000000000AA';
const SAMPLES = {
  forgetting: hypothesisInput(),
  weekly_report: weeklyReportInput(),
  flashcards: flashcardsInput(),
  bias_tips: biasTipInput(),
  restructure: restructureInput(),
} as const;

const options = (status: CallOptions['status'], fetchImpl?: typeof fetch): CallOptions => ({
  status,
  studentRef: STUDENT,
  ...(fetchImpl ? { fetchImpl } : {}),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const goodMeta = {
  engine: 'forgetting',
  mode: 'real',
  model: 'claude-haiku-4-5',
  promptVersion: 'forgetting.base.v1',
  inputTokens: 900,
  outputTokens: 120,
  cacheWriteTokens: 0,
  cacheReadTokens: 400,
  estimatedCostUsd: 0.0012,
  latencyMs: 640,
  outcome: 'ok',
  validator: { passed: true, issues: [] },
};

describe('datos personales', () => {
  it('oculta correos, teléfonos y nombres pero deja intactos los IDs', () => {
    const clean = scrubInput(
      {
        ref: 'q-01HZX0000000000000000099',
        text: 'Escribe a ana@correo.com o al 55 1234 5678. Revisó Ana López.',
        nested: [{ text: 'Ana López otra vez' }],
      },
      ['Ana López'],
    );
    expect(clean.ref).toBe('q-01HZX0000000000000000099');
    expect(clean.text).not.toMatch(/ana@|1234|Ana López/);
    expect(clean.text).toContain('[correo]');
    expect(clean.nested[0]?.text).toBe('[nombre] otra vez');
  });

  it('una cifra clínica con decimales no se toma por teléfono', () => {
    expect(scrubInput({ text: 'Glucosa 126 mg/dl y creatinina 1.2' }).text).toBe(
      'Glucosa 126 mg/dl y creatinina 1.2',
    );
  });
});

describe('sin conexión', () => {
  it('dice que necesita conexión y no hace nada', async () => {
    let called = false;
    const result = await callEngine('forgetting', hypothesisInput(), {
      ...options({ kind: 'offline' }),
      fetchImpl: () => {
        called = true;
        return Promise.resolve(json({}));
      },
    });
    expect(result).toMatchObject({ ok: false, reason: 'offline', meta: null });
    expect(called).toBe(false);
  });
});

describe('sin proxy', () => {
  it.each(AI_ENGINES)(
    'el motor %s responde con las respuestas fijas del cliente',
    async (engine) => {
      const result = await callEngine(
        engine,
        SAMPLES[engine] as never,
        options({ kind: 'no-proxy' }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.meta).toMatchObject({
        engine,
        mode: 'template',
        outcome: 'ok',
        inputTokens: 0,
        estimatedCostUsd: 0,
        validator: { passed: true },
      });
    },
  );

  it('mientras todavía no sabe si hay proxy también responde con las fijas', async () => {
    const result = await callEngine('forgetting', hypothesisInput(), options({ kind: 'checking' }));
    expect(result.ok && result.meta.mode).toBe('template');
  });

  it('rechaza una entrada que no cumple el contrato', async () => {
    const result = await callEngine(
      'forgetting',
      { rule: 'chisme' } as never,
      options({ kind: 'no-proxy' }),
    );
    expect(result).toMatchObject({ ok: false, reason: 'invalid_request', meta: null });
  });
});

describe('con proxy', () => {
  const output = mockHypothesis(hypothesisInput());

  it('manda la entrada ya sin datos personales y con el alumno seudónimo', async () => {
    let sent: { url: string; init: RequestInit } | undefined;
    const input = hypothesisInput({
      evidence: [
        { ref: 'q-01', kind: 'question', text: 'Caso de ana@correo.com con neumonía' },
        ...hypothesisInput().evidence.slice(1),
      ],
    });
    const result = await callEngine('forgetting', input, {
      ...options({ kind: 'real' }),
      names: ['Ricardo Moreno'],
      fetchImpl: (url, init) => {
        sent = { url: String(url), init: init ?? {} };
        return Promise.resolve(json({ output: mockHypothesis(input), meta: goodMeta }));
      },
    });
    expect(result.ok).toBe(true);
    expect(sent?.url).toBe('/api/ai/forgetting');
    expect(sent?.init.method).toBe('POST');
    const body = JSON.parse(String(sent?.init.body)) as Record<string, unknown>;
    expect(body.studentRef).toBe(STUDENT);
    expect(body.blockedNames).toEqual(['Ricardo Moreno']);
    expect(JSON.stringify(body.input)).not.toContain('ana@correo.com');
    expect(JSON.stringify(body.input)).toContain('[correo]');
  });

  it('toma de la respuesta el modo, el costo y las guardas', async () => {
    const result = await callEngine('forgetting', hypothesisInput(), {
      ...options({ kind: 'real' }),
      fetchImpl: () => Promise.resolve(json({ output, meta: goodMeta })),
    });
    expect(result.ok && result.meta).toMatchObject({
      mode: 'real',
      model: 'claude-haiku-4-5',
      estimatedCostUsd: 0.0012,
      cacheReadTokens: 400,
      outcome: 'ok',
    });
  });

  it('el modo del proxy simulado queda como simulado', async () => {
    const result = await callEngine('forgetting', hypothesisInput(), {
      ...options({ kind: 'mock' }),
      fetchImpl: () => Promise.resolve(json({ output, meta: { ...goodMeta, mode: 'mock' } })),
    });
    expect(result.ok && result.meta.mode).toBe('mock');
  });

  it('no confía en el proxy. Una salida con evidencia inventada se rechaza', async () => {
    const invented = { ...output, evidence: ['q-99'] };
    const result = await callEngine('forgetting', hypothesisInput(), {
      ...options({ kind: 'real' }),
      fetchImpl: () => Promise.resolve(json({ output: invented, meta: goodMeta })),
    });
    expect(result).toMatchObject({ ok: false, reason: 'bad_response' });
    // Aun así gastó y queda en la bitácora
    expect(!result.ok && result.meta).toMatchObject({ outcome: 'fallback', inputTokens: 900 });
  });

  it('una respuesta que no es del formato esperado se rechaza', async () => {
    for (const body of [{ nada: true }, null, 'texto']) {
      const result = await callEngine('forgetting', hypothesisInput(), {
        ...options({ kind: 'real' }),
        fetchImpl: () => Promise.resolve(json(body)),
      });
      expect(result).toMatchObject({ ok: false, reason: 'bad_response' });
    }
    const notJson = await callEngine('forgetting', hypothesisInput(), {
      ...options({ kind: 'real' }),
      fetchImpl: () => Promise.resolve(new Response('<html>', { status: 200 })),
    });
    expect(notJson).toMatchObject({ ok: false, reason: 'bad_response' });
  });

  it('del error del proxy toma el motivo, el mensaje y lo que costó', async () => {
    const result = await callEngine('forgetting', hypothesisInput(), {
      ...options({ kind: 'real' }),
      fetchImpl: () =>
        Promise.resolve(
          json(
            {
              error: 'invalid_output',
              message: 'La IA no dio una respuesta que se pueda usar. Se usa la versión sin IA.',
              cost: {
                model: 'claude-haiku-4-5',
                inputTokens: 2000,
                outputTokens: 400,
                cacheWriteTokens: 0,
                cacheReadTokens: 0,
                estimatedCostUsd: 0.004,
                latencyMs: 1500,
              },
            },
            502,
          ),
        ),
    });
    expect(result).toMatchObject({
      ok: false,
      reason: 'invalid_output',
      meta: { outcome: 'fallback', inputTokens: 2000, estimatedCostUsd: 0.004, latencyMs: 1500 },
    });
  });

  it('un límite diario llega con su mensaje y sin costo', async () => {
    const result = await callEngine('forgetting', hypothesisInput(), {
      ...options({ kind: 'real' }),
      fetchImpl: () =>
        Promise.resolve(
          json(
            {
              error: 'student_limit',
              message: 'Llegaste al límite de usos de IA de hoy. Vuelve mañana.',
            },
            429,
          ),
        ),
    });
    expect(result).toMatchObject({
      ok: false,
      reason: 'student_limit',
      message: 'Llegaste al límite de usos de IA de hoy. Vuelve mañana.',
      meta: { estimatedCostUsd: 0, mode: 'real' },
    });
  });

  it('un error que no es del formato del proxy se rechaza', async () => {
    const result = await callEngine('forgetting', hypothesisInput(), {
      ...options({ kind: 'real' }),
      fetchImpl: () => Promise.resolve(json({ error: 'otra_cosa' }, 500)),
    });
    expect(result).toMatchObject({ ok: false, reason: 'bad_response' });
  });

  it('una falla de red se trata como falla sin romper nada', async () => {
    const result = await callEngine('forgetting', hypothesisInput(), {
      ...options({ kind: 'real' }),
      fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')),
    });
    expect(result).toMatchObject({ ok: false, reason: 'network' });
  });

  it('de las tarjetas deja solo las ancladas al texto', async () => {
    const input = flashcardsInput();
    const valid = {
      kind: 'basic' as const,
      front: '¿Cuál es el tratamiento inicial de elección en la diabetes mellitus tipo 2?',
      back: 'La metformina',
      quote: 'La metformina es el tratamiento inicial de elección en la diabetes mellitus tipo 2.',
    };
    const invented = {
      ...valid,
      quote: 'La insulina es el tratamiento inicial de elección siempre.',
    };
    const result = await callEngine('flashcards', input, {
      ...options({ kind: 'real' }),
      fetchImpl: () =>
        Promise.resolve(
          json({
            output: { cards: [valid, invented] },
            meta: { ...goodMeta, engine: 'flashcards' },
          }),
        ),
    });
    expect(result.ok && result.output).toEqual({ cards: [valid] });
    expect(result.ok && result.meta.validator.issues).toContain(
      'La cita no aparece tal cual en el texto de origen',
    );
  });
});

describe('cada motor tiene su URL', () => {
  it('pide a /api/ai/<motor>', async () => {
    const urls: string[] = [];
    for (const engine of AI_ENGINES as readonly AiEngine[]) {
      await callEngine(engine, SAMPLES[engine] as never, {
        ...options({ kind: 'real' }),
        fetchImpl: (url) => {
          urls.push(String(url));
          return Promise.reject(new Error('sin red'));
        },
      });
    }
    expect(urls).toEqual(AI_ENGINES.map((engine) => `/api/ai/${engine}`));
  });
});
