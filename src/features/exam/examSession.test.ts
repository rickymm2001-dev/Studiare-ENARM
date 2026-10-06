import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppEvent } from '@/data/schemas/events';
import { makeQuestionWithOptions, makeUser, testApi } from '@/data/testing/fixtures';
import { errorIds } from '@/data/usecases/errorCards';
import { closeExam, loadExamBundles, startExam } from './examSession';
import {
  choose,
  finishExamState,
  goTo,
  toggleEliminated,
  toggleMarked,
  type ExamState,
} from './examState';
import { clearExamState, loadExamState } from './examStorage';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

const T0 = Date.UTC(2026, 9, 5, 16, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();

async function setup(questions = 4) {
  const api = testApi('real');
  disposers.push(api.dispose);
  const { repos } = api;
  const user = makeUser();
  const branches = ['internal_medicine', 'pediatrics'];
  const stored = [];
  for (let index = 0; index < questions; index += 1) {
    const { question, options } = makeQuestionWithOptions();
    const withBranch = { ...question, branch: branches[index % 2] ?? 'pediatrics' };
    await repos.questions.addVersion(withBranch, options);
    stored.push(withBranch);
  }
  const events = () => repos.events.query({ userId: user.id });
  return { api, repos, user, questions: stored, events };
}

const options = { highlight: false, askConfidence: false, alerts: true };

describe('inicio del examen', () => {
  it('arma el examen, registra el inicio y lo guarda para reanudarlo', async () => {
    const { api, user, questions, events } = await setup(6);
    const state = await startExam({ api, user, questions, requested: 4, options, nowMs: T0 });
    expect(state?.questionIds).toHaveLength(4);
    expect(state?.totalMs).toBe(4 * 77_000);
    const [started] = await events();
    expect(started).toMatchObject({
      type: 'session_started',
      sessionId: state?.examId,
      at: iso(T0),
      payload: { kind: 'exam', config: { count: 4, requested: 4, shortfall: 0 } },
    });
    expect(loadExamState(user.id)).toEqual(state);
    clearExamState(user.id);
  });

  it('con un banco vacío no arma nada ni registra nada', async () => {
    const { api, user, events } = await setup(0);
    expect(await startExam({ api, user, questions: [], requested: 20, options })).toBeNull();
    expect(await events()).toHaveLength(0);
  });

  it('carga las preguntas con sus opciones', async () => {
    const { api, questions } = await setup(3);
    const bundles = await loadExamBundles(api, [...questions.map((q) => q.id), 'no-existe']);
    expect(bundles.size).toBe(3);
    expect(bundles.get(questions[0]?.id ?? '')?.options).toHaveLength(4);
  });
});

/** Un examen de 4 con una correcta, una fallada con descarte de la correcta, y dos en blanco */
async function finishedExam() {
  const env = await setup(4);
  const state0 = await startExam({
    api: env.api,
    user: env.user,
    questions: env.questions,
    requested: 4,
    options,
    nowMs: T0,
  });
  if (!state0) throw new Error('sin examen');
  const bundles = await loadExamBundles(env.api, state0.questionIds);
  const [first, second] = state0.questionIds as [string, string];
  const optionsOf = (id: string) => bundles.get(id)?.options ?? [];
  const right = (id: string) => optionsOf(id).find((option) => option.isCorrect)?.id ?? '';
  const wrong = (id: string) => optionsOf(id).find((option) => !option.isCorrect)?.id ?? '';

  let state: ExamState = choose(state0, first, right(first), T0 + 10_000).state;
  state = goTo(state, 1, T0 + 20_000);
  state = toggleEliminated(state, second, right(second));
  state = toggleMarked(state, second);
  state = choose(state, second, wrong(second), T0 + 40_000).state;
  state = finishExamState(state, T0 + 50_000, 'completed');
  return { ...env, state, bundles, first, second };
}

describe('cierre del examen', () => {
  it('registra cada respuesta con su XP fechada cuando se eligió, el fin y los errores al repaso', async () => {
    const { api, user, state, bundles, first, second, events, repos } = await finishedExam();
    const closed = await closeExam({
      api,
      user,
      settings: user.settings,
      state,
      bundles,
      events: await events(),
    });

    const all = await events();
    const answered = all.filter((event) => event.type === 'question_answered');
    expect(answered.map((event) => [event.payload.questionVersionId, event.at])).toEqual([
      [first, iso(T0 + 10_000)],
      [second, iso(T0 + 40_000)],
    ]);
    const secondEvent = answered.find((event) => event.payload.questionVersionId === second);
    expect(secondEvent?.payload).toMatchObject({
      correct: false,
      confidence: null,
      changeCount: 0,
      markedForReview: true,
      eliminatedOptionVersionIds: expect.arrayContaining([expect.any(String)]) as string[],
    });
    expect(all.some((event) => event.type === 'xp_awarded')).toBe(true);
    const ended = all.filter((event) => event.type === 'session_ended');
    expect(ended).toHaveLength(1);
    expect(ended[0]).toMatchObject({
      at: iso(T0 + 50_000),
      payload: { kind: 'exam', reason: 'completed', items: 2, correct: 1, durationMs: 50_000 },
    });

    // Solo el error pasa a Mis errores. Lo que quedó en blanco no
    expect(closed).toMatchObject({ sessionEnded: true, queuedErrors: 1 });
    expect(closed.recorded).toEqual([first, second]);
    const notes = await repos.notes.list();
    expect(notes.map((note) => note.sourceQuestionVersionId)).toEqual([second]);
    expect(await repos.decks.get(errorIds.deck(user.id))).toBeDefined();
  });

  it('cerrar otra vez el mismo examen no duplica nada', async () => {
    const { api, user, state, bundles, events } = await finishedExam();
    const input = { api, user, settings: user.settings, bundles };
    const closed = await closeExam({ ...input, state, events: await events() });
    const before = (await events()).length;
    const again = await closeExam({ ...input, state: closed, events: await events() });
    expect(await events()).toHaveLength(before);
    expect(again).toEqual(closed);
  });

  it('dos cierres a la vez comparten el trabajo', async () => {
    const { api, user, state, bundles, events } = await finishedExam();
    const input = { api, user, settings: user.settings, bundles, state, events: [] };
    const [one, two] = await Promise.all([closeExam(input), closeExam(input)]);
    expect(two).toEqual(one);
    const answered = (await events()).filter((event) => event.type === 'question_answered');
    expect(answered).toHaveLength(2);
  });

  it('si se interrumpe a la mitad, retomarlo termina sin duplicar respuestas', async () => {
    const { api, user, state, bundles, events } = await finishedExam();
    let answeredCalls = 0;
    const flaky = {
      repos: api.repos,
      recordEvent: (event: AppEvent) => {
        if (event.type === 'question_answered') answeredCalls += 1;
        // Falla justo al registrar la segunda respuesta
        if (answeredCalls === 2) return Promise.reject(new Error('red'));
        return api.recordEvent(event);
      },
    };
    let saved = state;
    await expect(
      closeExam({
        api: flaky,
        user,
        settings: user.settings,
        state,
        bundles,
        events: [],
        onProgress: (next) => {
          saved = next;
        },
      }),
    ).rejects.toThrow('red');
    expect(saved.recorded).toHaveLength(1);
    expect(saved.sessionEnded).toBe(false);

    const resumed = await closeExam({
      api,
      user,
      settings: user.settings,
      state: saved,
      bundles,
      events: await events(),
    });
    const all = await events();
    expect(all.filter((event) => event.type === 'question_answered')).toHaveLength(2);
    expect(all.filter((event) => event.type === 'session_ended')).toHaveLength(1);
    expect(resumed).toMatchObject({ sessionEnded: true, queuedErrors: 1 });
  });

  it('con el ajuste apagado no manda errores al repaso', async () => {
    const { api, user, state, bundles, events, repos } = await finishedExam();
    const closed = await closeExam({
      api,
      user,
      settings: { ...user.settings, errorsToReview: false },
      state,
      bundles,
      events: await events(),
    });
    expect(closed.queuedErrors).toBe(0);
    expect(await repos.notes.list()).toHaveLength(0);
  });

  it('un examen sin terminar no se cierra', async () => {
    const { api, user, state, bundles, events } = await finishedExam();
    const open = { ...state, finishedAtMs: null, endReason: null };
    const result = await closeExam({
      api,
      user,
      settings: user.settings,
      state: open,
      bundles,
      events: [],
    });
    expect(result).toBe(open);
    expect((await events()).filter((event) => event.type === 'question_answered')).toHaveLength(0);
  });

  it('abandonado queda registrado como abandonado', async () => {
    const env = await setup(2);
    const started = await startExam({
      api: env.api,
      user: env.user,
      questions: env.questions,
      requested: 2,
      options,
      nowMs: T0,
    });
    if (!started) throw new Error('sin examen');
    const bundles = await loadExamBundles(env.api, started.questionIds);
    await closeExam({
      api: env.api,
      user: env.user,
      settings: env.user.settings,
      state: finishExamState(started, T0 + 5000, 'abandoned'),
      bundles,
      events: [],
    });
    const ended = (await env.events()).filter((event) => event.type === 'session_ended');
    expect(ended[0]?.payload).toMatchObject({ reason: 'abandoned', items: 0, correct: 0 });
  });
});
