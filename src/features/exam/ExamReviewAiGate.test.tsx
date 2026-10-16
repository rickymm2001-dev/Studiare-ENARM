// @vitest-environment jsdom
// Sugerir con IA en la revisión del examen ante la compuerta 1 y ante el tope de generaciones (B12, 3.5).
// Es una de las tres puertas de las tarjetas con IA. Con el motor de tarjetas cerrado el botón no
// aparece para el alumno, se ve el aviso y no sale ninguna llamada a un motor. Con el motor abierto se
// ofrece, a la IA solo viajan el ID seudónimo y la explicación del banco, y un tope de generaciones del
// servidor se avisa tal cual, sin guardar nada ni caer a las respuestas fijas.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeProxy } from '@/ai/testing/proxyFetch';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import type { User } from '@/data/schemas/people';
import { makeQuestionWithOptions, subscribe } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';
import { startExam } from './examSession';
import { choose, finishExamState } from './examState';
import { loadExamState, saveExamState } from './examStorage';

// Cada prueba arma los resultados completos de un examen y necesita más de 5 segundos
vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 20_000 };

const EXPLANATION =
  'La furosemida intravenosa de 40 mg alivia la congestión pulmonar en la insuficiencia cardiaca aguda. ' +
  'La dosis se repite cada 12 horas según la diuresis y la función renal del paciente. ' +
  'La insuficiencia cardiaca aguda se caracteriza por disnea súbita, ortopnea y estertores crepitantes basales.';

const LIMIT_MESSAGE =
  'Llegaste al límite de generaciones de tarjetas con IA de hoy. Vuelve mañana.';

/** Un examen de una pregunta, contestada mal y ya terminado, de un alumno con un plan de pago */
async function seedFailedExam(api: DataApi, user: User) {
  const { question, options } = makeQuestionWithOptions();
  await api.repos.questions.addVersion({ ...question, explanation: EXPLANATION }, options);
  await startExam({
    api,
    user,
    questions: [question],
    requested: 1,
    options: { highlight: false, askConfidence: false, alerts: false },
  });
  const state = loadExamState(user.id);
  const wrong = options.find((option) => !option.isCorrect);
  if (!state || !wrong) throw new Error('No se armó el examen');
  const now = Date.now();
  saveExamState(
    finishExamState(choose(state, question.id, wrong.id, now).state, now + 1000, 'completed'),
  );
  await subscribe(api, user, 'monthly');
}

/** Abre Crear tarjeta en la pregunta fallada de la revisión */
async function openCreateCard(typing: ReturnType<typeof userEvent.setup>) {
  app = await renderApp(SCREENS.examResults.path, { seed: seedFailedExam });
  const review = await screen.findByRole('region', { name: t.examResults.reviewTitle }, WAIT);
  await waitFor(() => {
    expect(screen.queryByText(t.examResults.saving)).toBeNull();
  }, WAIT);
  const row = within(review).getAllByRole('listitem')[0] as HTMLElement;
  await typing.click(within(row).getByText(t.examResults.questionN(1)));
  await typing.click(
    within(row).getByRole('button', { name: t.examReview.createCard.buttonLabel('1') }),
  );
  return screen.findByRole('dialog', { name: t.examReview.createCard.title });
}

describe('Sugerir con IA en la revisión del examen ante la compuerta', () => {
  it('con la compuerta cerrada no hay botón, se ve el aviso y no sale ninguna llamada a un motor', async () => {
    const proxy = fakeProxy({ engines: {} });
    vi.stubGlobal('fetch', proxy.fetch);
    const dialog = await openCreateCard(userEvent.setup());
    expect(await within(dialog).findByText(t.ai.access.gatedCards, undefined, WAIT)).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: t.examReview.ai.button })).toBeNull();
    expect(proxy.engineCalls()).toEqual([]);
  });

  it('con el motor abierto ofrece el botón, manda solo el ID seudónimo y la explicación, y el tope del servidor se avisa tal cual', async () => {
    const typing = userEvent.setup();
    const proxy = fakeProxy({
      engines: { flashcards: 'open' },
      routes: {
        '/api/ai/flashcards': () =>
          Response.json({ error: 'generation_limit', message: LIMIT_MESSAGE }, { status: 429 }),
      },
    });
    vi.stubGlobal('fetch', proxy.fetch);
    const dialog = await openCreateCard(typing);
    const suggest = await within(dialog).findByRole(
      'button',
      { name: t.examReview.ai.button },
      WAIT,
    );
    await waitFor(() => {
      expect(suggest).toBeEnabled();
    }, WAIT);
    await typing.click(suggest);
    expect(await within(dialog).findByText(LIMIT_MESSAGE, undefined, WAIT)).toBeVisible();

    // La IA recibió el ID seudónimo y el texto del banco, con la ref de su generación y su sección
    expect(proxy.engineCalls()).toHaveLength(1);
    const body = proxy.engineCalls()[0]?.body;
    expect(body?.studentRef).toBe(app?.user.id);
    expect(JSON.stringify(body?.input)).toContain(EXPLANATION.slice(0, 60));
    expect(body?.generation).toMatchObject({ section: 0 });
    // No salió ninguna propuesta, ni simulada, y no se guardó una generación
    expect(within(dialog).queryByRole('list', { name: t.examReview.ai.proposalsTitle })).toBeNull();
    expect(await app?.api.repos.aiArtifacts.list()).toHaveLength(0);
  });
});
