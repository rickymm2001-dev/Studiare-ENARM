// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { SCREENS } from '@/app/screens';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { makeEnglishCase, TEST_ENGLISH_SOURCE } from '@/data/testing/english';
import { newId } from '@/data/testing/fixtures';
import { englishText } from '@/i18n/english';
import { t } from '@/i18n/es-MX';
import type * as DemoContent from '@/demo/content';
import { usePractice } from './practice';

// El confeti usa un canvas que jsdom no trae
vi.mock('@/ui/celebrate', () => ({ celebrate: () => undefined }));

// El diccionario de estructura del banco todavía no trae el bloque en inglés en esta rama. La prueba lo
// pone para comprobar que la pantalla resalta con las negaciones en inglés y no con las del español
vi.mock('@/demo/content', async (importOriginal) => {
  const actual = await importOriginal<typeof DemoContent>();
  return {
    ...actual,
    structureDictionary: {
      ...actual.structureDictionary,
      english: {
        negations: [{ id: 'except', pattern: 'except', kind: 'exception' }],
        falsePositives: [],
      },
    },
  };
});

let app: RenderedApp | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

/** Una práctica de un caso de lectura, parada en la pregunta que se pida */
async function startReading(options: { items?: number; at?: number; prompt?: string } = {}) {
  const fixture = makeEnglishCase(
    options.items ?? 2,
    options.prompt ? { prompt: options.prompt } : {},
  );
  app = await renderApp(SCREENS.question.path, {
    seed: async (api, user) => {
      await api.repos.cases.add(fixture.clinicalCase);
      for (const { question, options: rows } of fixture.bundles) {
        await api.repos.questions.addVersion(question, rows);
      }
      usePractice.getState().set({
        sessionId: newId(),
        userId: user.id,
        questionIds: fixture.bundles.map(({ question }) => question.id),
        index: options.at ?? 0,
        answers: [],
        startedAt: Date.now(),
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

describe('pregunta de lectura en inglés (B13, 2.3)', () => {
  it('muestra el texto, la pregunta y las opciones en inglés con su fuente, y la interfaz en español', async () => {
    const fixture = await startReading();
    const first = fixture.bundles[0]?.question;
    const prompt = await screen.findByText(first?.prompt ?? '');
    // El texto, la pregunta y las opciones los dice el lector de pantalla en inglés
    const passage = screen.getByText(fixture.clinicalCase.vignette);
    expect(passage).toHaveAttribute('lang', 'en');
    expect(prompt.closest('[lang="en"]')).not.toBeNull();
    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(4);
    for (const option of options) {
      expect(
        within(option.closest('label') as HTMLElement).getByText(/English option/),
      ).toHaveAttribute('lang', 'en');
    }
    // La etiqueta y la fuente son de la interfaz, en español, y la fuente trae su licencia
    expect(screen.getByText(englishText.reading.label)).toBeVisible();
    expect(screen.getByText(/Fuente del texto\./)).toHaveTextContent(TEST_ENGLISH_SOURCE);
    expect(screen.queryByText(t.simulator.caseLabel)).toBeNull();
    // La primera pregunta del texto lo trae abierto y sin botón para plegarlo
    expect(passage).toBeVisible();
    expect(screen.queryByRole('button', { name: englishText.reading.hide })).toBeNull();
  });

  it('dice el tiempo sugerido del texto, que es el número de preguntas por los segundos por reactivo', async () => {
    await startReading({ items: 2 });
    // 2 preguntas por 90 segundos son 3:00. Sin pasarse, ningún aviso
    expect(await screen.findByText(/Tiempo sugerido para este texto 3:00/)).toBeVisible();
    expect(screen.getByText(englishText.reading.position(1, 2))).toBeVisible();
    expect(screen.queryByText(/arriba del tiempo sugerido/)).toBeNull();
  });

  it('usa los segundos sugeridos que quedaron al empezar la práctica', async () => {
    const fixture = makeEnglishCase(3);
    app = await renderApp(SCREENS.question.path, {
      seed: async (api, user) => {
        await api.repos.cases.add(fixture.clinicalCase);
        for (const { question, options: rows } of fixture.bundles) {
          await api.repos.questions.addVersion(question, rows);
        }
        usePractice.getState().set({
          sessionId: newId(),
          userId: user.id,
          questionIds: fixture.bundles.map(({ question }) => question.id),
          index: 0,
          answers: [],
          startedAt: Date.now(),
          ended: false,
          kind: 'practice',
          duelId: null,
          targetTags: [],
          section: 'english',
          secondsPerItem: 60,
          caseStartedAt: 0,
        });
      },
    });
    // 3 por 60 son 3:00 y no 4:30, que saldría con el umbral de fábrica de 90
    expect(await screen.findByText(/Tiempo sugerido para este texto 3:00/)).toBeVisible();
    expect(DEFAULT_THRESHOLDS.english.secondsPerItem).toBe(90);
  });

  it('al pasarse del tiempo sugerido sale la línea de aviso con los segundos de más y nada se detiene', async () => {
    const realNow = Date.now.bind(Date);
    let skew = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + skew);
    await startReading({ items: 2 });
    await screen.findByText(/Tiempo sugerido para este texto 3:00/);
    // Pasan 3 minutos con 40 segundos. El reloj de la pantalla lo nota en su siguiente segundo
    skew = 220_000;
    const warning = await screen.findByText(
      /Vas \d+ segundos arriba del tiempo sugerido/,
      undefined,
      {
        timeout: 5000,
      },
    );
    expect(warning).toBeVisible();
    const seconds = Number(/Vas (\d+) segundos/.exec(warning.textContent)?.[1]);
    expect(seconds).toBeGreaterThanOrEqual(40);
    expect(seconds).toBeLessThan(45);
    // El lector de pantalla oye una sola vez que se pasó, en su región de aviso
    expect(screen.getByText(englishText.reading.overAnnounce)).toBeInTheDocument();
    // Sigue pudiendo contestar
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });

  it('desde la segunda pregunta del texto lo trae plegado en el teléfono y Ver el texto lo abre', async () => {
    const typing = userEvent.setup();
    const fixture = await startReading({ items: 2, at: 1 });
    await screen.findByText(fixture.bundles[1]?.question.prompt ?? '');
    const passage = screen.getByText(fixture.clinicalCase.vignette);
    expect(passage).not.toBeVisible();
    // La fuente se queda a la vista aunque el texto esté plegado
    expect(screen.getByText(/Fuente del texto\./)).toBeVisible();
    expect(screen.getByText(englishText.reading.position(2, 2))).toBeVisible();
    const show = screen.getByRole('button', { name: englishText.reading.show });
    expect(show).toHaveAttribute('aria-expanded', 'false');
    await typing.click(show);
    expect(passage).toBeVisible();
    expect(screen.getByRole('button', { name: englishText.reading.hide })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('una pregunta suelta en inglés es un texto de una pregunta y su viñeta propia es el texto', async () => {
    const fixture = await startReading({ items: 1 });
    const question = fixture.bundles[0]?.question;
    expect(question?.caseId).toBeNull();
    expect(await screen.findByText(/Tiempo sugerido para este texto 1:30/)).toBeVisible();
    expect(screen.getByText(fixture.clinicalCase.vignette)).toHaveAttribute('lang', 'en');
    // Un texto de una sola pregunta no dice en qué lugar va
    expect(screen.queryByText(/Pregunta \d+ de \d+ de este texto/)).toBeNull();
  });

  it('resalta las negaciones de la pregunta con las del inglés', async () => {
    await startReading({ items: 1, prompt: '[Prueba] All of these are true EXCEPT which one?' });
    const mark = await screen.findByText('EXCEPT');
    expect(mark.tagName).toBe('MARK');
  });

  it('contestar la primera pregunta pasa a la segunda del texto, que sigue con su fuente a la vista', async () => {
    const typing = userEvent.setup();
    const fixture = await startReading({ items: 2 });
    await screen.findByText(fixture.bundles[0]?.question.prompt ?? '');
    await typing.click(screen.getAllByRole('radio')[0] as HTMLElement);
    await typing.click(screen.getByRole('button', { name: t.simulator.answerAndNext }));
    await waitFor(() => {
      expect(usePractice.getState().answers).toHaveLength(1);
    });
    // Con la retroalimentación al final pasa a la siguiente pregunta del texto, con la fuente a la vista
    expect(await screen.findByText(fixture.bundles[1]?.question.prompt ?? '')).toBeInTheDocument();
    expect(usePractice.getState().index).toBe(1);
    expect(screen.getByText(/Fuente del texto\./)).toBeVisible();
  });

  it('el tiempo del texto no se cuenta en una práctica en español', async () => {
    const { makeQuestionWithOptions } = await import('@/data/testing/fixtures');
    const spanish = makeQuestionWithOptions();
    app = await renderApp(SCREENS.question.path, {
      seed: async (api, user) => {
        await api.repos.questions.addVersion(spanish.question, spanish.options);
        usePractice.getState().set({
          sessionId: newId(),
          userId: user.id,
          questionIds: [spanish.question.id],
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
    await screen.findByText(spanish.question.prompt);
    expect(screen.queryByText(/Tiempo sugerido para este texto/)).toBeNull();
    expect(screen.queryByText(englishText.reading.label)).toBeNull();
    expect(screen.getByText(t.simulator.caseLabel)).toBeVisible();
    for (const option of screen.getAllByRole('radio')) {
      expect(option.closest('label')?.querySelector('[lang]')).toBeNull();
    }
  });
});
