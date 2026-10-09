import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { ItemStatsCache } from '../schemas/caches';
import { createDexieRepositories } from '../repos/dexie/createRepositories';
import { freshDb, makeQuestionWithOptions } from '../testing/fixtures';
import { listStudentPool, variantCountsForExam } from './studentBank';

const disposers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});
const setup = () => {
  const db = freshDb('real');
  disposers.push(() => db.delete());
  return { db, repos: createDexieRepositories(db) };
};

async function addQuestion(
  api: ReturnType<typeof setup>,
  overrides: { variantOf?: string; editorialStatus?: 'draft' | 'approved' } = {},
) {
  const { question, options } = makeQuestionWithOptions();
  const saved = { ...question, ...overrides };
  await api.repos.questions.addVersion(saved, options);
  return { question: saved, options };
}

const statsFor = (questionVersionId: string, optionIds: string[], exposures: number) =>
  ({
    questionVersionId,
    responses: 300,
    correct: 150,
    eloDifficulty: 0,
    raschDifficulty: null,
    calibration: 'calibrated',
    optionStats: Object.fromEntries(optionIds.map((id) => [id, { exposures, choices: 1 }])),
    updatedAt: '2026-10-09T10:00:00.000Z',
  }) satisfies ItemStatsCache;

describe('preguntas que ve el alumno', () => {
  it('las originales entran a la práctica y al examen', async () => {
    const api = setup();
    const { question } = await addQuestion(api);
    const pool = await listStudentPool(api);
    expect(pool.practice.map((item) => item.id)).toEqual([question.id]);
    expect(pool.exam.map((item) => item.id)).toEqual([question.id]);
  });

  it('una variante sin aprobar no llega a ningún alumno', async () => {
    const api = setup();
    const original = await addQuestion(api);
    await addQuestion(api, { variantOf: original.question.questionId, editorialStatus: 'draft' });
    const pool = await listStudentPool(api);
    expect(pool.practice).toHaveLength(1);
    expect(pool.exam).toHaveLength(1);
  });

  it('una variante aprobada entra a la práctica pero no al examen hasta tener sus exposiciones', async () => {
    const api = setup();
    const original = await addQuestion(api);
    const variant = await addQuestion(api, {
      variantOf: original.question.questionId,
      editorialStatus: 'approved',
    });
    const distractors = variant.options.filter((option) => !option.isCorrect).map((o) => o.id);

    let pool = await listStudentPool(api, 200);
    expect(pool.practice).toHaveLength(2);
    expect(pool.exam.map((item) => item.id)).toEqual([original.question.id]);

    // Con 199 exposiciones en un distractor todavía no
    await api.db.itemStatsCache.put(statsFor(variant.question.id, distractors, 199));
    expect(await variantCountsForExam(api, variant.question, 200)).toBe(false);
    pool = await listStudentPool(api, 200);
    expect(pool.exam).toHaveLength(1);

    await api.db.itemStatsCache.put(statsFor(variant.question.id, distractors, 200));
    pool = await listStudentPool(api, 200);
    expect(pool.exam).toHaveLength(2);
  });
});
