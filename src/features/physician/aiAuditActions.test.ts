import { describe, expect, it, vi } from 'vitest';
import { biasTipInput } from '@/ai/testing/aiSamples';
import { mockOutput } from '@/engines/aiMock';
import type { AiGateSampleFile } from '@/engines/aiContracts';
import type { MyItem } from '@/data/cloud/aiGate';
import { CSV_HEADER, draftOf, EMPTY_DRAFT } from './aiAuditView';
import {
  importReviewsCsv,
  importSample,
  MAX_SAMPLE_FILE_BYTES,
  readSampleFile,
  saveDraft,
} from './aiAuditActions';

const ID = '5c7e0c3e-2f6a-4b1a-8d8e-0a1b2c3d4e5f';
const rpc = (
  impl: (name: string, args: unknown) => { error?: { code: string; message?: string } | null },
) => {
  const fn = vi.fn((name: string, args: unknown) => {
    const reply = impl(name, args);
    return Promise.resolve({ data: null, error: reply.error ?? null });
  });
  return { cloud: { rpc: fn } as never, rpc: fn };
};

const REVIEW = {
  accuracy: 'correct',
  grounded: true,
  safetyIssue: false,
  usefulness: 4,
  clarity: 3,
  verdict: 'approved',
  comment: null,
} as const;

const item = (suffix: string): MyItem => ({
  id: `5c7e0c3e-2f6a-4b1a-8d8e-0a1b2c3d4e${suffix}`,
  engine: 'bias_tips',
  sourceKind: 'bank',
  input: biasTipInput(),
  output: mockOutput('bias_tips', biasTipInput()),
  review: null,
});

describe('guardar una rúbrica', () => {
  it('completa se manda, y incompleta no llama a nadie', async () => {
    const { cloud, rpc: call } = rpc(() => ({}));
    expect(await saveDraft(cloud, ID, draftOf(REVIEW))).toEqual({ ok: true, value: undefined });
    expect(call).toHaveBeenCalledTimes(1);
    expect(await saveDraft(cloud, ID, EMPTY_DRAFT)).toEqual({
      ok: false,
      reason: 'incomplete',
      message: null,
    });
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('el archivo de la muestra', () => {
  const sample = (items: number) =>
    JSON.stringify({
      version: 1,
      id: 'b12-2026-10',
      createdAt: '2026-10-20T10:00:00.000Z',
      items: Array.from({ length: items }, (_, index) => ({
        id: `5c7e0c3e-2f6a-4b1a-8d8e-0a1b2c3d4e${(10 + index).toString(16).padStart(2, '0')}`,
        engine: 'bias_tips',
        model: 'claude-haiku-5-5',
        effort: 'low',
        thinking: 'adaptive',
        promptVersion: 'bias_tips.base.v1',
        promptHash: 'a'.repeat(64),
        sourceKind: 'demo',
        input: biasTipInput(),
        output: mockOutput('bias_tips', biasTipInput()),
      })),
    });

  it('lo valida con el esquema del contrato y resume qué trae', () => {
    const result = readSampleFile(sample(3));
    expect(result.ok && result.summary).toEqual({
      id: 'b12-2026-10',
      total: 3,
      byEngine: { bias_tips: 3 },
    });
  });

  it('un archivo que no es JSON, sin la forma de una muestra o enorme se rechaza', () => {
    expect(readSampleFile('esto no es json')).toEqual({ ok: false, problem: 'unreadable' });
    expect(readSampleFile('{"version":1}')).toEqual({ ok: false, problem: 'invalid' });
    expect(readSampleFile('[]')).toEqual({ ok: false, problem: 'invalid' });
    expect(readSampleFile(sample(0))).toEqual({ ok: false, problem: 'invalid' });
    expect(readSampleFile('x'.repeat(MAX_SAMPLE_FILE_BYTES + 1))).toEqual({
      ok: false,
      problem: 'too_large',
    });
  });

  it('importa con dos médicos distintos y no llama con uno repetido o vacío', async () => {
    const { cloud, rpc: call } = rpc(() => ({}));
    const read = readSampleFile(sample(2));
    if (!read.ok) throw new Error('Debía leerse');
    const file: AiGateSampleFile = read.file;
    expect(await importSample(cloud, file, ['a', 'a'])).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
    expect(await importSample(cloud, file, ['a', ''])).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
    expect(call).not.toHaveBeenCalled();
    await importSample(cloud, file, ['a', 'b']);
    expect(call).toHaveBeenCalledWith('admin_ai_gate_sample_create', {
      p_sample: file,
      p_reviewers: ['a', 'b'],
    });
  });
});

describe('subir las calificaciones de un CSV', () => {
  const items = [item('a1'), item('a2'), item('a3')];
  const row = (index: number, extra = 'correcto,sí,no,4,3,aprobado,') =>
    `${items[index]?.id},${extra}`;

  it('guarda cada fila completa, omite las vacías y cuenta las que no se pudieron guardar', async () => {
    let calls = 0;
    const { cloud } = rpc(() => {
      calls += 1;
      return calls === 2 ? { error: { code: 'XX000' } } : {};
    });
    const csv = [CSV_HEADER.join(','), row(0), row(1), `${items[2]?.id},,,,,,,`].join('\n');
    const result = await importReviewsCsv(cloud, csv, items);
    expect(result).toMatchObject({ ok: true, saved: 1, skipped: 1, failed: 1 });
    // Solo queda como guardada la que la base aceptó
    expect(result.ok && [...result.reviews.keys()]).toEqual([items[0]?.id]);
  });

  it('con un problema en alguna fila no guarda ninguna', async () => {
    const { cloud, rpc: call } = rpc(() => ({}));
    const csv = [CSV_HEADER.join(','), row(0), row(1, 'rarísimo,sí,no,4,3,aprobado,')].join('\n');
    expect(await importReviewsCsv(cloud, csv, items)).toEqual({
      ok: false,
      problems: [{ line: 3, problem: 'value' }],
    });
    expect(call).not.toHaveBeenCalled();
  });

  it('si la muestra ya se cerró o falta el permiso, se detiene en la primera', async () => {
    const closed = rpc(() => ({ error: { code: '55000', message: 'La muestra ya se cerró' } }));
    const csv = [CSV_HEADER.join(','), row(0), row(1)].join('\n');
    expect(await importReviewsCsv(closed.cloud, csv, items)).toEqual({
      ok: false,
      reason: 'conflict',
      message: 'La muestra ya se cerró',
    });
    expect(closed.rpc).toHaveBeenCalledTimes(1);
    const onForbidden = vi.fn();
    const denied = rpc(() => ({ error: { code: '42501' } }));
    expect(await importReviewsCsv(denied.cloud, csv, items, onForbidden)).toMatchObject({
      ok: false,
      reason: 'forbidden',
    });
    expect(onForbidden).toHaveBeenCalledTimes(1);
    expect(denied.rpc).toHaveBeenCalledTimes(1);
  });
});
