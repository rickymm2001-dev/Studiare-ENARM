// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { SCREENS } from '@/app/screens';
import { makeQuestionWithOptions, newId } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';
import { usePractice } from './practice';

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

/** Una práctica de una sola pregunta, lista para contestar */
async function startPractice() {
  const { question, options } = makeQuestionWithOptions();
  app = await renderApp(SCREENS.question.path, {
    seed: async (api, user) => {
      await api.repos.questions.addVersion(question, options);
      usePractice.getState().set({
        sessionId: newId(),
        userId: user.id,
        questionIds: [question.id],
        index: 0,
        answers: [],
        startedAt: Date.now(),
        ended: false,
        kind: 'practice',
        duelId: null,
        targetTags: [],
      });
    },
  });
  return { question, options };
}

describe('pantalla de la pregunta', () => {
  it('muestra la pregunta con sus opciones, el aviso de que descartar ayuda y la etiqueta de demostración', async () => {
    const { question } = await startPractice();
    expect(await screen.findByText(question.prompt)).toBeVisible();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByText(t.choice.optionsHint)).toBeVisible();
    expect(screen.getAllByText(t.labels.demoContent).length).toBeGreaterThan(0);
    // Responder pide primero una opción y la confianza
    expect(screen.getByRole('button', { name: t.simulator.answer })).toBeDisabled();
  });

  it('descarta una opción, la guarda con la respuesta y la retroalimentación dice qué se podía descartar', async () => {
    const typing = userEvent.setup();
    const { question } = await startPractice();
    await screen.findByText(question.prompt);

    const radios = screen.getAllByRole('radio');
    await typing.click(radios[0] as HTMLElement);
    // Descarta dos. Como solo una puede ser la correcta, al menos una descartada es incorrecta
    await typing.click(screen.getByRole('button', { name: t.choice.discardOption('D') }));
    await typing.click(screen.getByRole('button', { name: t.choice.discardOption('C') }));
    expect(screen.getByRole('button', { name: t.choice.restoreOption('C') })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // La elegida no se puede descartar
    expect(screen.getByRole('button', { name: t.choice.discardOption('A') })).toBeDisabled();
    await typing.click(screen.getByRole('button', { name: t.simulator.confidence.sure }));
    await typing.click(screen.getByRole('button', { name: t.simulator.answer }));

    // La retroalimentación explica qué se podía descartar y marca lo que descartó
    const review = await screen.findByRole('region', { name: t.simulator.discardReview.title });
    expect(
      within(review).getAllByText(new RegExp(t.simulator.discardReview.youDiscarded))[0],
    ).toBeVisible();

    const { user, api } = app as RenderedApp;
    await waitFor(async () => {
      const answered = (await api.repos.events.query({ userId: user.id })).filter(
        (event) => event.type === 'question_answered',
      );
      expect(answered).toHaveLength(1);
      expect(answered[0]?.payload).toMatchObject({
        questionVersionId: question.id,
        eliminatedOptionVersionIds: [expect.any(String), expect.any(String)],
      });
    });
  });

  it('elegir una opción descartada la vuelve a incluir', async () => {
    const typing = userEvent.setup();
    const { question } = await startPractice();
    await screen.findByText(question.prompt);
    await typing.click(screen.getByRole('button', { name: t.choice.discardOption('B') }));
    expect(screen.getByRole('button', { name: t.choice.restoreOption('B') })).toBeVisible();
    await typing.click(screen.getAllByRole('radio')[1] as HTMLElement);
    expect(screen.getByRole('button', { name: t.choice.discardOption('B') })).toBeDisabled();
    expect(screen.queryByRole('button', { name: t.choice.restoreOption('B') })).toBeNull();
  });

  it('sin una práctica en curso lo dice y lleva a configurarla', async () => {
    app = await renderApp(SCREENS.question.path);
    expect(await screen.findByText(t.simulator.noActive)).toBeVisible();
    expect(screen.getByRole('link', { name: t.simulator.goSetup })).toBeVisible();
  });
});
