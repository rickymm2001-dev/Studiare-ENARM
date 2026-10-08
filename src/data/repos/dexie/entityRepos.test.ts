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

  it('los casos clínicos solo se agregan, nunca se editan (6.1)', async () => {
    const { repos } = setup();
    expect(Object.keys(repos.cases).sort()).toEqual(['add', 'get', 'list']);
    const clinicalCase = {
      id: newId(),
      vignette: 'Viñeta de prueba',
      isDemo: true,
      createdAt: '2026-10-01T15:00:00.000Z',
    };
    await repos.cases.add(clinicalCase);
    await expect(repos.cases.add({ ...clinicalCase, vignette: 'Otra viñeta' })).rejects.toThrow();
    expect(await repos.cases.get(clinicalCase.id)).toEqual(clinicalCase);
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

describe('apuntes y búsquedas por índice (D-092)', () => {
  const STAMP = '2026-10-08T12:00:00.000Z';
  const note = (overrides: Record<string, unknown> = {}) => ({
    id: newId(),
    deckId: newId(),
    tags: [],
    origin: 'manual' as const,
    editorialStatus: 'draft' as const,
    sourceQuote: null,
    sourceQuestionVersionId: null,
    isDemo: false,
    createdAt: STAMP,
    kind: 'basic' as const,
    front: '<p>f</p>',
    back: '<p>b</p>',
    ...overrides,
  });

  it('el repositorio de apuntes es sincronizable, valida y no muestra lo borrado en get ni en list', async () => {
    const { repos } = setup();
    const base = {
      id: newId(),
      ownerId: newId(),
      title: 'Apunte',
      deckId: newId(),
      nodes: [{ id: newId(), text: 'Pregunta >> Respuesta', children: [] }],
      createdAt: STAMP,
    };
    await repos.outlines.put(base);
    await expect(repos.outlines.put({ ...base, title: '' })).rejects.toThrow();
    expect(await repos.outlines.get(base.id)).toEqual(base);
    await repos.outlines.put({ ...base, deletedAt: STAMP, updatedAt: STAMP });
    expect(await repos.outlines.get(base.id)).toBeUndefined();
    expect(await repos.outlines.list()).toHaveLength(0);
    expect(await repos.outlines.getRaw(base.id)).toMatchObject({ deletedAt: STAMP });
    expect(await repos.outlines.listAll()).toHaveLength(1);
  });

  it('listAllByOutline trae las notas de ese apunte, también las borradas, y nada más', async () => {
    const { repos } = setup();
    const [outlineA, outlineB] = [newId(), newId()];
    const alive = note({ outlineId: outlineA, outlineNodeId: newId() });
    const deleted = note({ outlineId: outlineA, outlineNodeId: newId(), deletedAt: STAMP });
    const other = note({ outlineId: outlineB, outlineNodeId: newId() });
    const loose = note();
    const detached = note({ outlineId: null, outlineNodeId: null });
    await repos.notes.putMany([alive, deleted, other, loose, detached]);
    const found = await repos.notes.listAllByOutline(outlineA);
    expect(found.map((entry) => entry.id).sort()).toEqual([alive.id, deleted.id].sort());
    expect(await repos.notes.listAllByOutline(outlineB)).toHaveLength(1);
    expect(await repos.notes.listAllByOutline(newId())).toEqual([]);
    // get y list siguen sin mostrar la nota borrada
    expect(await repos.notes.get(deleted.id)).toBeUndefined();
    expect((await repos.notes.list()).map((entry) => entry.id)).not.toContain(deleted.id);
  });

  it('listAllForNotes trae las cartas de esas notas, también las borradas', async () => {
    const { repos } = setup();
    const [one, two, three] = [newId(), newId(), newId()];
    const card = (noteId: string, ordinal: number, extra: Record<string, unknown> = {}) => ({
      id: newId(),
      noteId,
      deckId: newId(),
      ordinal,
      createdAt: STAMP,
      ...extra,
    });
    const cards = [card(one, 0), card(one, 1, { deletedAt: STAMP }), card(two, 0), card(three, 0)];
    await repos.cards.putMany(cards);
    expect(await repos.cards.listAllForNotes([])).toEqual([]);
    expect(await repos.cards.listAllForNotes([one])).toHaveLength(2);
    expect(
      (await repos.cards.listAllForNotes([one, two, newId()])).map((entry) => entry.id).sort(),
    ).toEqual([cards[0]?.id, cards[1]?.id, cards[2]?.id].sort());
  });
});
