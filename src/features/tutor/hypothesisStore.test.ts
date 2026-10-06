import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { makeUser, newId, testApi } from '@/data/testing/fixtures';
import {
  ensureHypothesisArtifact,
  hypothesisArtifactId,
  recordHypothesisAction,
  reopenHypothesis,
  respondToHypothesis,
} from './hypothesisStore';
import { hypothesisKey, type Hypothesis } from './tutorModel';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

function setup() {
  const api = testApi('real');
  disposers.push(api.dispose);
  const user = makeUser();
  const hypothesis: Hypothesis = {
    key: hypothesisKey('misreading', 'nephrology'),
    rule: 'misreading',
    area: 'nephrology',
    status: 'confirmed',
    recentFindings: 6,
    findingsNeeded: 0,
    confidence: 'low',
    actions: ['enable_highlight', 'subtopic_simulator'],
    items: [
      {
        eventId: newId(),
        itemId: newId(),
        kind: 'question',
        at: '2026-10-05T10:00:00.000Z',
        confusedWithItemId: null,
      },
      {
        eventId: newId(),
        itemId: newId(),
        kind: 'question',
        at: '2026-10-04T10:00:00.000Z',
        confusedWithItemId: null,
      },
    ],
    causesReported: 0,
    causeMismatches: 0,
  };
  const events = () => api.repos.events.query({ userId: user.id });
  return { api, user, hypothesis, events };
}

describe('respuesta del alumno a una hipótesis del tutor', () => {
  it('crea el artefacto de plantilla una sola vez, anclado a los errores del alumno', async () => {
    const { api, user, hypothesis, events } = setup();
    const first = await ensureHypothesisArtifact(api, user, hypothesis);
    const again = await ensureHypothesisArtifact(api, user, hypothesis);
    expect(again).toEqual(first);
    expect(first).toMatchObject({
      id: hypothesisArtifactId(user.id, hypothesis.key),
      userId: user.id,
      kind: 'hypothesis',
      status: 'draft',
      mode: 'template',
      model: 'reglas',
      sourceIds: hypothesis.items.map((item) => item.itemId),
      validatorResult: { passed: true, issues: [] },
    });
    expect((await events()).map((event) => event.type)).toEqual(['ai_artifact_created']);
  });

  it('Me sirve aprueba y No me ayuda descarta, y las dos quedan en la bitácora', async () => {
    const { api, user, hypothesis, events } = setup();
    await respondToHypothesis(api, user, hypothesis, true);
    const approved = await api.repos.aiArtifacts.get(hypothesisArtifactId(user.id, hypothesis.key));
    expect(approved).toMatchObject({ status: 'approved', decidedBy: user.id });
    expect(approved?.decidedAt).not.toBeNull();

    await respondToHypothesis(api, user, hypothesis, false);
    const rejected = await api.repos.aiArtifacts.get(hypothesisArtifactId(user.id, hypothesis.key));
    expect(rejected?.status).toBe('rejected');

    const types = (await events()).map((event) => event.type);
    expect(types).toEqual([
      'ai_artifact_created',
      'ai_artifact_approved',
      'hypothesis_feedback',
      'ai_artifact_rejected',
      'hypothesis_feedback',
    ]);
    const feedback = (await events()).filter((event) => event.type === 'hypothesis_feedback');
    expect(feedback.map((event) => event.payload)).toEqual([
      { artifactId: rejected?.id, helpful: true },
      { artifactId: rejected?.id, helpful: false },
    ]);
  });

  it('volver a mostrar una descartada la deja en borrador sin tocar la bitácora', async () => {
    const { api, user, hypothesis, events } = setup();
    await respondToHypothesis(api, user, hypothesis, false);
    const before = (await events()).length;
    await reopenHypothesis(api, user, hypothesis);
    const artifact = await api.repos.aiArtifacts.get(hypothesisArtifactId(user.id, hypothesis.key));
    expect(artifact).toMatchObject({ status: 'draft', decidedAt: null, decidedBy: null });
    expect(await events()).toHaveLength(before);
    // Una que nunca se tocó no rompe nada
    await reopenHypothesis(api, user, { key: 'otra|area' });
  });

  it('aplicar una acción queda como action_applied ligado a la hipótesis', async () => {
    const { api, user, hypothesis, events } = setup();
    await recordHypothesisAction(api, user, hypothesis, 'enable_highlight');
    const applied = (await events()).filter((event) => event.type === 'action_applied');
    expect(applied.map((event) => event.payload)).toEqual([
      {
        artifactId: hypothesisArtifactId(user.id, hypothesis.key),
        action: 'enable_highlight',
      },
    ]);
  });
});
