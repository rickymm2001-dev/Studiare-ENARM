import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { makeQuestionWithOptions, newId, testApi } from '@/data/testing/fixtures';
import { biasTaxonomy, topicTaxonomy } from '@/demo/content';
import { InvalidDraftError } from './editorActions';
import { draftFromVersion, taxonomyViewFrom } from './editorDraft';
import { draftFromProposal } from './restructure';
import {
  decideRestructure,
  DecisionError,
  editedFromProposal,
  readContent,
  requestRestructure,
} from './restructureActions';

const taxonomy = taxonomyViewFrom({
  branches: topicTaxonomy.branches,
  taggable: biasTaxonomy.biases.filter((bias) => bias.taggable).map((bias) => bias.key),
});
const physician = { id: newId(), alias: 'Dra. Prueba' };

const disposers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

async function setup() {
  const api = testApi('real');
  disposers.push(api.dispose);
  const made = makeQuestionWithOptions();
  const question = {
    ...made.question,
    vignette: 'Mujer de 54 años con disnea de esfuerzo y edema de miembros inferiores.',
    explanation:
      'La insuficiencia cardiaca explica la disnea de esfuerzo y el edema. Las demás opciones no explican ambos datos.',
  };
  await api.repos.questions.addVersion(question, made.options);
  return { api, question, options: made.options };
}

const noProxy = { kind: 'no-proxy' } as const;

describe('pedir una propuesta', () => {
  it('guarda un borrador sin dueño con el original al lado y deja una línea en la bitácora de costo', async () => {
    const { api, question, options } = await setup();
    const result = await requestRestructure(api, physician, {
      question,
      options,
      transform: 'to_except',
      status: noProxy,
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.reused).toBe(false);
    expect(result.artifact).toMatchObject({
      kind: 'restructured_question',
      status: 'draft',
      userId: null,
      mode: 'template',
      decidedAt: null,
      sourceIds: [question.id],
    });
    const content = readContent(result.artifact);
    expect(content?.original.stem).toContain('Mujer de 54 años');
    expect(content?.proposal.stem).toContain('Elige la opción que no corresponde');
    expect(await api.repos.aiCallLog.list()).toHaveLength(1);
  });

  it('no pide dos veces la misma propuesta mientras la primera siga pendiente', async () => {
    const { api, question, options } = await setup();
    const args = { question, options, transform: 'to_except' as const, status: noProxy };
    const first = await requestRestructure(api, physician, args);
    const again = await requestRestructure(api, physician, args);
    if (!first.ok || !again.ok) throw new Error('Debían salir');
    expect(again.reused).toBe(true);
    expect(again.artifact.id).toBe(first.artifact.id);
    expect(await api.repos.aiCallLog.list()).toHaveLength(1);
    // Otra transformación sí es otra propuesta
    const other = await requestRestructure(api, physician, { ...args, transform: 'next_step' });
    expect(other.ok && other.reused).toBe(false);
    expect(await api.repos.aiArtifacts.list()).toHaveLength(2);
  });

  it('sin conexión no inventa nada', async () => {
    const { api, question, options } = await setup();
    const result = await requestRestructure(api, physician, {
      question,
      options,
      transform: 'to_except',
      status: { kind: 'offline' },
    });
    expect(result).toMatchObject({ ok: false, reason: 'offline' });
    expect(await api.repos.aiArtifacts.list()).toHaveLength(0);
  });

  it('un caso seriado no se reestructura', async () => {
    const { api, question, options } = await setup();
    const result = await requestRestructure(api, physician, {
      question: { ...question, caseId: newId(), caseOrder: 1 },
      options,
      transform: 'to_except',
      status: noProxy,
    });
    expect(result).toMatchObject({ ok: false, reason: 'serial_case' });
  });
});

describe('decidir una propuesta', () => {
  async function pending() {
    const { api, question, options } = await setup();
    const result = await requestRestructure(api, physician, {
      question,
      options,
      transform: 'to_except',
      status: noProxy,
    });
    if (!result.ok) throw new Error(result.message);
    const content = readContent(result.artifact);
    if (!content) throw new Error('Sin contenido');
    const draft = draftFromProposal({
      original: draftFromVersion(question, options),
      proposal: content.proposal,
    });
    const completed = {
      ...draft,
      options: draft.options.map((option) => ({
        ...option,
        biasTag: option.isCorrect ? null : (option.biasTag ?? 'anchoring'),
        rationale: option.rationale || 'Justificación del médico',
      })),
    };
    return { api, question, artifact: result.artifact, content, draft, completed };
  }

  it('aprobar crea la variante aprobada que apunta a la original y deja quién y cuándo', async () => {
    const { api, question, artifact, completed } = await pending();
    const at = new Date('2026-10-09T15:00:00.000Z');
    const approved = await decideRestructure(
      api,
      physician,
      artifact.id,
      { kind: 'approve', draft: completed, taxonomy },
      at,
    );
    expect(approved).toMatchObject({
      status: 'approved',
      decidedBy: physician.id,
      decidedAt: '2026-10-09T15:00:00.000Z',
    });
    const variantId = readContent(approved)?.variantQuestionId;
    expect(variantId).toBeTruthy();
    const variant = await api.repos.questions.latest(variantId ?? '');
    expect(variant).toMatchObject({
      variantOf: question.questionId,
      editorialStatus: 'approved',
      version: 1,
    });
    expect(await api.repos.options.listForQuestionVersion(variant?.id ?? '')).toHaveLength(4);
    // La original no cambió
    expect((await api.repos.questions.latest(question.questionId))?.id).toBe(question.id);
  });

  it('si el médico cambió el texto de la IA queda como editada', async () => {
    const { api, artifact, completed } = await pending();
    const edited = {
      ...completed,
      explanation: `${completed.explanation} El médico agregó una aclaración.`,
    };
    const result = await decideRestructure(api, physician, artifact.id, {
      kind: 'approve',
      draft: edited,
      taxonomy,
    });
    expect(result.status).toBe('edited');
  });

  it('no aprueba con etiquetas o razones faltantes y no crea nada', async () => {
    const { api, question, artifact, draft } = await pending();
    const error = await decideRestructure(api, physician, artifact.id, {
      kind: 'approve',
      draft,
      taxonomy,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(InvalidDraftError);
    expect((await api.repos.aiArtifacts.get(artifact.id))?.status).toBe('draft');
    expect((await api.repos.questions.listLatest()).map((item) => item.id)).toEqual([question.id]);
  });

  it('rechazar no crea nada y una decisión no se cambia', async () => {
    const { api, artifact, completed } = await pending();
    const rejected = await decideRestructure(api, physician, artifact.id, { kind: 'reject' });
    expect(rejected).toMatchObject({ status: 'rejected', decidedBy: physician.id });
    expect(await api.repos.questions.listLatest()).toHaveLength(1);
    await expect(
      decideRestructure(api, physician, artifact.id, {
        kind: 'approve',
        draft: completed,
        taxonomy,
      }),
    ).rejects.toBeInstanceOf(DecisionError);
  });

  it('una propuesta que no existe no se decide', async () => {
    const { api } = await setup();
    await expect(
      decideRestructure(api, physician, newId(), { kind: 'reject' }),
    ).rejects.toBeInstanceOf(DecisionError);
  });
});

describe('editedFromProposal', () => {
  it('ignora lo que el médico completa y detecta lo que cambia del texto', async () => {
    const { artifact, completed } = await (async () => {
      const { api, question, options } = await setup();
      const result = await requestRestructure(api, physician, {
        question,
        options,
        transform: 'change_anchor',
        status: noProxy,
      });
      if (!result.ok) throw new Error(result.message);
      const content = readContent(result.artifact);
      if (!content) throw new Error('Sin contenido');
      const draft = draftFromProposal({
        original: draftFromVersion(question, options),
        proposal: content.proposal,
      });
      return { artifact: content, completed: draft };
    })();
    expect(editedFromProposal(completed, artifact.proposal)).toBe(false);
    expect(
      editedFromProposal(
        {
          ...completed,
          options: completed.options.map((o, i) => (i === 0 ? { ...o, text: 'Otro' } : o)),
        },
        artifact.proposal,
      ),
    ).toBe(true);
  });
});
