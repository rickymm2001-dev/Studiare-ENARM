// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { writeStoredFlags } from '@/config/featureFlags';
import { makeEnglishCase } from '@/data/testing/english';
import { makeEvent, newId } from '@/data/testing/fixtures';
import { englishText } from '@/i18n/english';
import { t } from '@/i18n/es-MX';

vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
  localStorage.clear();
});

const copy = englishText.progress;

describe('Progreso con Inglés médico (B13, 2.7)', () => {
  it('sin textos publicados la tarjeta calibra, dice que todavía no hay y no manda a practicar', async () => {
    // El banco de demostración no trae textos en inglés
    app = await renderApp(SCREENS.progress.path);
    const card = await screen.findByRole('region', { name: copy.title }, { timeout: 15_000 });
    expect(within(card).getByText(t.states.calibrating.title)).toBeVisible();
    expect(within(card).getByText(copy.noTexts)).toBeVisible();
    // No pide contestar reactivos que no existen ni lleva a una tarjeta de Simular vacía
    expect(within(card).queryByText(copy.calibrating(20, 0))).toBeNull();
    expect(within(card).queryByRole('link', { name: copy.goPractice })).toBeNull();
    // La tarjeta de ramas sigue contando las ocho, con Inglés médico entre ellas y en neutro
    const branches = screen.getByRole('region', { name: t.topicPicker.title });
    expect(within(branches).getByText(t.branchNames.medical_english as string)).toBeVisible();
  });

  it('con textos publicados y sin respuestas pide los reactivos y lleva a Simular, donde vive la práctica', async () => {
    const fixture = makeEnglishCase(2);
    app = await renderApp(SCREENS.progress.path, {
      seed: async (api) => {
        await api.repos.cases.add(fixture.clinicalCase);
        for (const { question, options } of fixture.bundles) {
          await api.repos.questions.addVersion(question, options);
        }
      },
    });
    const card = await screen.findByRole('region', { name: copy.title }, { timeout: 15_000 });
    expect(within(card).getByText(t.states.calibrating.title)).toBeVisible();
    expect(within(card).getByText(copy.calibrating(20, 0))).toBeVisible();
    expect(within(card).queryByText(copy.noTexts)).toBeNull();
    expect(within(card).getByRole('link', { name: copy.goPractice })).toHaveAttribute(
      'href',
      SCREENS.simulatorSetup.path,
    );
  });

  it('con 20 respuestas de inglés muestra sus cifras y los textos, y no las cuenta como tema a reforzar', async () => {
    const fixture = makeEnglishCase(2);
    const sessionId = newId();
    app = await renderApp(SCREENS.progress.path, {
      seed: async (api, user) => {
        await api.repos.cases.add(fixture.clinicalCase);
        for (const { question, options } of fixture.bundles) {
          await api.repos.questions.addVersion(question, options);
        }
        // Diez intentos del mismo texto de dos preguntas: 20 respuestas, 15 acertadas
        let count = 0;
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const session = attempt === 0 ? sessionId : newId();
          for (const { question, options } of fixture.bundles) {
            const correct = count < 15;
            const chosen = options.find((option) => option.isCorrect === correct) ?? options[0];
            count += 1;
            await api.repos.events.append(
              makeEvent(
                'question_answered',
                {
                  questionVersionId: question.id,
                  optionVersionId: chosen?.id ?? '',
                  correct,
                  confidence: null,
                  msToAnswer: 60_000,
                  changeCount: 0,
                  highlightEnabled: false,
                },
                { userId: user.id, sessionId: session },
              ),
            );
          }
        }
      },
    });
    const card = await screen.findByRole('region', { name: copy.title }, { timeout: 15_000 });
    const stats = await within(card).findByLabelText(copy.statsLabel);
    expect(within(stats).getByText(/^73% \(entre \d+% y \d+%\)$/)).toBeVisible();
    expect(within(stats).getByText(copy.accuracyCaption(15, 20))).toBeVisible();
    expect(within(stats).getByText(copy.pace(60))).toBeVisible();
    // Con textos publicados, desde sus cifras también se puede ir a practicar
    expect(within(card).getByRole('link', { name: copy.goPractice })).toBeVisible();
    // Un solo texto con respuestas, aunque lo haya contestado diez veces
    expect(within(stats).getByText(copy.textsCaption).previousElementSibling).toHaveTextContent(
      '1',
    );
    expect(within(card).queryByText(t.states.calibrating.title)).toBeNull();
    // Las ramas y los focos no cambian por el inglés
    expect(
      screen.queryByText(new RegExp(`${t.progress.focusKinds.topic}.*Comprensión de lectura`)),
    ).toBeNull();
  });

  it('con la bandera apagada no hay tarjeta de inglés', async () => {
    writeStoredFlags({ medicalEnglish: false });
    app = await renderApp(SCREENS.progress.path);
    await screen.findByRole('region', { name: t.topicPicker.title }, { timeout: 15_000 });
    expect(screen.queryByRole('region', { name: copy.title })).toBeNull();
  });
});
