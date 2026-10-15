import { describe, expect, it, vi } from 'vitest';
import {
  biasTipInput,
  flashcardsInput,
  hypothesisInput,
  restructureInput,
  weeklyReportInput,
} from '../../ai/testing/aiSamples';
import { mockOutput } from '../../engines/aiMock';
import type { AiGateReview, AiGateSampleFile } from '../../engines/aiContracts';
import {
  closeSample,
  createSample,
  fetchGateState,
  fetchMyItems,
  fetchMySamples,
  fetchProgress,
  listSamples,
  reviewItem,
  setEngineOpen,
  setPaused,
} from './aiGate';

const rpcReply = (reply: {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}) => {
  const rpc = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve({ data: reply.data ?? null, error: reply.error ?? null }),
    );
  return { cloud: { rpc } as never, rpc };
};

const REVIEW: AiGateReview = {
  accuracy: 'correct',
  grounded: true,
  safetyIssue: false,
  usefulness: 4,
  clarity: 3,
  verdict: 'approved',
  comment: null,
};
const ID = '5c7e0c3e-2f6a-4b1a-8d8e-0a1b2c3d4e5f';

describe('la bandera ai_gate', () => {
  const settings = (reply: { data: unknown; error: { code?: string } | null }) => {
    const maybeSingle = vi.fn(() => Promise.resolve(reply));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    return { cloud: { from: vi.fn(() => ({ select })) } as never, eq };
  };

  it('lee la bandera de platform_settings', async () => {
    const state = {
      paused: false,
      engines: {
        bias_tips: {
          open: true,
          model: 'claude-haiku-5-5',
          effort: 'low',
          thinking: 'adaptive',
          promptVersion: 'bias_tips.base.v1',
          promptHash: 'a'.repeat(64),
          sampleId: 'b12-2026-10',
          at: '2026-10-20T10:00:00.000Z',
        },
      },
    };
    const { cloud, eq } = settings({ data: { value: state }, error: null });
    expect(await fetchGateState(cloud)).toEqual({ ok: true, value: state });
    expect(eq).toHaveBeenCalledWith('key', 'ai_gate');
  });

  it('sin fila, o con otro formato, todo cuenta cerrado', async () => {
    const closed = { paused: false, engines: {} };
    expect(await fetchGateState(settings({ data: null, error: null }).cloud)).toEqual({
      ok: true,
      value: closed,
    });
    expect(
      await fetchGateState(settings({ data: { value: { paused: 'sí' } }, error: null }).cloud),
    ).toEqual({ ok: true, value: closed });
  });

  it('si no se pudo leer lo dice', async () => {
    expect(await fetchGateState(settings({ data: null, error: {} }).cloud)).toMatchObject({
      ok: false,
      reason: 'network',
    });
    const throwing = {
      from: () => {
        throw new Error('x');
      },
    } as never;
    expect(await fetchGateState(throwing)).toMatchObject({ ok: false, reason: 'network' });
  });
});

describe('el médico', () => {
  it('lee sus muestras abiertas', async () => {
    const data = [{ sampleId: 'b12-2026-10', status: 'open', createdAt: '2026-10-20T10:00:00Z' }];
    const { cloud, rpc } = rpcReply({ data });
    expect(await fetchMySamples(cloud)).toEqual({ ok: true, value: data });
    expect(rpc).toHaveBeenCalledWith('ai_gate_my_samples', {});
  });

  it('lee sus textos de cada motor, con la fuente y lo que vería el alumno', async () => {
    const data = {
      sampleId: 'b12-2026-10',
      status: 'open',
      total: 5,
      reviewed: 1,
      items: [
        {
          id: ID,
          engine: 'forgetting',
          sourceKind: 'demo',
          input: hypothesisInput(),
          output: mockOutput('forgetting', hypothesisInput()),
          review: REVIEW,
        },
        {
          id: ID.replace('5c7e', '6c7e'),
          engine: 'weekly_report',
          sourceKind: 'synthetic',
          input: weeklyReportInput(),
          output: mockOutput('weekly_report', weeklyReportInput()),
          review: null,
        },
        {
          id: ID.replace('5c7e', '7c7e'),
          engine: 'flashcards',
          sourceKind: 'team',
          input: flashcardsInput(),
          output: mockOutput('flashcards', flashcardsInput()),
          review: null,
        },
        {
          id: ID.replace('5c7e', '8c7e'),
          engine: 'bias_tips',
          sourceKind: 'bank',
          input: biasTipInput(),
          output: mockOutput('bias_tips', biasTipInput()),
          review: null,
        },
        {
          id: ID.replace('5c7e', '9c7e'),
          engine: 'restructure',
          sourceKind: 'demo',
          input: restructureInput(),
          output: mockOutput('restructure', restructureInput()),
          review: null,
        },
      ],
    };
    const { cloud, rpc } = rpcReply({ data });
    const result = await fetchMyItems(cloud, 'b12-2026-10');
    expect(rpc).toHaveBeenCalledWith('ai_gate_my_items', { p_sample: 'b12-2026-10' });
    expect(result.ok && result.value.items.map((item) => item.engine)).toEqual([
      'forgetting',
      'weekly_report',
      'flashcards',
      'bias_tips',
      'restructure',
    ]);
    expect(result.ok && result.value.items[0]?.review).toEqual(REVIEW);
  });

  it('un texto cuya salida no cumple el contrato de su motor se rechaza', async () => {
    const data = {
      sampleId: 'b12-2026-10',
      status: 'open',
      total: 1,
      reviewed: 0,
      items: [
        {
          id: ID,
          engine: 'bias_tips',
          sourceKind: 'bank',
          input: biasTipInput(),
          output: { tip: 5 },
          review: null,
        },
      ],
    };
    expect(await fetchMyItems(rpcReply({ data }).cloud, 'x')).toMatchObject({
      ok: false,
      reason: 'unknown',
    });
  });

  it('guarda la rúbrica con las llaves exactas del contrato', async () => {
    const { cloud, rpc } = rpcReply({});
    expect(await reviewItem(cloud, ID, { ...REVIEW, comment: 'Bien' })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(rpc).toHaveBeenCalledWith('ai_gate_review', {
      p_item: ID,
      p_review: {
        accuracy: 'correct',
        grounded: true,
        safetyIssue: false,
        usefulness: 4,
        clarity: 3,
        verdict: 'approved',
        comment: 'Bien',
      },
    });
  });

  it('una rúbrica incompleta ni se manda', async () => {
    const { cloud, rpc } = rpcReply({});
    const result = await reviewItem(cloud, ID, { ...REVIEW, usefulness: 9 });
    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('con la muestra cerrada, la base lo explica en español', async () => {
    const { cloud } = rpcReply({ error: { code: '55000', message: 'La muestra ya se cerró' } });
    expect(await reviewItem(cloud, ID, REVIEW)).toEqual({
      ok: false,
      reason: 'conflict',
      message: 'La muestra ya se cerró',
    });
  });
});

describe('errores de la base', () => {
  it('traduce cada código y avisa del 42501 para pedir el segundo factor', async () => {
    const onForbidden = vi.fn();
    const forbidden = await listSamples(
      rpcReply({ error: { code: '42501', message: 'Solo un administrador' } }).cloud,
      onForbidden,
    );
    expect(forbidden).toEqual({ ok: false, reason: 'forbidden', message: null });
    expect(onForbidden).toHaveBeenCalledTimes(1);
    expect(await listSamples(rpcReply({ error: { code: '28000' } }).cloud)).toMatchObject({
      reason: 'no_session',
    });
    expect(await listSamples(rpcReply({ error: { code: '22023', message: 'No.' } }).cloud)).toEqual(
      {
        ok: false,
        reason: 'invalid',
        message: 'No.',
      },
    );
    expect(await listSamples(rpcReply({ error: { code: 'XX000' } }).cloud)).toMatchObject({
      reason: 'unknown',
    });
    // Sin código, la petición ni llegó
    expect(await listSamples(rpcReply({ error: {} }).cloud)).toMatchObject({ reason: 'network' });
    const throwing = { rpc: () => Promise.reject(new Error('x')) } as never;
    expect(await listSamples(throwing)).toMatchObject({ reason: 'network' });
  });
});

describe('el admin', () => {
  const verdict = {
    sampleId: 'b12-2026-10',
    closedAt: '2026-10-21T10:00:00Z',
    engines: {
      bias_tips: {
        items: 50,
        passed: false,
        reasons: ['agreement'],
        severe: 0,
        safetyIssues: 0,
        groundedMin: 0.98,
        approvedMin: 0.92,
        usefulnessMean: 3.4,
        clarityMean: 3.6,
        agreement: 0.8,
        kappa: null,
        reviewers: [
          { reviewerId: 'a', reviewed: 50, grounded: 0.98, approved: 0.92 },
          { reviewerId: 'b', reviewed: 50, grounded: 0.99, approved: 0.94 },
        ],
      },
    },
  };

  it('lista las muestras', async () => {
    const data = [
      {
        sampleId: 'b12-2026-10',
        status: 'open',
        createdAt: '2026-10-20T10:00:00Z',
        closedAt: null,
        reviewers: ['a', 'b'],
        total: 300,
      },
    ];
    const { cloud, rpc } = rpcReply({ data });
    expect(await listSamples(cloud)).toEqual({ ok: true, value: data });
    expect(rpc).toHaveBeenCalledWith('admin_ai_gate_samples', {});
  });

  it('lee el avance de cada médico y el veredicto si ya cerró', async () => {
    const data = {
      sampleId: 'b12-2026-10',
      status: 'closed',
      total: 50,
      reviewers: [
        { reviewerId: 'a', reviewed: 50, severe: 0 },
        { reviewerId: 'b', reviewed: 50, severe: 1 },
      ],
      closedAt: '2026-10-21T10:00:00Z',
      verdict,
    };
    const { cloud, rpc } = rpcReply({ data });
    const result = await fetchProgress(cloud, 'b12-2026-10');
    expect(rpc).toHaveBeenCalledWith('admin_ai_gate_progress', { p_sample: 'b12-2026-10' });
    expect(result.ok && result.value.verdict?.engines.bias_tips?.reasons).toEqual(['agreement']);
    expect(result.ok && result.value.reviewers[1]?.severe).toBe(1);
  });

  it('cierra la muestra y devuelve el veredicto', async () => {
    const { cloud, rpc } = rpcReply({ data: verdict });
    const result = await closeSample(cloud, 'b12-2026-10');
    expect(rpc).toHaveBeenCalledWith('admin_ai_gate_close', { p_sample: 'b12-2026-10' });
    expect(result.ok && result.value.engines.bias_tips?.passed).toBe(false);
  });

  it('importa la muestra con exactamente dos médicos', async () => {
    const file = {
      version: 1,
      id: 'b12-2026-10',
      createdAt: 'x',
      items: [],
    } as unknown as AiGateSampleFile;
    const { cloud, rpc } = rpcReply({ data: 'b12-2026-10' });
    expect(await createSample(cloud, file, ['a', 'b'])).toEqual({ ok: true, value: 'b12-2026-10' });
    expect(rpc).toHaveBeenCalledWith('admin_ai_gate_sample_create', {
      p_sample: file,
      p_reviewers: ['a', 'b'],
    });
  });

  it('abre y cierra un motor, y pausa todo, con la bandera que devuelve la base', async () => {
    const state = { paused: true, engines: {} };
    const { cloud, rpc } = rpcReply({ data: state });
    expect(await setPaused(cloud, true)).toEqual({ ok: true, value: state });
    expect(rpc).toHaveBeenCalledWith('admin_ai_pause', { p_paused: true });
    expect(await setEngineOpen(cloud, 'bias_tips', true, 'b12-2026-10')).toEqual({
      ok: true,
      value: state,
    });
    expect(rpc).toHaveBeenLastCalledWith('admin_ai_gate_set', {
      p_engine: 'bias_tips',
      p_open: true,
      p_sample: 'b12-2026-10',
    });
  });

  it('abrir un motor que no pasó trae el texto de la base', async () => {
    const { cloud } = rpcReply({
      error: { code: '55000', message: 'El motor no pasó en esa muestra cerrada' },
    });
    expect(await setEngineOpen(cloud, 'flashcards', true, 'x')).toEqual({
      ok: false,
      reason: 'conflict',
      message: 'El motor no pasó en esa muestra cerrada',
    });
  });
});
