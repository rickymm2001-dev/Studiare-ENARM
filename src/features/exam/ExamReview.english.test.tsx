// @vitest-environment jsdom
// Crear tarjeta desde una pregunta de Inglés médico en la revisión del examen (B13, hallazgo 11 de la revisión
// independiente). La tarjeta llega armada con el texto del banco, y lo que sigue en inglés al guardarla va
// marcado con lang="en", para que el lector de pantalla lo diga en inglés. Todo es simulado.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { createCardSanitizer } from '@/data/content/cardHtml';
import type { DataApi } from '@/data/context';
import type { User } from '@/data/schemas/people';
import { makeEnglishCase } from '@/data/testing/english';
import type { ExamPlan } from '@/engines/exam';
import { createManualDeck, draftOf } from '@/data/usecases/manualDecks';
import { t } from '@/i18n/es-MX';
import { startExam } from './examSession';
import { choose, finishExamState } from './examState';
import { loadExamState, saveExamState } from './examStorage';

vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 20_000 };
const EXPLANATION = '[Prueba] Explicación simulada, en español.';

/** Un examen de una pregunta suelta de inglés, contestada mal y ya terminado, y un mazo propio */
async function seedFailedEnglish(api: DataApi, user: User) {
  const { bundles } = makeEnglishCase(1, { explanation: EXPLANATION });
  const first = bundles[0];
  if (!first) throw new Error('Sin pregunta de prueba');
  await api.repos.questions.addVersion(first.question, first.options);
  // Un examen de una sola pregunta no pide inglés por su proporción, así que el plan va armado a mano
  const plan: ExamPlan = {
    questionIds: [first.question.id],
    requested: 1,
    available: 1,
    shortfall: 0,
    totalMs: 90_000,
    sections: {
      clinical: { requested: 0, picked: 0, shortfall: 0, secondsPerQuestion: 77 },
      english: { requested: 1, picked: 1, shortfall: 0, secondsPerQuestion: 90 },
    },
  };
  await startExam({
    api,
    user,
    questions: [first.question],
    requested: 1,
    options: { highlight: false, askConfidence: false, alerts: false },
    plan,
  });
  const state = loadExamState(user.id);
  const wrong = first.options.find((option) => !option.isCorrect);
  if (!state || !wrong) throw new Error('No se armó el examen');
  const now = Date.now();
  saveExamState(
    finishExamState(choose(state, first.question.id, wrong.id, now).state, now + 1000, 'completed'),
  );
  await createManualDeck(api, user, { name: 'Mi inglés' });
}

describe('crear tarjeta desde una pregunta de inglés en la revisión del examen', () => {
  it('llega armada con el texto del banco y al guardarla marca el inglés con lang en y el español no', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.examResults.path, { seed: seedFailedEnglish });
    const review = await screen.findByRole('region', { name: t.examResults.reviewTitle }, WAIT);
    await waitFor(() => {
      expect(screen.queryByText(t.examResults.saving)).toBeNull();
    }, WAIT);
    const row = within(review).getAllByRole('listitem')[0] as HTMLElement;
    await typing.click(within(row).getByText(t.examResults.questionN(1)));
    await typing.click(
      within(row).getByRole('button', { name: t.examReview.createCard.buttonLabel('1') }),
    );
    const dialog = await screen.findByRole('dialog', { name: t.examReview.createCard.title });
    const front = within(dialog).getByLabelText<HTMLTextAreaElement>(t.decks.editor.reverseFront);
    const back = within(dialog).getByLabelText<HTMLTextAreaElement>(t.decks.editor.reverseBack);
    // Del banco: el texto en corto y la pregunta al frente, y atrás la clave, la explicación y la fuente
    expect(front.value).toContain('[Prueba] Simulated reading passage 1.');
    expect(front.value).toContain('[Prueba] Which statement is correct? (item 1)');
    expect(back.value).toContain(
      `${t.examReview.createCard.correctAnswer}. [Prueba] English option`,
    );
    expect(back.value).toContain(EXPLANATION);
    expect(back.value).toContain('Fuente del texto. [Prueba] Texto simulado.');

    const select = await within(dialog).findByRole('combobox', {
      name: t.examReview.createCard.deck,
    });
    await waitFor(() => {
      expect(within(select).getByRole('option', { name: 'Mi inglés' })).toBeInTheDocument();
    });
    await typing.selectOptions(select, within(select).getByRole('option', { name: 'Mi inglés' }));
    // Lo que el alumno agrega no es del banco y no se marca como inglés
    await typing.type(back, ' Repasar con calma.');
    await typing.click(within(dialog).getByRole('button', { name: t.examReview.createCard.save }));
    expect(
      await within(dialog).findByText(t.examReview.createCard.saved('Mi inglés')),
    ).toBeVisible();

    const notes = (await app.api.repos.notes.list()).filter(
      (note) => note.sourceQuestionVersionId === null,
    );
    expect(notes).toHaveLength(1);
    const note = notes[0];
    if (note?.kind !== 'basic') throw new Error('Debió quedar una tarjeta básica');
    expect(note.front).toContain('<span lang="en">[Prueba] Simulated reading passage 1.');
    expect(note.front).toContain(
      '<span lang="en">[Prueba] Which statement is correct? (item 1)</span>',
    );
    expect(note.back).toContain('<span lang="en">[Prueba] English option');
    expect(note.back).toContain('<span lang="en">[Prueba] Texto simulado</span>');
    // La explicación en español, el texto que escribió el alumno y las etiquetas de la interfaz, sin marca
    expect(note.back).toContain(`<p>${EXPLANATION}</p>`);
    expect(note.back).toContain('Repasar con calma.');
    expect(note.back).not.toContain('<span lang="en">Repasar');
    expect(note.back).not.toMatch(
      /<span lang="en">[^<]*(Respuesta correcta|Explicación|Referencias)/,
    );
    // El saneador de las tarjetas lo deja pasar y el editor lo ve como texto plano
    const clean = createCardSanitizer(window).sanitize(note.front, () => null);
    expect(clean).toContain('<span lang="en">');
    expect(draftOf(note)).toEqual({
      kind: 'basic',
      front: front.value,
      back: back.value,
    });
  });
});
