// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import type { AppEvent, EventOf } from '@/data/schemas/events';
import type { User } from '@/data/schemas/people';
import { makeQuestionWithOptions } from '@/data/testing/fixtures';
import { buildSnapshot } from '@/features/home/snapshot';
import { t } from '@/i18n/core';
import { closeExam, startExam } from './examSession';
import { choose, finishExamState, isClosed, isFinished } from './examState';
import { loadExamState, saveExamState } from './examStorage';

// Cada prueba arma la app completa y cierra un examen, así que necesita más de 5 segundos
vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 20_000 };
const options = { highlight: false, askConfidence: false, alerts: false };

/** La bitácora del alumno, por tipo */
async function eventsOf<T extends AppEvent['type']>(
  api: DataApi,
  userId: string,
  type: T,
): Promise<EventOf<T>[]> {
  return (await api.repos.events.query({ userId })).filter(
    (event): event is EventOf<T> => event.type === type,
  );
}

/**
 * Un examen de dos preguntas, la primera acertada y la segunda fallada. Terminado por el alumno y,
 * si se pide, con el cierre cortado justo después de registrar la primera respuesta, como cuando el
 * teléfono cierra la pestaña mientras Resultados dice Guardando tus respuestas
 */
function seedExam(mode: 'in_progress' | 'finished' | 'cut_mid_close') {
  return async (api: DataApi, user: User) => {
    const pairs = [makeQuestionWithOptions(), makeQuestionWithOptions()];
    for (const { question, options: choices } of pairs) {
      await api.repos.questions.addVersion(question, choices);
    }
    const started = await startExam({
      api,
      user,
      questions: pairs.map(({ question }) => question),
      requested: 2,
      options,
    });
    if (!started) throw new Error('No se armó el examen');
    const now = Date.now();
    const [firstId, secondId] = started.questionIds as [string, string];
    const optionsOf = (id: string) => pairs.find(({ question }) => question.id === id)?.options;
    const right = optionsOf(firstId)?.find((option) => option.isCorrect)?.id;
    const wrong = optionsOf(secondId)?.find((option) => !option.isCorrect)?.id;
    if (!right || !wrong) throw new Error('Sin opciones');
    let state = choose(started, firstId, right, now - 20_000).state;
    state = choose(state, secondId, wrong, now - 10_000).state;
    if (mode === 'in_progress') {
      saveExamState(state);
      return;
    }
    state = finishExamState(state, now - 5000, 'completed');
    saveExamState(state);
    if (mode === 'finished') return;

    // El cierre se corta al registrar la segunda respuesta. Lo que avanzó queda guardado
    let answeredCalls = 0;
    const flaky: Pick<DataApi, 'repos' | 'recordEvent'> = {
      repos: api.repos,
      recordEvent: (event) => {
        if (event.type === 'question_answered') answeredCalls += 1;
        if (answeredCalls === 2) return Promise.reject(new Error('pestaña cerrada'));
        return api.recordEvent(event);
      },
    };
    const { loadExamBundles } = await import('./examSession');
    const bundles = await loadExamBundles(api, state.questionIds);
    await expect(
      closeExam({ api: flaky, user, settings: user.settings, state, bundles, events: [] }),
    ).rejects.toThrow('pestaña cerrada');
    const cut = loadExamState(user.id);
    if (cut?.recorded.length !== 1 || cut.sessionEnded) throw new Error('No se cortó');
  };
}

describe('cierre pendiente del examen al arrancar la app (V5-B0)', () => {
  it('desde Inicio termina de cerrar un examen que se cortó a la mitad, con su XP y sus errores', async () => {
    app = await renderApp(SCREENS.home.path, { seed: seedExam('cut_mid_close') });
    const { api, user } = app;

    await waitFor(() => {
      const stored = loadExamState(user.id);
      expect(stored !== null && isClosed(stored)).toBe(true);
    }, WAIT);

    // Las dos respuestas, una sola vez cada una, el fin de la sesión y el XP
    const closed = loadExamState(user.id);
    const answered = await eventsOf(api, user.id, 'question_answered');
    expect(answered.map((event) => event.payload.questionVersionId).sort()).toEqual(
      [...(closed?.questionIds ?? [])].sort(),
    );
    expect(await eventsOf(api, user.id, 'session_ended')).toHaveLength(1);
    const xp = await eventsOf(api, user.id, 'xp_awarded');
    expect(xp.length).toBeGreaterThan(0);
    expect(closed).toMatchObject({ sessionEnded: true, correct: 1, queuedErrors: 1 });
    expect(closed?.xp).toBeGreaterThan(0);

    // La fallada ya está en Mis errores
    const notes = await api.repos.notes.list();
    expect(notes.map((note) => note.sourceQuestionVersionId)).toEqual([closed?.questionIds[1]]);

    // Y el XP se ve en la barra de arriba, sin pasar por Resultados
    const events = await api.repos.events.query({ userId: user.id });
    const { level, totalXp } = buildSnapshot({
      events,
      user,
      settings: user.settings,
      now: new Date(),
    });
    expect(totalXp).toBe(closed?.xp);
    expect(
      await screen.findByText(t.headerStats.chip(level.level, totalXp), {}, WAIT),
    ).toBeInTheDocument();
  });

  it('un examen que terminó sin registrar nada también se cierra solo', async () => {
    app = await renderApp(SCREENS.home.path, { seed: seedExam('finished') });
    const { api, user } = app;
    await waitFor(() => {
      const stored = loadExamState(user.id);
      expect(stored !== null && isClosed(stored)).toBe(true);
    }, WAIT);
    expect(await eventsOf(api, user.id, 'question_answered')).toHaveLength(2);
    expect(await eventsOf(api, user.id, 'session_ended')).toHaveLength(1);
  });

  it('un examen en curso no se toca', async () => {
    app = await renderApp(SCREENS.home.path, { seed: seedExam('in_progress') });
    const { api, user } = app;
    // La pantalla solo se pinta cuando la siembra terminó
    await screen.findByRole('heading', { level: 1 }, WAIT);
    const before = loadExamState(user.id);
    expect(before !== null && !isFinished(before)).toBe(true);
    // Tiempo de sobra para que un cierre indebido hubiera empezado
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(loadExamState(user.id)).toEqual(before);
    expect(await eventsOf(api, user.id, 'question_answered')).toHaveLength(0);
    expect(await eventsOf(api, user.id, 'session_ended')).toHaveLength(0);
  });

  it('abrir la app otra vez no duplica nada en la bitácora', async () => {
    app = await renderApp(SCREENS.home.path, { seed: seedExam('finished') });
    const { api, user } = app;
    await waitFor(() => {
      const stored = loadExamState(user.id);
      expect(stored !== null && isClosed(stored)).toBe(true);
    }, WAIT);
    const count = (await api.repos.events.query({ userId: user.id })).length;
    const closed = loadExamState(user.id);

    // La misma cuenta, la misma base y el mismo examen guardado, como al volver a abrir la app
    cleanup();
    app = await renderApp(SCREENS.home.path, { user });
    await screen.findByRole('heading', { level: 1 }, WAIT);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect((await api.repos.events.query({ userId: user.id })).length).toBe(count);
    expect(loadExamState(user.id)).toEqual(closed);
  });
});
