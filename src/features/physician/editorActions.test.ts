import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { makeQuestionWithOptions, testApi } from '@/data/testing/fixtures';
import { biasTaxonomy, topicTaxonomy } from '@/demo/content';
import { draftFromVersion, taxonomyViewFrom } from './editorDraft';
import {
  InvalidDraftError,
  moveQuestionStatus,
  saveQuestionVersion,
  StaleVersionError,
} from './editorActions';

const taxonomy = taxonomyViewFrom({
  branches: topicTaxonomy.branches,
  taggable: biasTaxonomy.biases.filter((bias) => bias.taggable).map((bias) => bias.key),
});

const disposers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

async function seeded() {
  const api = testApi('real');
  disposers.push(api.dispose);
  const { question, options } = makeQuestionWithOptions();
  await api.repos.questions.addVersion(question, options);
  return { api, question, options };
}

describe('guardar versiones', () => {
  it('agrega una versión nueva en borrador y deja la anterior intacta', async () => {
    const { api, question, options } = await seeded();
    await api.repos.questions.setEditorialStatus(question.id, 'approved');
    const approved = { ...question, editorialStatus: 'approved' as const };
    const draft = { ...draftFromVersion(approved, options), explanation: 'Otra explicación' };

    const saved = await saveQuestionVersion(api, { current: approved, draft, taxonomy });
    expect(saved.question).toMatchObject({ version: 2, editorialStatus: 'draft' });

    const versions = await api.repos.questions.listVersions(question.questionId);
    expect(versions.map((version) => version.version)).toEqual([1, 2]);
    expect(versions[0]).toMatchObject({
      explanation: 'Explicación de prueba',
      editorialStatus: 'approved',
    });
    expect(await api.repos.options.listForQuestionVersion(question.id)).toHaveLength(4);
    expect(await api.repos.options.listForQuestionVersion(saved.question.id)).toHaveLength(4);
  });

  it('no guarda un borrador con problemas y dice cuáles', async () => {
    const { api, question, options } = await seeded();
    const draft = { ...draftFromVersion(question, options), prompt: '' };
    const error = await saveQuestionVersion(api, { current: question, draft, taxonomy }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(InvalidDraftError);
    expect((error as InvalidDraftError).issues).toContainEqual({ code: 'prompt_empty' });
    expect(await api.repos.questions.listVersions(question.questionId)).toHaveLength(1);
  });

  it('si ya hay una versión más nueva, avisa y no guarda encima', async () => {
    const { api, question, options } = await seeded();
    const draft = draftFromVersion(question, options);
    await saveQuestionVersion(api, { current: question, draft, taxonomy });
    await expect(
      saveQuestionVersion(api, { current: question, draft, taxonomy }),
    ).rejects.toBeInstanceOf(StaleVersionError);
    expect(await api.repos.questions.listVersions(question.questionId)).toHaveLength(2);
  });
});

describe('estado editorial', () => {
  it('sigue el flujo y rechaza saltos', async () => {
    const { api, question } = await seeded();
    await moveQuestionStatus(api, question, 'in_review');
    expect((await api.repos.questions.get(question.id))?.editorialStatus).toBe('in_review');
    await expect(
      moveQuestionStatus(api, { ...question, editorialStatus: 'in_review' }, 'draft'),
    ).resolves.toBeUndefined();
    await expect(
      moveQuestionStatus(api, { ...question, editorialStatus: 'draft' }, 'approved'),
    ).rejects.toThrow('No se puede pasar');
  });

  it('una versión que ya no es la última no cambia de estado', async () => {
    const { api, question, options } = await seeded();
    await saveQuestionVersion(api, {
      current: question,
      draft: draftFromVersion(question, options),
      taxonomy,
    });
    await expect(moveQuestionStatus(api, question, 'in_review')).rejects.toBeInstanceOf(
      StaleVersionError,
    );
  });
});
