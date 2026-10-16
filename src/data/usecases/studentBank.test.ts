import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { ItemStatsCache } from '../schemas/caches';
import { createDexieRepositories } from '../repos/dexie/createRepositories';
import { freshDb, makeQuestionWithOptions, newId } from '../testing/fixtures';
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

describe('el inglés va aparte del español (B13, 2.8)', () => {
  /** Un caso de lectura de dos preguntas en inglés */
  async function addEnglishCase(api: ReturnType<typeof setup>, status: 'draft' | 'approved') {
    const caseId = newId();
    const added = [];
    for (const order of [1, 2]) {
      const { question, options } = makeQuestionWithOptions();
      const saved = {
        ...question,
        caseId,
        caseOrder: order,
        branch: 'medical_english',
        topic: 'reading_comprehension',
        subtopic: 'english_pediatrics',
        language: 'en' as const,
        editorialStatus: status,
      };
      await api.repos.questions.addVersion(saved, options);
      added.push(saved);
    }
    return added;
  }

  it('la práctica y el examen en español no traen el inglés, que sale en su propio pool', async () => {
    const api = setup();
    const { question } = await addQuestion(api);
    const [first, second] = await addEnglishCase(api, 'approved');
    const pool = await listStudentPool(api);
    expect(pool.practice.map((item) => item.id)).toEqual([question.id]);
    expect(pool.exam.map((item) => item.id)).toEqual([question.id]);
    expect(pool.english.practice.map((item) => item.id).toSorted()).toEqual(
      [first?.id, second?.id].toSorted(),
    );
    expect(pool.english.exam).toHaveLength(2);
  });

  it('sin preguntas en inglés su pool queda vacío y lo anterior no cambia', async () => {
    const api = setup();
    await addQuestion(api);
    const pool = await listStudentPool(api);
    expect(pool.english).toEqual({ practice: [], exam: [] });
    expect(pool.practice).toHaveLength(1);
  });

  it('una pregunta con el idioma es o sin idioma es español', async () => {
    const api = setup();
    const spanish = makeQuestionWithOptions();
    await api.repos.questions.addVersion({ ...spanish.question, language: 'es' }, spanish.options);
    const plain = await addQuestion(api);
    const pool = await listStudentPool(api);
    expect(pool.practice.map((item) => item.id).toSorted()).toEqual(
      [spanish.question.id, plain.question.id].toSorted(),
    );
    expect(pool.english.practice).toEqual([]);
  });

  it('una variante de inglés sin aprobar no llega al alumno, como en español', async () => {
    const api = setup();
    const [original] = await addEnglishCase(api, 'approved');
    const { question, options } = makeQuestionWithOptions();
    await api.repos.questions.addVersion(
      {
        ...question,
        language: 'en',
        branch: 'medical_english',
        variantOf: original?.questionId ?? '',
        editorialStatus: 'draft',
      },
      options,
    );
    const pool = await listStudentPool(api);
    expect(pool.english.practice).toHaveLength(2);
  });
});
