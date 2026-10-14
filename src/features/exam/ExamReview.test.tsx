// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import { isAiNote } from '@/data/schemas/decks';
import type { User } from '@/data/schemas/people';
import { makeQuestionWithOptions } from '@/data/testing/fixtures';
import { createManualDeck } from '@/data/usecases/manualDecks';
import { createQuestionCard } from '@/data/usecases/questionCards';
import { t } from '@/i18n/es-MX';
import { startExam } from './examSession';
import { choose, finishExamState } from './examState';
import { loadExamState, saveExamState } from './examStorage';

// Cada prueba arma los resultados completos y cierra el examen, así que necesita más de 5 segundos
vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 20_000 };

/** Una explicación con datos concretos, de la que el generador simulado sí saca tarjetas */
const EXPLANATION =
  'La furosemida intravenosa de 40 mg alivia la congestión pulmonar en la insuficiencia cardiaca aguda. ' +
  'La dosis se repite cada 12 horas según la diuresis y la función renal del paciente. ' +
  'La insuficiencia cardiaca aguda se caracteriza por disnea súbita, ortopnea y estertores crepitantes basales.';

/** Un examen de una pregunta, contestada mal y ya terminado, listo para ver los resultados */
function seedFailedExam(options: { plan?: 'free' | 'monthly'; deckName?: string } = {}) {
  return async (api: DataApi, user: User) => {
    const { question, options: choices } = makeQuestionWithOptions();
    await api.repos.questions.addVersion({ ...question, explanation: EXPLANATION }, choices);
    await startExam({
      api,
      user,
      questions: [question],
      requested: 1,
      options: { highlight: false, askConfidence: false, alerts: false },
    });
    const state = loadExamState(user.id);
    const wrong = choices.find((option) => !option.isCorrect);
    if (!state || !wrong) throw new Error('No se armó el examen');
    const now = Date.now();
    saveExamState(
      finishExamState(choose(state, question.id, wrong.id, now).state, now + 1000, 'completed'),
    );
    if (options.plan === 'monthly') {
      await api.repos.subscriptions.put({
        userId: user.id,
        plan: 'monthly',
        status: 'active',
        isSimulated: true,
        updatedAt: '2026-10-01T10:00:00.000Z',
      });
    }
    if (options.deckName) await createManualDeck(api, user, { name: options.deckName });
  };
}

/**
 * Un examen de dos preguntas, las dos falladas y ya terminado. Con la primera de la revisión el
 * alumno ya creó antes una tarjeta en Cardiología y con la segunda todavía no
 */
async function seedCardForFirst(api: DataApi, user: User) {
  const pairs = [makeQuestionWithOptions(), makeQuestionWithOptions()];
  for (const { question, options } of pairs) {
    await api.repos.questions.addVersion({ ...question, explanation: EXPLANATION }, options);
  }
  const started = await startExam({
    api,
    user,
    questions: pairs.map(({ question }) => question),
    requested: 2,
    options: { highlight: false, askConfidence: false, alerts: false },
  });
  if (!started) throw new Error('No se armó el examen');
  const now = Date.now();
  let state = started;
  for (const { question, options } of pairs) {
    const wrong = options.find((option) => !option.isCorrect);
    if (!wrong) throw new Error('Sin distractor');
    state = choose(state, question.id, wrong.id, now).state;
  }
  saveExamState(finishExamState(state, now + 1000, 'completed'));
  // La primera de la revisión es la primera en el orden del examen
  const firstId = started.questionIds[0];
  const first = pairs.find(({ question }) => question.id === firstId)?.question;
  if (!first) throw new Error('Sin primera pregunta');
  const deck = await createManualDeck(api, user, { name: 'Cardiología' });
  await createQuestionCard(api, user, {
    question: first,
    target: { kind: 'deck', deckId: deck.id },
    draft: { kind: 'basic', front: 'Frente de prueba', back: 'Reverso de prueba' },
    source: { kind: 'bank' },
    from: 'exam_review',
    layer: {
      name: t.examReview.createCard.layerDeckName,
      description: t.examReview.createCard.layerDeckDescription,
    },
  });
}

/** Abre las preguntas de la revisión con esos números y devuelve sus filas en ese orden */
async function openRows(typing: ReturnType<typeof userEvent.setup>, numbers: readonly number[]) {
  const review = await screen.findByRole('region', { name: t.examResults.reviewTitle }, WAIT);
  await waitFor(() => {
    expect(screen.queryByText(t.examResults.saving)).toBeNull();
  }, WAIT);
  const rows: HTMLElement[] = [];
  for (const n of numbers) {
    const title = within(review).getByText(t.examResults.questionN(n));
    await typing.click(title);
    rows.push(title.closest('li') as HTMLElement);
  }
  return rows;
}

/** Abre la primera pregunta de la revisión, que es la fallada */
async function openFailed(typing: ReturnType<typeof userEvent.setup>) {
  const review = await screen.findByRole('region', { name: t.examResults.reviewTitle }, WAIT);
  await waitFor(() => {
    expect(screen.queryByText(t.examResults.saving)).toBeNull();
  }, WAIT);
  const row = within(review).getAllByRole('listitem')[0] as HTMLElement;
  await typing.click(within(row).getByText(t.examResults.questionN(1)));
  return row;
}

/**
 * Las notas que creó el alumno con la pregunta. La pregunta fallada también pasa a Mis errores, que
 * es una tarjeta de pregunta y se queda fuera
 */
async function createdNotes(api: DataApi) {
  return (await api.repos.notes.list()).filter((note) => note.sourceQuestionVersionId === null);
}

async function motiveEvents(api: DataApi, user: User) {
  return (await api.repos.events.query({ userId: user.id, types: ['cause_reported'] })).map(
    (event) => (event.type === 'cause_reported' ? event.payload.cause : null),
  );
}

describe('por qué fallaste en la revisión del examen (B5, comentario 2)', () => {
  it('siete botones de un toque, cada cambio es un evento nuevo y vale el último', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.examResults.path, { seed: seedFailedExam() });
    const row = await openFailed(typing);
    const group = within(row).getByRole('group', { name: t.examReview.motives.legend });
    const chip = (motive: keyof typeof t.review.causes) =>
      within(group).getByRole('button', { name: t.review.causes[motive] });
    expect(within(group).getAllByRole('button')).toHaveLength(7);
    // Es opcional. Sin tocar nada no hay ninguno presionado ni ningún evento
    expect(within(group).queryAllByRole('button', { pressed: true })).toHaveLength(0);

    await typing.click(chip('knowledge'));
    expect(
      await within(group).findByText(t.examReview.motives.saved('Conocimiento')),
    ).toBeVisible();
    await typing.click(chip('overconfidence'));
    expect(chip('overconfidence')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('knowledge')).toHaveAttribute('aria-pressed', 'false');
    // Tocar el que ya está no deja otro evento
    await typing.click(chip('overconfidence'));

    const { api, user } = app;
    await waitFor(async () => {
      expect(await motiveEvents(api, user)).toEqual(['knowledge', 'overconfidence']);
    });
    // Cada motivo queda en la sesión del examen, como sus respuestas
    const examId = loadExamState(user.id)?.examId;
    expect(examId).toBeDefined();
    const reported = await api.repos.events.query({ userId: user.id, types: ['cause_reported'] });
    expect(reported.map((event) => event.sessionId)).toEqual([examId, examId]);

    // Al volver a abrir los resultados se lee de la bitácora y sigue el último
    cleanup();
    app = await renderApp(SCREENS.examResults.path, { user });
    const again = await openFailed(typing);
    const reread = within(again).getByRole('group', { name: t.examReview.motives.legend });
    await waitFor(() => {
      expect(
        within(reread).getByRole('button', { name: t.review.causes.overconfidence }),
      ).toHaveAttribute('aria-pressed', 'true');
    });
  });
});

describe('crear tarjeta desde la revisión del examen (B5, comentario 1)', () => {
  it('arma la tarjeta con el texto del banco, la guarda en el mazo elegido y no la duplica', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.examResults.path, {
      seed: seedFailedExam({ deckName: 'Cardiología' }),
    });
    const row = await openFailed(typing);
    await typing.click(
      within(row).getByRole('button', { name: t.examReview.createCard.buttonLabel('1') }),
    );
    const dialog = await screen.findByRole('dialog', { name: t.examReview.createCard.title });
    // Llega armada con el texto del banco y se puede editar
    const front = within(dialog).getByLabelText(t.decks.editor.reverseFront);
    const back = within(dialog).getByLabelText(t.decks.editor.reverseBack);
    expect((front as HTMLTextAreaElement).value).toContain('¿Cuál es el diagnóstico más probable?');
    expect((back as HTMLTextAreaElement).value).toContain(t.examReview.createCard.correctAnswer);
    expect((back as HTMLTextAreaElement).value).toContain(EXPLANATION.slice(0, 40));

    // Sin mazo elegido no guarda
    const save = within(dialog).getByRole('button', { name: t.examReview.createCard.save });
    await typing.click(save);
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      t.examReview.createCard.errors.chooseDeck,
    );

    const select = await within(dialog).findByRole('combobox', {
      name: t.examReview.createCard.deck,
    });
    await waitFor(() => {
      expect(within(select).getByRole('option', { name: 'Cardiología' })).toBeInTheDocument();
    });
    await typing.selectOptions(select, within(select).getByRole('option', { name: 'Cardiología' }));
    await typing.type(back, ' Repasar con la guía.');
    await typing.click(save);
    expect(
      await within(dialog).findByText(t.examReview.createCard.saved('Cardiología')),
    ).toBeVisible();
    await typing.click(save);
    expect(
      await within(dialog).findByText(t.examReview.createCard.exists('Cardiología')),
    ).toBeVisible();

    const { api, user } = app;
    const notes = await createdNotes(api);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.kind === 'basic' && notes[0].back).toContain('Repasar con la guía.');
    const created = await api.repos.events.query({
      userId: user.id,
      types: ['question_card_created'],
    });
    expect(created).toHaveLength(1);
    expect(created[0]?.payload).toMatchObject({ source: 'bank', from: 'exam_review' });
  });

  it('en el plan Gratis Sugerir con IA queda cerrado y lleva a los planes', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.examResults.path, { seed: seedFailedExam() });
    const row = await openFailed(typing);
    await typing.click(
      within(row).getByRole('button', { name: t.examReview.createCard.buttonLabel('1') }),
    );
    const dialog = await screen.findByRole('dialog', { name: t.examReview.createCard.title });
    expect(
      await within(dialog).findByText(t.billing.featureLocked(t.billing.featureNames.aiCards)),
    ).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: t.examReview.ai.button })).toBeNull();
  });

  it('en un plan de pago la IA propone tarjetas ancladas a la explicación y quedan en borrador', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.examResults.path, {
      seed: seedFailedExam({ plan: 'monthly', deckName: 'Cardiología' }),
    });
    const row = await openFailed(typing);
    await typing.click(
      within(row).getByRole('button', { name: t.examReview.createCard.buttonLabel('1') }),
    );
    const dialog = await screen.findByRole('dialog', { name: t.examReview.createCard.title });
    const suggest = await within(dialog).findByRole(
      'button',
      { name: t.examReview.ai.button },
      WAIT,
    );
    await waitFor(() => {
      expect(suggest).toBeEnabled();
    }, WAIT);
    await typing.click(suggest);
    const proposals = await within(dialog).findByRole(
      'list',
      {
        name: t.examReview.ai.proposalsTitle,
      },
      WAIT,
    );
    // Cada propuesta lleva la etiqueta de borrador y la frase del banco que la respalda
    const first = within(proposals).getAllByRole('listitem')[0] as HTMLElement;
    expect(within(first).getByText(t.aiCards.draftLabel)).toBeVisible();
    const quote = within(first).getByText(t.examReview.ai.quote).parentElement?.textContent ?? '';
    expect(EXPLANATION).toContain(quote.replace(t.examReview.ai.quote, '').trim());

    await typing.click(within(first).getByRole('button', { name: t.examReview.ai.useLabel(1) }));
    expect(within(dialog).getByText(t.examReview.ai.using)).toBeVisible();
    // Sin cambios no hay aviso, porque el generador ya la revisó contra su cita
    expect(within(dialog).queryByText(t.aiCards.editedIssues)).toBeNull();
    const select = within(dialog).getByRole('combobox', { name: t.examReview.createCard.deck });
    await typing.selectOptions(select, within(select).getByRole('option', { name: 'Cardiología' }));
    await typing.click(within(dialog).getByRole('button', { name: t.examReview.createCard.save }));
    await within(dialog).findByText(t.examReview.createCard.saved('Cardiología'));

    const { api, user } = app;
    const [note, ...others] = await createdNotes(api);
    expect(others).toHaveLength(0);
    expect(note).toMatchObject({ origin: 'generated', editorialStatus: 'draft' });
    expect(note && isAiNote(note)).toBe(true);
    expect(EXPLANATION).toContain(note?.sourceQuote ?? '¿sin cita?');
    const [created] = await api.repos.events.query({
      userId: user.id,
      types: ['question_card_created'],
    });
    expect(created?.payload).toMatchObject({ source: 'ai' });
  });

  it('una propuesta de la IA editada se revisa contra su cita y, si se guarda así, queda en borrador con el aviso', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.examResults.path, {
      seed: seedFailedExam({ plan: 'monthly', deckName: 'Cardiología' }),
    });
    const row = await openFailed(typing);
    await typing.click(
      within(row).getByRole('button', { name: t.examReview.createCard.buttonLabel('1') }),
    );
    const dialog = await screen.findByRole('dialog', { name: t.examReview.createCard.title });
    const suggest = await within(dialog).findByRole(
      'button',
      { name: t.examReview.ai.button },
      WAIT,
    );
    await waitFor(() => {
      expect(suggest).toBeEnabled();
    }, WAIT);
    await typing.click(suggest);
    const proposals = await within(dialog).findByRole(
      'list',
      { name: t.examReview.ai.proposalsTitle },
      WAIT,
    );
    const first = within(proposals).getAllByRole('listitem')[0] as HTMLElement;
    await typing.click(within(first).getByRole('button', { name: t.examReview.ai.useLabel(1) }));
    expect(within(dialog).queryByText(t.aiCards.editedIssues)).toBeNull();

    // Una dosis que la frase citada no dice. El reverso es la nota extra si la propuesta tiene huecos
    const back =
      within(dialog).queryByLabelText(t.decks.editor.extra) ??
      within(dialog).getByLabelText(t.decks.editor.reverseBack);
    await typing.type(back, ' Repetir 80 mg en una hora.');
    expect(within(dialog).getByText(t.aiCards.editedIssues)).toBeVisible();

    // La IA no corrige nada. Si el alumno la guarda así, queda como la dejó, en borrador, con su cita
    // y con el aviso a la vista
    const select = within(dialog).getByRole('combobox', { name: t.examReview.createCard.deck });
    await typing.selectOptions(select, within(select).getByRole('option', { name: 'Cardiología' }));
    await typing.click(within(dialog).getByRole('button', { name: t.examReview.createCard.save }));
    await within(dialog).findByText(t.examReview.createCard.saved('Cardiología'));
    expect(within(dialog).getByText(t.aiCards.editedIssues)).toBeVisible();
    // La etiqueta de borrador de arriba, antes de las de cada propuesta
    expect(within(dialog).getAllByText(t.aiCards.draftLabel)[0]).toBeVisible();

    const [note, ...others] = await createdNotes(app.api);
    expect(others).toHaveLength(0);
    expect(note).toMatchObject({ origin: 'generated', editorialStatus: 'draft' });
    expect(note && isAiNote(note)).toBe(true);
    expect(JSON.stringify(note)).toContain('Repetir 80 mg en una hora.');
    expect(EXPLANATION).toContain(note?.sourceQuote ?? '¿sin cita?');
  });
});

describe('aviso de tarjeta ya creada junto a Crear tarjeta (B5, comentario 1)', () => {
  it('dice con qué preguntas ya creaste tarjeta, sin bloquear el botón, al momento y después de recargar', async () => {
    const typing = userEvent.setup();
    const text = t.examReview.createCard;
    app = await renderApp(SCREENS.examResults.path, { seed: seedCardForFirst });
    const [withCard, withoutCard] = (await openRows(typing, [1, 2])) as [HTMLElement, HTMLElement];

    // Con tarjeta. El aviso va junto al botón, que lo lleva como descripción para el lector de
    // pantalla y sigue activo, porque puede querer otra tarjeta en otro mazo
    expect(await within(withCard).findByText(text.alreadyCreated, undefined, WAIT)).toBeVisible();
    const first = within(withCard).getByRole('button', { name: text.buttonLabel('1') });
    expect(first).toBeEnabled();
    expect(first).toHaveAccessibleDescription(text.alreadyCreated);

    // Sin tarjeta. Las dos filas salen de la misma lectura de la bitácora, que ya llegó
    const second = within(withoutCard).getByRole('button', { name: text.buttonLabel('2') });
    expect(within(withoutCard).queryByText(text.alreadyCreated)).toBeNull();
    expect(second).not.toHaveAccessibleDescription();

    // Al crear la tarjeta de la segunda el aviso aparece al momento
    await typing.click(second);
    const dialog = await screen.findByRole('dialog', { name: text.title });
    const select = within(dialog).getByRole('combobox', { name: text.deck });
    await waitFor(() => {
      expect(within(select).getByRole('option', { name: 'Cardiología' })).toBeInTheDocument();
    });
    await typing.selectOptions(select, within(select).getByRole('option', { name: 'Cardiología' }));
    await typing.click(within(dialog).getByRole('button', { name: text.save }));
    await within(dialog).findByText(text.saved('Cardiología'));
    await typing.click(within(dialog).getByRole('button', { name: text.close }));
    expect(await within(withoutCard).findByText(text.alreadyCreated)).toBeVisible();
    expect(second).toHaveAccessibleDescription(text.alreadyCreated);

    // Al recargar se lee otra vez de la bitácora y los dos avisos siguen
    const { user } = app;
    cleanup();
    app = await renderApp(SCREENS.examResults.path, { user });
    const reloaded = await openRows(typing, [1, 2]);
    for (const [index, row] of reloaded.entries()) {
      expect(await within(row).findByText(text.alreadyCreated, undefined, WAIT)).toBeVisible();
      expect(
        within(row).getByRole('button', { name: text.buttonLabel(String(index + 1)) }),
      ).toHaveAccessibleDescription(text.alreadyCreated);
    }
  });
});
