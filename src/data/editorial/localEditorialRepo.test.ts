// Versión local del repositorio editorial (B11, 5.7 del plan de B11). La demo enseña el mismo flujo que
// la nube. El médico asignado es el revisor y la etiqueta del autor es la del banco. A ciegas no ve lo
// del autor, al terminar sus etiquetas se cierran, y aprobar pide el etiquetado completo y una versión
// sin pendientes. El admin solo lee.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { makeQuestionWithOptions, makeUser, newId, testApi } from '../testing/fixtures';
import type { Option, Question } from '../schemas/bank';
import { TAGGABLE_BIASES } from '../usecases/labeling';
import { draftFromVersion } from '@/features/physician/editorDraft';
import { InvalidDraftError } from '@/features/physician/editorActions';
import { EditorialError } from './editorialRepo';
import { createLocalEditorialRepo } from './localEditorialRepo';

const disposers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

const [tagA, tagB] = TAGGABLE_BIASES.map((bias) => bias.key) as [string, string];

/** Una pregunta del banco con sus cuatro opciones y la subespecialidad que sí existe */
function bankQuestion(status: Question['editorialStatus'] = 'draft') {
  const { question, options } = makeQuestionWithOptions();
  return {
    question: { ...question, subtopic: 'hypertension', editorialStatus: status },
    options: options.map((option) => (option.isCorrect ? option : { ...option, biasTag: tagA })),
  };
}

async function setup(status: Question['editorialStatus'] = 'draft') {
  const api = testApi();
  disposers.push(api.dispose);
  const physician = makeUser({ role: 'physician', alias: 'Ana' });
  await api.repos.users.put(physician);
  const { question, options } = bankQuestion(status);
  await api.repos.questions.addVersion(question, options);
  await api.repos.reviewAssignments.put({
    id: newId(),
    questionId: question.questionId,
    physicianId: physician.id,
    assignedBy: null,
    assignedAt: '2026-10-08T10:00:00.000Z',
  });
  return {
    api,
    physician,
    question,
    options,
    asPhysician: createLocalEditorialRepo(api, { id: physician.id, role: 'physician' }),
    asAdmin: createLocalEditorialRepo(api, { id: newId(), role: 'admin' }),
  };
}

const distractorsOf = (options: readonly Option[]) => options.filter((option) => !option.isCorrect);

describe('repositorio editorial local', () => {
  it('el médico ve lo asignado como revisor, el admin todo y el alumno nada', async () => {
    const { api, asPhysician, asAdmin, question } = await setup();
    const other = bankQuestion();
    await api.repos.questions.addVersion(other.question, other.options);

    const mine = await asPhysician.list({}, { limit: 50, offset: 0 });
    expect(mine.items.map((item) => item.questionId)).toEqual([question.questionId]);
    expect(mine.items[0]).toMatchObject({ myRole: 'reviewer', reviewer: { alias: 'Ana' } });
    expect((await asAdmin.list({}, { limit: 50, offset: 0 })).total).toBe(2);
    await expect(
      createLocalEditorialRepo(api, { id: newId(), role: 'student' }).list(
        {},
        { limit: 1, offset: 0 },
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
    // Un médico sin sesión no tiene nada asignado
    const noSession = createLocalEditorialRepo(api, { id: null, role: 'physician' });
    expect((await noSession.list({}, { limit: 50, offset: 0 })).total).toBe(0);
  });

  it('filtra por las vistas del banco', async () => {
    const { api, asPhysician, question } = await setup();
    const page = { limit: 50, offset: 0 };
    expect((await asPhysician.list({ view: 'to_review' }, page)).total).toBe(0);
    expect((await asPhysician.list({ view: 'my_drafts' }, page)).total).toBe(1);
    await api.repos.questions.setEditorialStatus(question.id, 'in_review');
    expect((await asPhysician.list({ view: 'to_review' }, page)).total).toBe(1);
    expect((await asPhysician.list({ view: 'published' }, page)).total).toBe(0);
    expect((await asPhysician.list({ branch: 'pediatrics' }, page)).total).toBe(0);
  });

  it('a ciegas esconde la etiqueta y la justificación de los distractores, no la correcta', async () => {
    const { asPhysician, question, options } = await setup('in_review');
    const view = await asPhysician.question(question.questionId);
    expect(view.review).toMatchObject({ role: 'reviewer', state: 'blind_pending' });
    expect(view.review.pendingOptionIds).toHaveLength(3);
    const [latest] = view.versions;
    for (const option of latest?.options ?? []) {
      if (option.isCorrect) {
        expect(option).toMatchObject({ hidden: false, rationale: options[0]?.rationale });
      } else {
        expect(option).toMatchObject({ hidden: true, biasTag: null, rationale: null });
      }
    }
  });

  it('cada etiqueta avanza, al terminar se revela y se cierra', async () => {
    const { asPhysician, question, options } = await setup('in_review');
    const distractors = distractorsOf(options);
    const results = [];
    for (const option of distractors) {
      results.push(await asPhysician.label(question.id, option.optionId, tagB));
    }
    expect(results.map((result) => result.done)).toEqual([1, 2, 3]);
    expect(results.at(-1)).toEqual({ done: 3, total: 3, revealed: true });
    const view = await asPhysician.question(question.questionId);
    expect(view.review.state).toBe('ready');
    expect(view.versions[0]?.options.some((option) => option.hidden)).toBe(false);
    await expect(
      asPhysician.label(question.id, distractors[0]?.optionId ?? '', tagA),
    ).rejects.toMatchObject({ code: 'blind_labels' });
  });

  it('la correcta no se etiqueta y una versión que no está en revisión tampoco', async () => {
    const { asPhysician, question, options } = await setup('draft');
    await expect(
      asPhysician.label(question.id, distractorsOf(options)[0]?.optionId ?? '', tagA),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('aprobar pide el etiquetado completo, y pedir cambios pide comentario', async () => {
    const { api, asPhysician, question, options } = await setup('in_review');
    await expect(asPhysician.decide(question.id, 'approve', '', [])).rejects.toMatchObject({
      code: 'blind_labels',
    });
    for (const option of distractorsOf(options)) {
      await asPhysician.label(question.id, option.optionId, tagA);
    }
    await expect(
      asPhysician.decide(question.id, 'request_changes', '  ', []),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(await asPhysician.decide(question.id, 'approve', '', [])).toEqual({
      status: 'approved',
      published: true,
      waitingCase: false,
    });
    expect((await api.repos.questions.get(question.id))?.editorialStatus).toBe('approved');
  });

  it('una versión con pendientes no va a revisión ni se aprueba', async () => {
    const { api, asPhysician, question } = await setup();
    // Sin referencias le falta lo que pide bank_version_issues
    const next = { ...question, id: newId(), version: 2, gpcRefs: [] };
    const options = (await api.repos.options.listForQuestionVersion(question.id)).map((option) => ({
      ...option,
      id: newId(),
      questionVersionId: next.id,
    }));
    await api.repos.questions.addVersion(
      { ...next, canonicalOptionIds: options.map((option) => option.id) },
      options,
    );
    const error = await asPhysician.submit(next.id).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(EditorialError);
    expect(error).toMatchObject({ code: 'incomplete', detail: 'references_missing' });
  });

  it('el médico manda a revisión su borrador y guarda versiones sobre la más reciente', async () => {
    const { api, asPhysician, question, options } = await setup();
    const draft = { ...draftFromVersion(question, options), explanation: 'Otra explicación' };
    const saved = await asPhysician.saveVersion(question.questionId, question.id, draft);
    expect(saved).toMatchObject({ status: 'saved', version: 2, incomplete: [] });
    // La base vieja ya no es la más reciente
    await expect(
      asPhysician.saveVersion(question.questionId, question.id, draft),
    ).rejects.toMatchObject({ code: 'stale' });
    await expect(
      asPhysician.saveVersion(question.questionId, saved.versionId, { ...draft, prompt: '' }),
    ).rejects.toBeInstanceOf(InvalidDraftError);
    expect(await asPhysician.submit(saved.versionId)).toMatchObject({ status: 'in_review' });
    expect((await api.repos.questions.get(saved.versionId))?.editorialStatus).toBe('in_review');
  });

  it('el admin no edita, no etiqueta ni decide', async () => {
    const { asAdmin, question, options } = await setup('in_review');
    await expect(
      asAdmin.saveVersion(question.questionId, question.id, draftFromVersion(question, options)),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      asAdmin.label(question.id, distractorsOf(options)[0]?.optionId ?? '', tagA),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(asAdmin.decide(question.id, 'approve', '', [])).rejects.toMatchObject({
      code: 'forbidden',
    });
    const view = await asAdmin.question(question.questionId);
    expect(view.review.role).toBe('admin');
    expect(view.versions[0]?.options.some((option) => option.hidden)).toBe(false);
  });

  it('un médico sin la pregunta asignada no la abre', async () => {
    const { api, question } = await setup();
    const other = createLocalEditorialRepo(api, { id: newId(), role: 'physician' });
    await expect(other.question(question.questionId)).rejects.toMatchObject({
      code: 'not_assigned',
    });
  });

  it('los pares comparan la etiqueta del revisor con la del banco', async () => {
    const { asPhysician, question, options } = await setup('in_review');
    const [first, second] = distractorsOf(options);
    await asPhysician.label(question.id, first?.optionId ?? '', tagA);
    await asPhysician.label(question.id, second?.optionId ?? '', tagB);
    const pairs = await asPhysician.labelPairs();
    // Las dos etiquetas pueden llevar la misma hora, así que el orden entre ellas no importa
    expect(pairs.map((pair) => `${pair.authorTag}|${pair.reviewerTag}`).toSorted()).toEqual(
      [`${tagA}|${tagA}`, `${tagA}|${tagB}`].toSorted(),
    );
  });

  it('los reportes del médico son solo de lo asignado', async () => {
    const { api, asPhysician, asAdmin, question } = await setup();
    const other = bankQuestion();
    await api.repos.questions.addVersion(other.question, other.options);
    const report = (targetId: string) => ({
      id: newId(),
      reporterId: newId(),
      targetKind: 'question' as const,
      targetId,
      reason: 'typo' as const,
      status: 'open' as const,
      createdAt: '2026-10-09T10:00:00.000Z',
      resolvedAt: null,
    });
    await api.repos.contentReports.putMany([report(question.id), report(other.question.id)]);
    expect((await asPhysician.reports()).rows.map((row) => row.questionId)).toEqual([
      question.questionId,
    ]);
    expect((await asAdmin.reports()).rows).toHaveLength(2);
    expect(await asPhysician.distractorQueue('open')).toEqual([]);
  });
});
