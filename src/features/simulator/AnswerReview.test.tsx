// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { makeQuestionWithOptions, newId } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';
import { usePractice } from './practice';

// El confeti usa un canvas que jsdom no trae
vi.mock('@/ui/celebrate', () => ({ celebrate: () => undefined }));
vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

/** Una práctica de una pregunta ya contestada mal, en el resumen de la sesión */
async function failedPractice() {
  const { question, options } = makeQuestionWithOptions();
  const wrong = options.find((option) => !option.isCorrect);
  if (!wrong) throw new Error('Sin distractor');
  app = await renderApp(SCREENS.sessionSummary.path, {
    seed: async (api, user) => {
      await api.repos.questions.addVersion(question, options);
      usePractice.getState().set({
        sessionId: newId(),
        userId: user.id,
        questionIds: [question.id],
        index: 1,
        answers: [
          {
            questionVersionId: question.id,
            optionVersionId: wrong.id,
            correct: false,
            confidence: null,
            msToAnswer: 30_000,
            xp: 1,
            shownOptionIds: options.map((option) => option.id),
            eliminatedOptionIds: [],
            correctPosition: 0,
            sentToReview: false,
          },
        ],
        startedAt: Date.now() - 60_000,
        ended: false,
        kind: 'practice',
        duelId: null,
        targetTags: [],
      });
    },
  });
  return question;
}

describe('revisión de la práctica (B5)', () => {
  it('el motivo se puede cambiar, cada cambio es un evento nuevo y vale el último', async () => {
    const typing = userEvent.setup();
    const question = await failedPractice();
    const group = await screen.findByRole(
      'group',
      { name: t.examReview.motives.legend },
      { timeout: 20_000 },
    );
    await typing.click(within(group).getByRole('button', { name: t.review.causes.anxiety }));
    await typing.click(within(group).getByRole('button', { name: t.review.causes.fatigue }));
    expect(within(group).getByRole('button', { name: t.review.causes.fatigue })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(group).getByRole('button', { name: t.review.causes.anxiety })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    const { api, user } = app as RenderedApp;
    await waitFor(async () => {
      const reported = await api.repos.events.query({ userId: user.id, types: ['cause_reported'] });
      expect(reported.map((event) => event.payload)).toEqual([
        { targetKind: 'question', targetId: question.id, cause: 'anxiety' },
        { targetKind: 'question', targetId: question.id, cause: 'fatigue' },
      ]);
    });
    // Y la pregunta se puede volver tarjeta desde aquí. En el resumen hay una revisión por pregunta,
    // así que el botón lleva su número para no sonar igual que los demás
    const create = screen.getByRole('button', { name: t.examReview.createCard.buttonLabel('1') });
    expect(create).toBeVisible();
    expect(create).toHaveTextContent(t.examReview.createCard.button);
  });

  it('avisa junto a Crear tarjeta cuando ya creaste una con la pregunta, sin bloquear el botón, y el aviso sigue al recargar', async () => {
    const typing = userEvent.setup();
    const text = t.examReview.createCard;
    await failedPractice();
    const button = await screen.findByRole(
      'button',
      { name: text.buttonLabel('1') },
      { timeout: 20_000 },
    );
    // Sin tarjeta no hay aviso y el botón no lleva descripción
    expect(screen.queryByText(text.alreadyCreated)).toBeNull();
    expect(button).not.toHaveAccessibleDescription();

    // Con tarjeta, en un mazo nuevo. El aviso sale al momento junto al botón, que lo lleva como
    // descripción para el lector de pantalla y sigue activo para hacer otra en otro mazo
    await typing.click(button);
    const dialog = await screen.findByRole('dialog', { name: text.title });
    const select = within(dialog).getByRole('combobox', { name: text.deck });
    await typing.selectOptions(
      select,
      within(select).getByRole('option', { name: text.newDeckOption }),
    );
    await typing.type(within(dialog).getByLabelText(text.newDeckName), 'Repaso de la práctica');
    await typing.click(within(dialog).getByRole('button', { name: text.save }));
    await within(dialog).findByText(text.saved('Repaso de la práctica'));
    await typing.click(within(dialog).getByRole('button', { name: text.close }));
    expect(await screen.findByText(text.alreadyCreated)).toBeVisible();
    expect(button).toHaveAccessibleDescription(text.alreadyCreated);
    expect(button).toBeEnabled();

    // Al recargar el aviso se lee otra vez de la bitácora
    const { user } = app as RenderedApp;
    cleanup();
    app = await renderApp(SCREENS.sessionSummary.path, { user });
    const reloaded = await screen.findByRole(
      'button',
      { name: text.buttonLabel('1') },
      { timeout: 20_000 },
    );
    expect(await screen.findByText(text.alreadyCreated)).toBeVisible();
    expect(reloaded).toHaveAccessibleDescription(text.alreadyCreated);
  });
});
