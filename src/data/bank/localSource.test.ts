import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDemoBank } from '@/demo/content/bank';
import { listStudentPool } from '../usecases/studentBank';
import { createDexieRepositories } from '../repos/dexie/createRepositories';
import { freshDb, makeQuestionWithOptions, newId, testApi } from '../testing/fixtures';
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

  it('el inglés sale en su pool, con su idioma, y el español no lo trae (B13)', async () => {
    const { api, source } = setup();
    await source.prepare();
    const { question, options } = makeQuestionWithOptions();
    await api.repos.questions.addVersion(
      { ...question, language: 'en', branch: 'medical_english', topic: 'reading_comprehension' },
      options,
    );
    const pool = await source.pool();
    expect(pool.practice.some((item) => item.id === question.id)).toBe(false);
    expect(pool.english.practice.map((item) => item.id)).toEqual([question.id]);
    expect(pool.english.exam.map((item) => item.id)).toEqual([question.id]);
    expect(pool.english.practice[0]).toMatchObject({ language: 'en', examEligible: true });
    expect(pool.practice.every((item) => item.language === 'es')).toBe(true);
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

  it('con las estadísticas de la cohorte simulada el pool trae la dificultad efectiva (B14, 4.4)', async () => {
    // Con su propia base, para escribir en la caché que solo la siembra de la demostración llena
    const db = freshDb('real');
    disposers.push(() => db.delete());
    const source = createLocalSource({ repos: createDexieRepositories(db) });
    await source.prepare();
    const [measured, thin, none] = (await source.pool()).practice;
    if (!measured || !thin || !none)
      throw new Error('El banco de demostración trae pocas preguntas');
    const stats = (id: string, calibration: 'calibrated' | 'physician_estimate') => ({
      questionVersionId: id,
      responses: calibration === 'calibrated' ? 150 : 12,
      correct: 80,
      eloDifficulty: 0.4,
      raschDifficulty: 1.2,
      calibration,
      optionStats: {},
      updatedAt: '2026-10-01T00:00:00.000Z',
    });
    await db.itemStatsCache.bulkPut([
      stats(measured.id, 'calibrated'),
      stats(thin.id, 'physician_estimate'),
    ]);
    const pool = await source.pool();
    const byId = new Map(pool.practice.map((question) => [question.id, question]));
    // Calibrada usa la de Rasch, con pocas respuestas se queda con la del médico y sin fila no trae nada
    expect(byId.get(measured.id)?.effectiveDifficulty).toEqual({
      logit: 1.2,
      source: 'calibrated',
      students: 150,
    });
    expect(byId.get(thin.id)?.effectiveDifficulty).toMatchObject({
      source: 'physician_estimate',
      students: 12,
    });
    expect(byId.get(none.id)).not.toHaveProperty('effectiveDifficulty');
    // El examen lleva la misma dificultad
    expect(
      pool.exam.find((question) => question.id === measured.id)?.effectiveDifficulty?.source,
    ).toBe('calibrated');
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
