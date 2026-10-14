import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDemoBank } from '@/demo/content/bank';
import { listStudentPool } from '../usecases/studentBank';
import { makeQuestionWithOptions, newId, testApi } from '../testing/fixtures';
import { createLocalSource, poolQuestionOf } from './localSource';

const disposers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

function setup() {
  const api = testApi('real');
  disposers.push(api.dispose);
  return { api, source: createLocalSource(api) };
}

describe('fuente local, el banco de demostración de siempre (5.1)', () => {
  it('prepara el banco de demostración y el pool es el mismo de listStudentPool', async () => {
    const { api, source } = setup();
    expect(source.kind).toBe('local');
    expect(await source.prepare()).toBe('ready');
    const pool = await source.pool();
    const today = await listStudentPool(api);
    expect(pool.practice.map((question) => question.id)).toEqual(
      today.practice.map((question) => question.id),
    );
    expect(pool.exam.map((question) => question.id)).toEqual(
      today.exam.map((question) => question.id),
    );
    expect(pool.practice).toHaveLength(buildDemoBank().questions.length);
    expect(pool.practice.every((question) => question.isDemo && question.language === 'es')).toBe(
      true,
    );
  });

  it('ensureBodies no baja nada, revisa lo que hay y no tiene cuota del servidor', async () => {
    const { api, source } = setup();
    await source.prepare();
    const [first] = (await source.pool()).practice;
    const missing = newId();
    const result = await source.ensureBodies([first?.id ?? '', missing, first?.id ?? ''], 'duel');
    expect(result).toEqual({
      ready: [first?.id],
      denied: [{ id: missing, reason: 'not_found' }],
      quota: null,
      offline: false,
    });
    expect(await source.quota()).toBeNull();
    await expect(source.refresh()).resolves.toBeUndefined();
    expect(await api.repos.catalog.count()).toBe(0);
  });

  it('la pregunta del pool conserva lo que se usa para elegir, sin su texto', () => {
    const { question } = makeQuestionWithOptions();
    const variant = { ...question, variantOf: newId(), itemKinds: ['control' as const] };
    const pooled = poolQuestionOf(variant, false);
    expect(pooled).toMatchObject({
      id: question.id,
      questionId: question.questionId,
      examEligible: false,
      variantOf: variant.variantOf,
      itemKinds: ['control'],
      structure: {
        polarity: question.structure.polarity,
        task: question.structure.task,
        format: question.structure.format,
      },
      distractorBiases: [],
    });
    expect(pooled).not.toHaveProperty('prompt');
    expect(poolQuestionOf(question, true)).not.toHaveProperty('variantOf');
  });
});
