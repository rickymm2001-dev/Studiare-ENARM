// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import type { User } from '@/data/schemas/people';
import { makeEnglishCase, TEST_ENGLISH_SOURCE } from '@/data/testing/english';
import { makeQuestionWithOptions } from '@/data/testing/fixtures';
import type { ExamPlan } from '@/engines/exam';
import { englishText } from '@/i18n/english';
import { t } from '@/i18n/es-MX';
import { startExam } from './examSession';
import { loadExamState } from './examStorage';

vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const options = { highlight: false, askConfidence: false, alerts: true };

/** Un examen de cuatro preguntas. Dos en español y un caso de lectura de dos, al final */
function seedMixedExam() {
  return async (api: DataApi, user: User) => {
    const spanish = [];
    for (const branch of ['internal_medicine', 'pediatrics']) {
      const { question, options: choices } = makeQuestionWithOptions();
      const stored = { ...question, branch };
      await api.repos.questions.addVersion(stored, choices);
      spanish.push(stored);
    }
    const fixture = makeEnglishCase(2);
    await api.repos.cases.add(fixture.clinicalCase);
    const reading = [];
    for (const { question, options: choices } of fixture.bundles) {
      await api.repos.questions.addVersion(question, choices);
      reading.push(question);
    }
    const ids = [...spanish, ...reading].map((question) => question.id);
    const plan: ExamPlan = {
      questionIds: ids,
      requested: 4,
      available: 4,
      shortfall: 0,
      totalMs: 2 * 77_000 + 2 * 90_000,
      sections: {
        clinical: { requested: 2, picked: 2, shortfall: 0, secondsPerQuestion: 77 },
        english: { requested: 2, picked: 2, shortfall: 0, secondsPerQuestion: 90 },
      },
    };
    await startExam({
      api,
      user,
      questions: [...spanish, ...reading],
      requested: 4,
      options,
      plan,
    });
  };
}

describe('examen con su parte en inglés (B13, 3.5)', () => {
  it('el navegador marca los reactivos de inglés con un ícono y la palabra Inglés en su etiqueta', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.exam.path, { seed: seedMixedExam() });
    await screen.findByText(t.exam.progress(1, 4), { exact: true });
    const navigator = screen.getByText(t.exam.navigatorTitle);
    await typing.click(navigator);
    const grid = navigator.closest('details') as HTMLElement;
    // Las de español no llevan la marca. La primera es la actual
    expect(
      within(grid).getByRole('button', { name: t.exam.goToQuestion(1, 'actual, en blanco') }),
    ).toBeVisible();
    expect(
      within(grid).getByRole('button', { name: t.exam.goToQuestion(2, 'en blanco') }),
    ).toBeVisible();
    for (const number of [3, 4]) {
      const button = within(grid).getByRole('button', {
        name: t.exam.goToQuestion(number, `en blanco, ${englishText.exam.navigatorTag}`),
      });
      expect(button.querySelector('svg.lucide-languages')).not.toBeNull();
    }
    // La leyenda explica el ícono
    expect(within(grid).getByText(englishText.exam.navigatorTag)).toBeVisible();
  });

  it('al llegar a la primera pregunta de un texto el foco va al texto, y en las demás del texto al enunciado', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.exam.path, { seed: seedMixedExam() });
    await screen.findByText(t.exam.progress(1, 4), { exact: true });
    // En español el foco sigue yendo al enunciado
    await typing.click(screen.getByRole('button', { name: t.exam.next }));
    const spanish = await screen.findByRole('heading', { level: 2, name: /Pregunta 2 de 4/ });
    await waitFor(() => {
      expect(spanish).toHaveFocus();
    });
    // La 3 es la primera de su texto, y el texto va antes del enunciado: el foco va al texto, que lleva
    // su nombre y dice en qué pregunta va
    await typing.click(screen.getByRole('button', { name: t.exam.next }));
    const passage = await screen.findByRole('region', { name: englishText.reading.label });
    await waitFor(() => {
      expect(passage).toHaveFocus();
    });
    expect(passage).toHaveAccessibleDescription(/Pregunta 3 de 4/);
    expect(passage).toBeVisible();
    // La 4 es la segunda del texto: el foco va al enunciado
    await typing.click(screen.getByRole('button', { name: t.exam.next }));
    const prompt = await screen.findByRole('heading', { level: 2, name: /Pregunta 4 de 4/ });
    await waitFor(() => {
      expect(prompt).toHaveFocus();
    });
    // Volver a la primera del texto lleva otra vez el foco al texto
    await typing.click(screen.getByRole('button', { name: t.exam.previous }));
    const again = await screen.findByRole('region', { name: englishText.reading.label });
    await waitFor(() => {
      expect(again).toHaveFocus();
    });
    expect(again).toHaveAccessibleDescription(/Pregunta 3 de 4/);
  });

  it('la pregunta de inglés lleva el texto, la pregunta y las opciones en inglés con su fuente', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.exam.path, { seed: seedMixedExam() });
    await screen.findByText(t.exam.progress(1, 4), { exact: true });
    // En español no hay nada de inglés
    expect(screen.queryByText(englishText.reading.label)).toBeNull();
    await typing.click(screen.getByRole('button', { name: t.exam.next }));
    await typing.click(screen.getByRole('button', { name: t.exam.next }));
    const prompt = await screen.findByRole('heading', { level: 2, name: /Pregunta 3 de 4/ });
    expect(prompt).toHaveAttribute('lang', 'en');
    // El número de pregunta es de la interfaz y se oye en español
    expect(within(prompt).getByText(/Pregunta 3 de 4/)).toHaveAttribute('lang', 'es');
    expect(screen.getByText(englishText.reading.label)).toBeVisible();
    expect(screen.getByText(/Simulated reading passage/)).toHaveAttribute('lang', 'en');
    expect(screen.getByText(/Fuente del texto\./)).toHaveTextContent(TEST_ENGLISH_SOURCE);
    for (const option of screen.getAllByRole('radio')) {
      expect(
        within(option.closest('label') as HTMLElement).getByText(/English option/),
      ).toHaveAttribute('lang', 'en');
    }
    // En el examen no se muestra el tiempo sugerido del texto: el reloj es el del examen completo
    expect(screen.queryByText(/Tiempo sugerido para este texto/)).toBeNull();
    // La segunda pregunta del texto lo trae plegado en el teléfono
    await typing.click(screen.getByRole('button', { name: t.exam.next }));
    await screen.findByRole('heading', { level: 2, name: /Pregunta 4 de 4/ });
    expect(screen.getByText(/Simulated reading passage/)).not.toBeVisible();
    await typing.click(screen.getByRole('button', { name: englishText.reading.show }));
    expect(screen.getByText(/Simulated reading passage/)).toBeVisible();
  });

  it('al terminar, los resultados cortan por sección y ponen Inglés médico aparte de las siete ramas', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.exam.path, { seed: seedMixedExam() });
    await screen.findByText(t.exam.progress(1, 4), { exact: true });
    // Contesta la primera de español (la correcta es la primera opción de la prueba)
    await typing.click(screen.getAllByRole('radio')[0] as HTMLElement);
    await typing.click(screen.getByRole('button', { name: t.exam.finish }));
    await typing.click(await screen.findByRole('button', { name: t.exam.finishConfirm }));
    await screen.findByRole('heading', { level: 1, name: t.screens.examResults.title });
    const sections = await screen.findByRole('region', {
      name: englishText.results.sectionsTitle,
    });
    expect(within(sections).getByText(/^Español \d+ de 2$/)).toBeVisible();
    expect(within(sections).getByText('Inglés 0 de 2')).toBeVisible();
    expect(within(sections).getByText(englishText.results.sectionsHint)).toBeVisible();
    // El corte por rama deja a Inglés médico aparte, con su nombre
    const branches = screen.getByRole('region', { name: t.examResults.branchesTitle });
    expect(within(branches).getByText(englishText.results.aside)).toBeVisible();
    expect(within(branches).getByText(t.branchNames.medical_english as string)).toBeVisible();
    await waitFor(() => {
      expect(loadExamState(app?.user.id ?? '')?.sessionEnded).toBe(true);
    });
  });
});
