import { describe, expect, it, vi } from 'vitest';
import { mockHypothesis } from '@/engines/aiMock';
import type { AiCallMeta, AiJobStatus } from '@/engines/aiContracts';
import { enqueueJob, fetchJobs, hypothesisJobKey, jobKeyOf, resultOfJob } from './jobs';
import { hypothesisInput } from './testing/aiSamples';
import { urlOf } from './testing/fetch';

vi.mock('./endpoint', () => ({
  AI_BASE_URL: 'https://abcd1234.supabase.co/functions/v1/ai-proxy',
  aiAuthHeaders: () => Promise.resolve({ authorization: 'Bearer token-de-prueba' }),
}));

const STUDENT = '01HZX0000000000000000000AA';
const KEY = 'fgt_0123456789abcdef0123456789abcdef';
const meta: AiCallMeta = {
  engine: 'forgetting',
  mode: 'real',
  model: 'claude-haiku-5-5',
  promptVersion: 'forgetting.base.v1',
  inputTokens: 1700,
  outputTokens: 400,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  estimatedCostUsd: 0.00017,
  latencyMs: 0,
  outcome: 'ok',
  validator: { passed: true, issues: [] },
};

const job = (overrides: Partial<AiJobStatus> = {}): AiJobStatus => ({
  jobKey: KEY,
  engine: 'forgetting',
  status: 'queued',
  queuedAt: '2026-10-15T15:00:00.000Z',
  readyAt: null,
  ...overrides,
});

const answer = (body: unknown, status = 200) =>
  vi.fn(() => Promise.resolve(Response.json(body, { status }))) as unknown as typeof fetch;

describe('llave del trabajo', () => {
  it('es fgt_ y 32 caracteres hexadecimales del SHA-256 de la regla y el área, sin texto', async () => {
    const key = await hypothesisJobKey('interference', 'cardiologia');
    expect(key).toMatch(/^fgt_[0-9a-f]{32}$/);
    // Lo mismo para la misma regla y área, y otra cosa si cambia una
    expect(await hypothesisJobKey('interference', 'cardiologia')).toBe(key);
    expect(await hypothesisJobKey('interference', 'nefrologia')).not.toBe(key);
    expect(await hypothesisJobKey('list_card', 'cardiologia')).not.toBe(key);
    expect(key).not.toContain('cardiologia');
  });

  it('la regla del contrato JobKeySchema la acepta', async () => {
    const { JobKeySchema } = await import('@/engines/aiContracts');
    expect(JobKeySchema.safeParse(await jobKeyOf('forgetting', ['a', 'b'])).success).toBe(true);
    expect(await jobKeyOf('restructure', ['a'])).toMatch(/^rst_[0-9a-f]{32}$/);
  });
});

describe('encolar', () => {
  const options = { status: { kind: 'real' } as const, studentRef: STUDENT, names: ['Ana López'] };

  it('manda el trabajo a /ai/jobs/forgetting con la sesión, el alumno seudónimo y la llave', async () => {
    const fetchImpl = answer(job());
    const input = hypothesisInput({
      evidence: [
        { ref: 'q-01', kind: 'question', text: 'Caso de ana@correo.com con neumonía' },
        ...hypothesisInput().evidence.slice(1),
      ],
    });
    const result = await enqueueJob('forgetting', KEY, input, { ...options, fetchImpl });
    expect(result).toEqual({ ok: true, job: job() });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(urlOf(url)).toBe(
      'https://abcd1234.supabase.co/functions/v1/ai-proxy/ai/jobs/forgetting',
    );
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-de-prueba');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ studentRef: STUDENT, jobKey: KEY, blockedNames: ['Ana López'] });
    expect(JSON.stringify(body.input)).not.toContain('ana@correo.com');
  });

  it('un trabajo ya listo llega ya terminado', async () => {
    const ready = job({
      status: 'ready',
      output: mockHypothesis(hypothesisInput()),
      meta,
      readyAt: '2026-10-15T16:00:00.000Z',
    });
    expect(
      await enqueueJob('forgetting', KEY, hypothesisInput(), {
        ...options,
        fetchImpl: answer(ready),
      }),
    ).toEqual({ ok: true, job: ready });
  });

  it('del error del servidor toma el motivo y el mensaje', async () => {
    const result = await enqueueJob('forgetting', KEY, hypothesisInput(), {
      ...options,
      fetchImpl: answer({ error: 'gate_closed', message: 'Todavía no.' }, 403),
    });
    expect(result).toEqual({ ok: false, reason: 'gate_closed', message: 'Todavía no.' });
  });

  it('rechaza una entrada que no cumple el contrato sin llamar a nadie', async () => {
    const fetchImpl = answer(job());
    const result = await enqueueJob('forgetting', KEY, { rule: 'chisme' } as never, {
      ...options,
      fetchImpl,
    });
    expect(result).toMatchObject({ ok: false, reason: 'invalid_request' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('una respuesta de otro trabajo, rara o sin red, se rechaza', async () => {
    for (const body of [
      job({ jobKey: 'fgt_ffffffffffffffffffffffffffffffff' }),
      { nada: 1 },
      null,
    ]) {
      expect(
        await enqueueJob('forgetting', KEY, hypothesisInput(), {
          ...options,
          fetchImpl: answer(body),
        }),
      ).toMatchObject({ ok: false, reason: 'bad_response' });
    }
    const down = vi.fn(() => Promise.reject(new TypeError('sin red'))) as unknown as typeof fetch;
    expect(
      await enqueueJob('forgetting', KEY, hypothesisInput(), { ...options, fetchImpl: down }),
    ).toMatchObject({ ok: false, reason: 'network' });
    expect(
      await enqueueJob('forgetting', KEY, hypothesisInput(), {
        ...options,
        fetchImpl: answer({ error: 'otra_cosa' }, 500),
      }),
    ).toMatchObject({ ok: false, reason: 'bad_response' });
  });
});

describe('preguntar por los trabajos', () => {
  it('manda las llaves a /ai/jobs/status y devuelve los trabajos', async () => {
    const fetchImpl = answer({ jobs: [job({ status: 'running' })] });
    const result = await fetchJobs([KEY], { fetchImpl });
    expect(result).toEqual({ ok: true, jobs: [job({ status: 'running' })] });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(urlOf(url)).toBe('https://abcd1234.supabase.co/functions/v1/ai-proxy/ai/jobs/status');
    expect(JSON.parse(init.body as string)).toEqual({ jobKeys: [KEY] });
  });

  it('parte las llaves de 20 en 20', async () => {
    const keys = Array.from(
      { length: 45 },
      (_, index) => `fgt_${index.toString(16).padStart(32, '0')}`,
    );
    const fetchImpl = answer({ jobs: [] });
    await fetchJobs(keys, { fetchImpl });
    const sizes = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
      ([, init]) =>
        (JSON.parse((init as RequestInit).body as string) as { jobKeys: string[] }).jobKeys.length,
    );
    expect(sizes).toEqual([20, 20, 5]);
  });

  it('con el motor cerrado o sin plan, lo dice, y con una respuesta rara, falla', async () => {
    expect(
      await fetchJobs([KEY], {
        fetchImpl: answer({ error: 'plan_required', message: 'La IA es de pago.' }, 403),
      }),
    ).toEqual({ ok: false, reason: 'plan_required', message: 'La IA es de pago.' });
    expect(await fetchJobs([KEY], { fetchImpl: answer({ jobs: 'x' }) })).toMatchObject({
      ok: false,
      reason: 'bad_response',
    });
  });
});

describe('resultado de un trabajo', () => {
  const input = hypothesisInput();

  it('en cola o en curso, sigue esperando', () => {
    expect(resultOfJob('forgetting', job(), input)).toEqual({ state: 'waiting' });
    expect(resultOfJob('forgetting', job({ status: 'running' }), input)).toEqual({
      state: 'waiting',
    });
  });

  it('uno listo se vuelve a validar con la entrada que mandó la app', () => {
    const ready = job({ status: 'ready', output: mockHypothesis(input), meta });
    const result = resultOfJob('forgetting', ready, input);
    expect(result).toMatchObject({ state: 'ready', meta: { model: 'claude-haiku-5-5' } });
  });

  it('una salida con evidencia inventada no pasa, aunque el servidor diga listo', () => {
    const invented = { ...mockHypothesis(input), evidence: ['q-99'] };
    expect(
      resultOfJob('forgetting', job({ status: 'ready', output: invented, meta }), input),
    ).toEqual(expect.objectContaining({ state: 'failed', reason: 'bad_response' }));
    expect(resultOfJob('forgetting', job({ status: 'ready', meta }), input)).toMatchObject({
      state: 'failed',
      reason: 'bad_response',
    });
    expect(
      resultOfJob('forgetting', job({ status: 'ready', output: mockHypothesis(input) }), input),
    ).toMatchObject({ state: 'failed', reason: 'bad_response' });
  });

  it('uno fallido trae su motivo y su mensaje', () => {
    expect(
      resultOfJob(
        'forgetting',
        job({ status: 'failed', error: 'refused', message: 'La IA no atendió esta petición.' }),
        input,
      ),
    ).toEqual({ state: 'failed', reason: 'refused', message: 'La IA no atendió esta petición.' });
    expect(resultOfJob('forgetting', job({ status: 'failed' }), input)).toMatchObject({
      state: 'failed',
      reason: 'provider_error',
    });
  });
});
