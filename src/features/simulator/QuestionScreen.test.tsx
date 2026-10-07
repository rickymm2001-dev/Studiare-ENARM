// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { SCREENS } from '@/app/screens';
import { UserSettingsSchema } from '@/data/schemas/people';
import { makeQuestionWithOptions, newId } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';
import { usePractice } from './practice';

// El confeti usa un canvas que jsdom no trae
vi.mock('@/ui/celebrate', () => ({ celebrate: () => undefined }));

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

/**
 * Una práctica con tantas preguntas como se pida, lista para contestar. En cada una, la opción 1
 * es la correcta y las demás no
 */
async function startPractice(options: { count?: number; settings?: Record<string, unknown> } = {}) {
  const bundles = Array.from({ length: options.count ?? 1 }, () => makeQuestionWithOptions());
  app = await renderApp(SCREENS.question.path, {
    user: { settings: UserSettingsSchema.parse(options.settings ?? {}) },
    seed: async (api, user) => {
      for (const { question, options: rows } of bundles) {
        await api.repos.questions.addVersion(question, rows);
      }
      usePractice.getState().set({
        sessionId: newId(),
        userId: user.id,
        questionIds: bundles.map(({ question }) => question.id),
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
  const [first, second] = bundles as [(typeof bundles)[number], (typeof bundles)[number]];
  return { first, second };
}

/** La opción por su texto, porque el orden en que se muestran las opciones cambia */
const option = (n: number) => screen.getByRole('radio', { name: new RegExp(`Opción ${n}\\b`) });

describe('pantalla de la pregunta', () => {
  it('muestra la pregunta con sus opciones, el aviso de que descartar ayuda y la etiqueta de demostración', async () => {
    const {
      first: { question },
    } = await startPractice();
    expect(await screen.findByText(question.prompt)).toBeVisible();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByText(t.choice.optionsHint)).toBeVisible();
    expect(screen.getAllByText(t.labels.demoContent).length).toBeGreaterThan(0);
    // Responder pide primero una opción. No pregunta la seguridad (D-087)
    expect(screen.getByRole('button', { name: t.simulator.answerAndFinish })).toBeDisabled();
    expect(screen.queryByRole('button', { name: t.simulator.confidence.sure })).toBeNull();
  });

  it('descarta una opción, la guarda con la respuesta y la retroalimentación dice qué se podía descartar', async () => {
    const typing = userEvent.setup();
    const {
      first: { question },
    } = await startPractice({ settings: { practiceFeedback: 'each' } });
    await screen.findByText(question.prompt);

    await typing.click(option(1));
    // Descarta dos de las incorrectas
    const letterOf = (n: number) =>
      /([A-D])\./.exec((option(n).closest('li') as HTMLElement).textContent)?.[1] as string;
    await typing.click(screen.getByRole('button', { name: t.choice.discardOption(letterOf(2)) }));
    await typing.click(screen.getByRole('button', { name: t.choice.discardOption(letterOf(3)) }));
    expect(
      screen.getByRole('button', { name: t.choice.restoreOption(letterOf(3)) }),
    ).toHaveAttribute('aria-pressed', 'true');
    // La elegida no se puede descartar
    expect(
      screen.getByRole('button', { name: t.choice.discardOption(letterOf(1)) }),
    ).toBeDisabled();
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
        confidence: null,
        eliminatedOptionVersionIds: [expect.any(String), expect.any(String)],
      });
    });
  });

  it('elegir una opción descartada la vuelve a incluir', async () => {
    const typing = userEvent.setup();
    const {
      first: { question },
    } = await startPractice();
    await screen.findByText(question.prompt);
    await typing.click(screen.getByRole('button', { name: t.choice.discardOption('B') }));
    expect(screen.getByRole('button', { name: t.choice.restoreOption('B') })).toBeVisible();
    await typing.click(screen.getAllByRole('radio')[1] as HTMLElement);
    expect(screen.getByRole('button', { name: t.choice.discardOption('B') })).toBeDisabled();
    expect(screen.queryByRole('button', { name: t.choice.restoreOption('B') })).toBeNull();
  });

  it('con la retroalimentación al final pasa directo a la siguiente y la última lleva al resumen con la revisión', async () => {
    const typing = userEvent.setup();
    const { first, second } = await startPractice({ count: 2 });
    await screen.findByText(first.question.prompt);
    expect(screen.getByText(t.simulator.progress(1, 2))).toBeVisible();

    // Elige con un clic y responde con Enter, sin pasar por una pantalla de retroalimentación
    await typing.click(option(1));
    await typing.keyboard('{Enter}');
    expect(await screen.findByText(t.simulator.progress(2, 2))).toBeVisible();
    expect(screen.queryByText(t.simulator.whyAttracts)).toBeNull();
    // Con el siguiente, el botón dice que es la última
    expect(screen.getByRole('button', { name: t.simulator.answerAndFinish })).toBeDisabled();

    // Un doble clic en la opción elegida, que es incorrecta, responde sin buscar el botón
    await typing.click(option(2));
    await typing.dblClick(option(2));
    expect(await screen.findByText(t.simulator.summaryTitle)).toBeVisible();
    // La fallada ya viene abierta con su retroalimentación y la acertada está cerrada
    expect(await screen.findByText(t.simulator.whyAttracts)).toBeVisible();
    expect(screen.getAllByText(t.simulator.explanation)).toHaveLength(1);

    const { user, api } = app as RenderedApp;
    await waitFor(async () => {
      const answered = (await api.repos.events.query({ userId: user.id })).filter(
        (event) => event.type === 'question_answered',
      );
      expect(answered.map((event) => event.payload)).toMatchObject([
        { questionVersionId: first.question.id, correct: true },
        { questionVersionId: second.question.id, correct: false },
      ]);
    });
    expect(second.question.id).not.toBe(first.question.id);
  });

  it('se contesta con el teclado, letras eligen, Mayús con la letra descarta y Enter responde', async () => {
    const typing = userEvent.setup();
    const {
      first: { question },
    } = await startPractice({ settings: { practiceFeedback: 'each' } });
    await screen.findByText(question.prompt);
    (document.activeElement as HTMLElement | null)?.blur();

    await typing.keyboard('b');
    expect(screen.getAllByRole('radio')[1]).toBeChecked();
    await typing.keyboard('3');
    expect(screen.getAllByRole('radio')[2]).toBeChecked();
    // Mayús con la letra descarta esa opción y no cambia la elegida
    await typing.keyboard('{Shift>}d{/Shift}');
    expect(screen.getByRole('button', { name: t.choice.restoreOption('D') })).toBeVisible();
    expect(screen.getAllByRole('radio')[2]).toBeChecked();
    await typing.keyboard('{Enter}');
    expect(await screen.findByText(t.simulator.explanation)).toBeVisible();
  });

  it('con la seguridad encendida la pregunta, sin exigirla, y la guarda', async () => {
    const typing = userEvent.setup();
    const {
      first: { question },
    } = await startPractice({ settings: { cardConfidenceStep: true } });
    await screen.findByText(question.prompt);
    await typing.click(screen.getAllByRole('radio')[0] as HTMLElement);
    await typing.click(screen.getByRole('button', { name: t.simulator.confidence.unsure }));
    await typing.click(screen.getByRole('button', { name: t.simulator.answerAndFinish }));
    const { user, api } = app as RenderedApp;
    await waitFor(async () => {
      const answered = (await api.repos.events.query({ userId: user.id })).filter(
        (event) => event.type === 'question_answered',
      );
      expect(answered[0]?.payload).toMatchObject({ confidence: 'unsure' });
    });
  });

  it('sin una práctica en curso lo dice y lleva a configurarla', async () => {
    app = await renderApp(SCREENS.question.path);
    expect(await screen.findByText(t.simulator.noActive)).toBeVisible();
    expect(screen.getByRole('link', { name: t.simulator.goSetup })).toBeVisible();
  });
});
