import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { EnarmDb } from '../../db/database';
import { freshDb, makeQuestionWithOptions, makeUser, newId } from '../../testing/fixtures';
import { createDexieRepositories } from './createRepositories';

const openDbs: EnarmDb[] = [];
afterEach(async () => {
  await Promise.all(openDbs.splice(0).map((db) => db.delete()));
});

function setup(kind: 'real' | 'demo' = 'real') {
  const db = freshDb(kind);
  openDbs.push(db);
  return { db, repos: createDexieRepositories(db) };
}

describe('repositorios de entidades', () => {
  it('guardan, leen, listan y borran con validación', async () => {
    const { repos } = setup();
    const user = makeUser();
    await repos.users.put(user);
    expect(await repos.users.get(user.id)).toEqual(user);
    expect(await repos.users.list()).toHaveLength(1);
    await expect(repos.users.put({ ...user, alias: '' })).rejects.toThrow();
    await repos.users.remove(user.id);
    expect(await repos.users.get(user.id)).toBeUndefined();
  });

  it('SimTruth solo existe en la base demo', () => {
    expect(setup('real').repos.simTruth).toBeNull();
    expect(setup('demo').repos.simTruth).not.toBeNull();
  });

  it('las preguntas se versionan sin reemplazar versiones existentes (6.1)', async () => {
    const { repos } = setup();
    const { question, options } = makeQuestionWithOptions();
    await repos.questions.addVersion(question, options);
    await expect(repos.questions.addVersion(question, [])).rejects.toThrow();

    const v2Id = newId();
    const v2Options = options.map((option) => ({
      ...option,
      id: newId(),
      questionVersionId: v2Id,
    }));
    const v2 = {
      ...question,
      id: v2Id,
      version: 2,
      prompt: '¿Cuál es el tratamiento inicial?',
      canonicalOptionIds: v2Options.map((option) => option.id),
    };
    await repos.questions.addVersion(v2, v2Options);

    expect((await repos.questions.listVersions(question.questionId)).map((q) => q.version)).toEqual(
      [1, 2],
    );
    expect((await repos.questions.latest(question.questionId))?.id).toBe(v2Id);
    expect(await repos.questions.listLatest()).toHaveLength(1);
    expect(await repos.questions.get(question.id)).toEqual(question);
    expect(await repos.options.listForQuestionVersion(question.id)).toHaveLength(4);
  });

  it('rechaza una versión con dos correctas o con set canónico ajeno', async () => {
    const { repos } = setup();
    const { question, options } = makeQuestionWithOptions();
    const twoCorrect = options.map((option, index) =>
      index === 1 ? { ...option, isCorrect: true, biasTag: null } : option,
    );
    await expect(repos.questions.addVersion(question, twoCorrect)).rejects.toThrow(
      /una opción correcta/,
    );
    await expect(
      repos.questions.addVersion({ ...question, canonicalOptionIds: [newId(), newId()] }, options),
    ).rejects.toThrow(/set canónico/);
  });

  it('cambia el estado editorial sin tocar el contenido', async () => {
    const { repos } = setup();
    const { question, options } = makeQuestionWithOptions();
    await repos.questions.addVersion(question, options);
    await repos.questions.setEditorialStatus(question.id, 'approved');
    expect(await repos.questions.get(question.id)).toEqual({
      ...question,
      editorialStatus: 'approved',
    });
    await expect(repos.questions.setEditorialStatus(newId(), 'approved')).rejects.toThrow();
  });
});
