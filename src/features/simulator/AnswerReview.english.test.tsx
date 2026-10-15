// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { UserSettingsSchema } from '@/data/schemas/people';
import { makeEnglishCase } from '@/data/testing/english';
import { newId } from '@/data/testing/fixtures';
import { englishText } from '@/i18n/english';
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

/** La retroalimentación de una pregunta de lectura contestada mal, al terminar la primera de dos */
async function failedReading(path: string) {
  const fixture = makeEnglishCase(2);
  const first = fixture.bundles[0] as (typeof fixture.bundles)[number];
  const wrong = first.options.find((option) => !option.isCorrect);
  if (!wrong) throw new Error('Sin distractor');
  app = await renderApp(path, {
    user: { settings: UserSettingsSchema.parse({ practiceFeedback: 'each' }) },
    seed: async (api, user) => {
      await api.repos.cases.add(fixture.clinicalCase);
      for (const { question, options } of fixture.bundles) {
        await api.repos.questions.addVersion(question, options);
      }
      usePractice.getState().set({
        sessionId: newId(),
        userId: user.id,
        questionIds: fixture.bundles.map(({ question }) => question.id),
        index: 0,
        answers: [
          {
            questionVersionId: first.question.id,
            optionVersionId: wrong.id,
            correct: false,
            confidence: null,
            msToAnswer: 30_000,
            xp: 1,
            shownOptionIds: first.options.map((option) => option.id),
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
        section: 'english',
        secondsPerItem: 90,
        caseStartedAt: 0,
      });
    },
  });
  return fixture;
}

describe('retroalimentación de una pregunta de lectura en inglés (B13, 2.5)', () => {
  it('muestra el texto plegado con la fuente a la vista y la explicación en español', async () => {
    const typing = userEvent.setup();
    const fixture = await failedReading(SCREENS.feedback.path);
    const first = fixture.bundles[0]?.question;
    expect(await screen.findByText(t.simulator.incorrect)).toBeVisible();
    // El texto está plegado, la fuente se ve y se abre con Ver el texto
    const passage = screen.getByText(fixture.clinicalCase.vignette);
    expect(passage).toHaveAttribute('lang', 'en');
    expect(passage).not.toBeVisible();
    expect(screen.getAllByText(/Fuente del texto\./)).toHaveLength(1);
    await typing.click(screen.getByRole('button', { name: englishText.reading.show }));
    expect(passage).toBeVisible();
    // La pregunta y las opciones van en inglés y la explicación y las justificaciones en español
    expect(screen.getAllByText(first?.prompt ?? '')[0]).toHaveAttribute('lang', 'en');
    const result = screen.getByRole('region', { name: new RegExp(t.simulator.incorrect) });
    for (const option of within(result).getAllByText(/English option/)) {
      expect(option).toHaveAttribute('lang', 'en');
    }
    const explanation = screen.getByRole('region', { name: t.simulator.explanation });
    expect(within(explanation).getByText(first?.explanation ?? '')).not.toHaveAttribute('lang');
    // La fuente del texto no se repite entre las referencias por verificar
    expect(within(explanation).queryByText(t.simulator.references)).toBeNull();
  });

  it('en el resumen de la sesión también va plegado y con su fuente, y la pregunta se lee en inglés', async () => {
    const typing = userEvent.setup();
    const fixture = await failedReading(SCREENS.sessionSummary.path);
    const first = fixture.bundles[0]?.question;
    const row = await screen.findByText(first?.prompt ?? '');
    expect(row).toHaveAttribute('lang', 'en');
    // La respuesta fallada ya viene abierta con la retroalimentación al final, pero aquí es por pregunta
    await typing.click(row);
    expect(await screen.findByText(/Fuente del texto\./)).toBeVisible();
    expect(screen.getByRole('button', { name: englishText.reading.show })).toBeVisible();
  });
});
