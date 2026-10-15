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
    // Dice qué versiones ya están guardadas sin leerlas, para elegir sin conexión (B11)
    const missing = newId();
    expect(await repos.questions.storedIds([question.id, missing, v2Id])).toEqual(
      new Set([question.id, v2Id]),
    );
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

  it('listAllByTagPrefix trae una vez cada nota con una etiqueta que empieza así, sin importar mayúsculas', async () => {
    const { repos } = setup();
    const anatomy = note({ tags: ['Materia::Anatomía'] });
    // Dos etiquetas que coinciden no la repiten
    const twice = note({ tags: ['Materia::Fisiología', 'materia::Repaso'] });
    const deleted = note({ tags: ['MATERIA::Bioquímica'], deletedAt: STAMP });
    const enarm = note({ tags: ['topic:cardiology'] });
    // Materia sin :: o en medio de la ruta no empieza así
    const root = note({ tags: ['Materia'] });
    const nested = note({ tags: ['Rama::Materia::Tema'] });
    const untagged = note();
    await repos.notes.putMany([anatomy, twice, deleted, enarm, root, nested, untagged]);
    const found = await repos.notes.listAllByTagPrefix('Materia::');
    expect(found.map((entry) => entry.id).sort()).toEqual(
      [anatomy.id, twice.id, deleted.id].sort(),
    );
    expect(await repos.notes.listAllByTagPrefix('Otra::')).toEqual([]);
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

describe('banco de la nube en el navegador (B11)', () => {
  const entry = (overrides: Record<string, unknown> = {}) => ({
    questionId: newId(),
    versionId: newId(),
    version: 1,
    branch: 'internal_medicine',
    topic: 'cardiology',
    subtopic: 'hypertension',
    difficulty: 3,
    itemKinds: [],
    polarity: 'affirmative' as const,
    task: 'diagnosis' as const,
    format: 'direct' as const,
    caseId: null,
    caseOrder: null,
    caseSize: null,
    variantOf: null,
    examEligible: true,
    distractorBiases: ['anchoring'],
    optionCount: 4,
    language: 'es' as const,
    status: 'published' as const,
    seq: 1,
    ...overrides,
  });

  it('el catálogo guarda con validación y lista las publicadas y por versión', async () => {
    const { repos } = setup();
    const published = entry();
    const retired = entry({ status: 'retired', seq: 2 });
    expect(await repos.catalog.putMany([published, retired])).toBe(2);
    expect(await repos.catalog.count()).toBe(2);
    expect((await repos.catalog.listPublished()).map((row) => row.questionId)).toEqual([
      published.questionId,
    ]);
    expect(await repos.catalog.getByVersion(retired.versionId)).toEqual(retired);
    expect(await repos.catalog.get(published.questionId)).toEqual(published);
    // Un id que no es ULID o un caso a medias no entran
    await expect(repos.catalog.putMany([entry({ questionId: 'no-ulid' })])).rejects.toThrow();
    await expect(repos.catalog.putMany([entry({ caseId: newId() })])).rejects.toThrow();
    expect(await repos.catalog.count()).toBe(2);
  });

  it('el estado del banco guarda una fila por clave y devuelve la de la clave pedida', async () => {
    const { repos } = setup();
    expect(await repos.bankState.get('catalog')).toBeUndefined();
    await repos.bankState.put({
      key: 'catalog',
      since: 12,
      complete: true,
      open: true,
      syncedAt: '2026-10-20T15:00:00.000Z',
    });
    await repos.bankState.put({
      key: 'catalog',
      since: 15,
      complete: true,
      open: true,
      syncedAt: '2026-10-20T16:00:00.000Z',
    });
    expect(await repos.bankState.get('catalog')).toMatchObject({ since: 15 });
    expect(await repos.bankState.get('quota')).toBeUndefined();
    await expect(
      repos.bankState.put({
        key: 'quota',
        at: '2026-10-20T16:00:00.000Z',
        quota: {
          open: true,
          plan: 'free',
          limit: 20,
          used: -1,
          left: 21,
          day: '2026-10-20',
          resetsAt: '2026-10-21T10:00:00.000Z',
          brake: { retryAt: null },
        },
      }),
    ).rejects.toThrow();
  });

  it('las imágenes de los mazos se guardan como Blob y se quitan por mazo', async () => {
    const { repos } = setup();
    const media = (file: string, subjectKey = 'cardiologia', deckKey = 'paco-mi') => ({
      path: `/deck-media/${deckKey}/${subjectKey}/${file}`,
      deckKey,
      subjectKey,
      deckVersion: 1,
      type: 'image/png' as const,
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    });
    expect(
      await repos.deckMedia.putMany([
        media('a.png'),
        media('b.png'),
        media('c.png', 'renal'),
        media('d.png', 'cardiologia', 'paco-mi-2'),
      ]),
    ).toBe(4);
    const stored = await repos.deckMedia.get('/deck-media/paco-mi/cardiologia/a.png');
    expect(stored?.blob.size).toBe(3);
    await expect(repos.deckMedia.putMany([media('../fuera.png')])).rejects.toThrow();
    // Quitar un mazo no toca otro aunque su clave empiece igual
    expect(await repos.deckMedia.removeForDeck('paco-mi')).toBe(3);
    expect(await repos.deckMedia.get('/deck-media/paco-mi/renal/c.png')).toBeUndefined();
    expect(await repos.deckMedia.get('/deck-media/paco-mi-2/cardiologia/d.png')).toBeDefined();
  });
});
