// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { makeEnglishCase } from '@/data/testing/english';
import { newId } from '@/data/testing/fixtures';
import { englishText } from '@/i18n/english';
import { t } from '@/i18n/es-MX';
import { usePractice, type PracticeAnswer } from './practice';

vi.setConfig({ testTimeout: 30_000 });

// El confeti usa un canvas que jsdom no trae
vi.mock('@/ui/celebrate', () => ({ celebrate: () => undefined }));

let app: RenderedApp | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const TEXT_STARTED_AT = 5_000_000_000;

/** La retroalimentación de la primera pregunta de un texto de dos, ya contestada con una opción incorrecta */
async function feedbackOfFirstQuestion() {
  const fixture = makeEnglishCase(2);
  const first = fixture.bundles[0];
  if (!first) throw new Error('Sin pregunta de prueba');
  const wrong = first.options.find((option) => !option.isCorrect);
  if (!wrong) throw new Error('Sin opción incorrecta');
  app = await renderApp(SCREENS.feedback.path, {
    seed: async (api, user) => {
      await api.repos.cases.add(fixture.clinicalCase);
      for (const { question, options } of fixture.bundles) {
        await api.repos.questions.addVersion(question, options);
      }
      const answer: PracticeAnswer = {
        questionVersionId: first.question.id,
        optionVersionId: wrong.id,
        correct: false,
        confidence: null,
        msToAnswer: 20_000,
        xp: 0,
        shownOptionIds: first.options.map((option) => option.id),
        eliminatedOptionIds: [],
        correctPosition: 0,
        sentToReview: false,
      };
      usePractice.getState().set({
        sessionId: newId(),
        userId: user.id,
        questionIds: fixture.bundles.map(({ question }) => question.id),
        index: 0,
        answers: [answer],
        startedAt: TEXT_STARTED_AT,
        ended: false,
        kind: 'practice',
        duelId: null,
        targetTags: [],
        section: 'english',
        secondsPerItem: 90,
        caseStartedAt: TEXT_STARTED_AT,
      });
    },
  });
  return fixture;
}

describe('retroalimentación de una pregunta de lectura en inglés (B13, 2.5)', () => {
  it('trae el texto plegado con la fuente a la vista y la explicación en español', async () => {
    const fixture = await feedbackOfFirstQuestion();
    const passage = await screen.findByText(fixture.clinicalCase.vignette);
    expect(passage).not.toBeVisible();
    expect(screen.getByText(englishText.reading.label)).toBeVisible();
    expect(screen.getByText(/Fuente del texto\./)).toBeVisible();
    expect(screen.getByText(/Explicación simulada 1/)).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: englishText.reading.show }));
    expect(passage).toBeVisible();
    expect(passage).toHaveAttribute('lang', 'en');
  });

  it('lo que el alumno tarda en la retroalimentación no cuenta en el tiempo sugerido del texto', async () => {
    const typing = userEvent.setup();
    // La hora que ve la pantalla: llega a la retroalimentación a las 12:00:00 y sigue 45 segundos después
    let now = 6_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    await feedbackOfFirstQuestion();
    await screen.findByRole('button', { name: t.simulator.next });
    now += 45_000;
    await typing.click(screen.getByRole('button', { name: t.simulator.next }));
    await waitFor(() => {
      expect(usePractice.getState().index).toBe(1);
    });
    // El inicio del texto se recorrió los 45 segundos que estuvo leyendo la retroalimentación
    expect(usePractice.getState().caseStartedAt).toBe(TEXT_STARTED_AT + 45_000);
  });

  it('en una práctica en español no toca el inicio del texto', async () => {
    const typing = userEvent.setup();
    let now = 6_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    await feedbackOfFirstQuestion();
    const next = await screen.findByRole('button', { name: t.simulator.next });
    // Ya sembrada, la práctica pasa a ser de español
    act(() => {
      usePractice.getState().set({ section: 'clinical', caseStartedAt: 0 });
    });
    now += 45_000;
    await typing.click(next);
    await waitFor(() => {
      expect(usePractice.getState().index).toBe(1);
    });
    expect(usePractice.getState().caseStartedAt).toBe(0);
  });
});
