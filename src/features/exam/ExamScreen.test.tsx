// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import type { User } from '@/data/schemas/people';
import { makeQuestionWithOptions } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';
import { DEFAULT_APPEARANCE } from '@/ui/appearance';
import { startExam } from './examSession';
import { loadExamState, saveExamState } from './examStorage';

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const options = { highlight: false, askConfidence: false, alerts: true };

/** Un examen de 3 preguntas ya armado, con su estado guardado en el navegador */
function seedExam(adjust?: (state: NonNullable<ReturnType<typeof loadExamState>>) => void) {
  return async (api: DataApi, user: User) => {
    const questions = [];
    for (const branch of ['internal_medicine', 'pediatrics', 'internal_medicine']) {
      const { question, options: choices } = makeQuestionWithOptions();
      const stored = { ...question, branch };
      await api.repos.questions.addVersion(stored, choices);
      questions.push(stored);
    }
    await startExam({ api, user, questions, requested: 3, options });
    if (adjust) {
      const state = loadExamState(user.id);
      if (state) {
        adjust(state);
        saveExamState(state);
      }
    }
  };
}

describe('pantalla del examen', () => {
  it('sin un examen guardado lo dice y lleva a configurarlo', async () => {
    app = await renderApp(SCREENS.exam.path);
    expect(await screen.findByText(t.exam.noActive)).toBeVisible();
    expect(screen.getByRole('link', { name: t.exam.goSetup })).toBeVisible();
  });

  it('muestra la primera pregunta con su reloj, sin decir si acertó', async () => {
    app = await renderApp(SCREENS.exam.path, { seed: seedExam() });
    expect(await screen.findByText(t.exam.progress(1, 3), { exact: true })).toBeVisible();
    expect(screen.getByRole('timer')).toBeVisible();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    // Nada de retroalimentación hasta los resultados
    expect(screen.queryByText(t.simulator.correct)).toBeNull();
  });

  it('al cambiar de pregunta el foco pasa al enunciado, que dice en cuál va', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.exam.path, { seed: seedExam() });
    await screen.findByText(t.exam.progress(1, 3), { exact: true });
    // La primera pregunta no le quita el foco a la página
    expect(document.activeElement?.tagName).toBe('BODY');
    await typing.click(screen.getByRole('button', { name: t.exam.next }));
    const prompt = await screen.findByRole('heading', { level: 2, name: /Pregunta 2 de 3/ });
    await waitFor(() => {
      expect(prompt).toHaveFocus();
    });
  });

  it('guarda la respuesta, el descarte y la marca en el navegador al instante', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.exam.path, { seed: seedExam() });
    await screen.findByText(t.exam.progress(1, 3), { exact: true });
    await typing.click(screen.getAllByRole('radio')[0] as HTMLElement);
    await typing.click(screen.getByRole('button', { name: t.choice.discardOption('C') }));
    await typing.click(screen.getByRole('button', { name: t.exam.mark }));
    const stored = loadExamState(app.user.id);
    const first = stored?.questionIds[0] ?? '';
    expect(stored?.answers[first]).toMatchObject({
      marked: true,
      eliminated: [expect.any(String)],
    });
    expect(stored?.answers[first]?.optionId).not.toBeNull();
  });

  it('marcar con el ratón y después Enter avanza, sin volver a alternar la marca', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.exam.path, { seed: seedExam() });
    await screen.findByText(t.exam.progress(1, 3), { exact: true });
    await typing.click(screen.getByRole('button', { name: t.exam.mark }));
    // El foco pasó al enunciado, así que Enter es el atajo de siguiente y no el botón de marcar
    expect(screen.getByRole('heading', { level: 2, name: /Pregunta 1 de 3/ })).toHaveFocus();
    await typing.keyboard('{Enter}');
    expect(await screen.findByText(t.exam.progress(2, 3), { exact: true })).toBeVisible();
    const stored = loadExamState(app.user.id);
    expect(stored?.answers[stored.questionIds[0] ?? '']?.marked).toBe(true);
    // Con el teclado el botón sigue siendo un botón. Enter sobre él alterna la marca de esta pregunta
    screen.getByRole('button', { name: t.exam.mark }).focus();
    await typing.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: t.exam.unmark })).toHaveFocus();
    expect(screen.getByText(t.exam.progress(2, 3), { exact: true })).toBeVisible();
  });

  it('terminar pide confirmar, avisa lo que queda en blanco y lleva a los resultados', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.exam.path, { seed: seedExam() });
    await screen.findByText(t.exam.progress(1, 3), { exact: true });
    await typing.click(screen.getAllByRole('radio')[0] as HTMLElement);
    await typing.click(screen.getByRole('button', { name: t.exam.finish }));
    expect(await screen.findByText(t.exam.finishBody(1, 2, 0))).toBeVisible();
    await typing.click(screen.getByRole('button', { name: t.exam.finishConfirm }));
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.examResults.title }),
    ).toBeVisible();
    expect(loadExamState(app.user.id)?.endReason).toBe('completed');
  });

  it('con el tiempo agotado cierra solo por tiempo y no deja contestar más', async () => {
    app = await renderApp(SCREENS.exam.path, {
      seed: seedExam((state) => {
        // Le quedan unos 300 ms
        state.startedAtMs = Date.now() - state.totalMs + 300;
      }),
    });
    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: t.screens.examResults.title },
        {
          timeout: 8000,
        },
      ),
    ).toBeVisible();
    const state = loadExamState(app.user.id);
    expect(state?.endReason).toBe('time_up');
    // Lo que se alcanzó a ver no cuenta como contestado
    expect(Object.values(state?.answers ?? {}).every((answer) => answer.optionId === null)).toBe(
      true,
    );
  });

  // Modo enfoque (respuesta 82 del plan del cambio, B7)
  it('los resultados dicen el XP, salvo en modo enfoque', async () => {
    const finishExam = async () => {
      const typing = userEvent.setup();
      app = await renderApp(SCREENS.exam.path, { seed: seedExam() });
      await screen.findByText(t.exam.progress(1, 3), { exact: true });
      await typing.click(screen.getAllByRole('radio')[0] as HTMLElement);
      await typing.click(screen.getByRole('button', { name: t.exam.finish }));
      await typing.click(await screen.findByRole('button', { name: t.exam.finishConfirm }));
      return screen.findByRole('region', { name: t.examResults.summaryTitle });
    };
    const summary = await finishExam();
    expect(await within(summary).findByText(/^\+\d+ XP$/)).toBeVisible();

    cleanup();
    await resetApp(app?.api);
    usePreferences.setState({ appearance: { ...DEFAULT_APPEARANCE, focusMode: true } });
    const focused = await finishExam();
    expect(within(focused).getByText(t.examResults.notPrediction)).toBeVisible();
    expect(within(focused).queryByText(/XP/)).toBeNull();
  });
});
