// @vitest-environment jsdom
// Editor de pregunta (pantalla 18, 4.2 y 4.4 del plan de B11) con el repositorio local de la demo. El
// médico asignado edita y manda a revisión. Con la versión en revisión primero etiqueta a ciegas, sin
// ver lo del autor, y después decide. El admin solo lee.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import type { User } from '@/data/schemas/people';
import { newId } from '@/data/testing/fixtures';
import { ensureDemoBank } from '@/data/usecases/bank';
import { TAGGABLE_BIASES } from '@/data/usecases/labeling';
import { buildDemoBank } from '@/demo/content/bank';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';

// Cada prueba encadena varias esperas de hasta 30 segundos, y en el CI el banco demo tarda en cargar
vi.setConfig({ testTimeout: 120_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

// El banco demo se guarda la primera vez que se abre y, con las demás pruebas corriendo, tarda
const WAIT = { timeout: 60_000 };
const text = physicianText.questionEditor;
const review = physicianText.review;
const demo = buildDemoBank();
// Una pregunta directa y completa del banco demo, que se puede mandar a revisión
const entry = demo.questions.find((item) => item.question.caseId === null);
if (!entry) throw new Error('El banco demo no alcanza para la prueba');
const { question, options } = entry;
const biasName = new Map(TAGGABLE_BIASES.map((bias) => [bias.key, bias.name]));

const assign = (api: DataApi, user: User) =>
  api.repos.reviewAssignments.put({
    id: newId(),
    questionId: question.questionId,
    physicianId: user.id,
    assignedBy: null,
    assignedAt: '2026-10-08T10:00:00.000Z',
  });

async function open(
  role: 'physician' | 'admin',
  questionId: string,
  seed?: (api: DataApi, user: User) => Promise<void>,
) {
  usePreferences.setState({ role });
  app = await renderApp(`${SCREENS.questionEditor.path}?pregunta=${questionId}`, { seed });
  return app;
}

/** Médico con la pregunta asignada, opcionalmente ya en revisión */
const assigned =
  (inReview = false) =>
  async (api: DataApi, user: User) => {
    await ensureDemoBank(api);
    await assign(api, user);
    if (inReview) await api.repos.questions.setEditorialStatus(question.id, 'in_review');
  };

describe('editor de pregunta (pantalla 18)', () => {
  it('sin pregunta en la dirección pide elegir una desde el banco', async () => {
    usePreferences.setState({ role: 'admin' });
    app = await renderApp(SCREENS.questionEditor.path);
    expect(await screen.findByText(text.noQuestion.title, undefined, WAIT)).toBeVisible();
    expect(screen.getByRole('link', { name: text.back })).toHaveAttribute(
      'href',
      SCREENS.questionBank.path,
    );
  });

  it('una pregunta que no existe dice que no la encontró', async () => {
    await open('admin', newId());
    expect(await screen.findByText(text.notFound.title, undefined, WAIT)).toBeVisible();
  });

  it('el admin solo lee la pregunta, sin editarla ni decidir', async () => {
    await open('admin', question.questionId);
    expect(await screen.findByText(review.readOnly, undefined, WAIT)).toBeVisible();
    expect(screen.getByText(question.prompt)).toBeVisible();
    expect(screen.queryByLabelText(text.meta.explanation)).toBeNull();
    expect(screen.queryByRole('button', { name: review.submit.action })).toBeNull();
    expect(screen.getByRole('region', { name: text.sections.history })).toBeVisible();
  });

  it('un médico sin la pregunta asignada no la ve', async () => {
    await open('physician', question.questionId);
    expect(await screen.findByText(text.notAssigned.title, undefined, WAIT)).toBeVisible();
    expect(screen.queryByLabelText(text.meta.explanation)).toBeNull();
  });

  it('el médico asignado edita, guarda una versión nueva en borrador y el historial dice qué cambió', async () => {
    const typing = userEvent.setup();
    const rendered = await open('physician', question.questionId, assigned());
    const explanation = await screen.findByLabelText(text.meta.explanation, undefined, WAIT);
    expect(explanation).toHaveValue(question.explanation);
    const history = screen.getByRole('region', { name: text.sections.history });
    expect(within(history).getByText(text.history.first)).toBeVisible();

    await typing.clear(explanation);
    await typing.type(explanation, 'Explicación corregida por el médico.');
    await typing.click(await screen.findByRole('button', { name: t.settings.saveChanges }, WAIT));

    await waitFor(async () => {
      expect(await rendered.api.repos.questions.listVersions(question.questionId)).toHaveLength(2);
    }, WAIT);
    const [first, second] = await rendered.api.repos.questions.listVersions(question.questionId);
    expect(first).toMatchObject({ version: 1, explanation: question.explanation });
    expect(second).toMatchObject({
      version: 2,
      explanation: 'Explicación corregida por el médico.',
      editorialStatus: 'draft',
    });
    await waitFor(() => {
      const after = screen.getByRole('region', { name: text.sections.history });
      expect(within(after).getByText(text.status.version(2))).toBeVisible();
      expect(
        within(after).getByText(text.history.changed([text.history.parts.explanation ?? ''])),
      ).toBeVisible();
    }, WAIT);
    expect(screen.getByText(text.save.saved)).toBeVisible();
  });

  it('no guarda con problemas y los dice, y la versión no cambia', async () => {
    const typing = userEvent.setup();
    const rendered = await open('physician', question.questionId, assigned());
    const prompt = await screen.findByLabelText(text.case.prompt, undefined, WAIT);
    await typing.clear(prompt);
    await typing.click(await screen.findByRole('button', { name: t.settings.saveChanges }, WAIT));
    const alert = await screen.findByRole('alert', undefined, WAIT);
    expect(within(alert).getByText(text.issues.prompt_empty ?? '')).toBeVisible();
    expect(await rendered.api.repos.questions.listVersions(question.questionId)).toHaveLength(1);
  });

  it('cada distractor muestra la definición de su etiqueta y la correcta no lleva etiqueta', async () => {
    const typing = userEvent.setup();
    await open('physician', question.questionId, assigned());
    await screen.findByLabelText(text.meta.explanation, undefined, WAIT);
    const distractor = options.findIndex((option) => !option.isCorrect);
    const group = screen.getByRole('group', { name: text.options.title(distractor + 1) });
    await typing.click(within(group).getByText(text.options.title(distractor + 1)));
    const tag = options[distractor]?.biasTag ?? '';
    const definition = TAGGABLE_BIASES.find((bias) => bias.key === tag)?.distractorDefinition;
    expect(definition).toBeTruthy();
    expect(within(group).getByText(definition ?? '')).toBeVisible();
    const correct = options.findIndex((option) => option.isCorrect);
    const key = screen.getByRole('group', { name: text.options.title(correct + 1) });
    expect(within(key).queryByLabelText(text.options.tag)).toBeNull();
  });

  it('el autor manda el borrador completo a revisión', async () => {
    const typing = userEvent.setup({ delay: null });
    const rendered = await open('physician', question.questionId, assigned());
    const send = await screen.findByRole('button', { name: review.submit.action }, WAIT);
    await typing.click(send);
    await waitFor(async () => {
      expect((await rendered.api.repos.questions.get(question.id))?.editorialStatus).toBe(
        'in_review',
      );
    }, WAIT);
    expect(await screen.findByText(review.submit.sent, undefined, WAIT)).toBeVisible();
  });

  it('en revisión primero etiqueta a ciegas, ve el aviso de cada etiqueta, y al terminar decide y aprueba', async () => {
    const typing = userEvent.setup({ delay: null });
    const rendered = await open('physician', question.questionId, assigned(true));
    const step = await screen.findByRole('region', { name: review.blind.title }, WAIT);
    // A ciegas no se ve lo del autor. Ni su justificación ni el editor
    const distractors = options.filter((option) => !option.isCorrect);
    for (const option of distractors) expect(screen.queryByText(option.rationale)).toBeNull();
    expect(screen.queryByLabelText(text.meta.explanation)).toBeNull();
    expect(screen.queryByRole('region', { name: text.sections.history })).toBeNull();

    const tag = TAGGABLE_BIASES[0]?.key ?? '';
    for (let index = 0; index < distractors.length; index += 1) {
      const current = await screen.findByRole('region', { name: review.blind.title }, WAIT);
      const select = within(current).getAllByRole('combobox')[index] as HTMLSelectElement;
      const letter = /distractor ([A-J])$/.exec(select.labels[0]?.textContent ?? '')?.[1] ?? '';
      await typing.selectOptions(select, tag);
      // El aviso dice qué etiqueta quedó y en qué opción (H25)
      expect(
        await screen.findByText(
          new RegExp(review.blind.saved(biasName.get(tag) ?? tag, letter).replace('.', '\\.')),
          undefined,
          WAIT,
        ),
      ).toBeVisible();
    }
    await waitFor(() => {
      expect(step).not.toBeInTheDocument();
    }, WAIT);
    const labels = await rendered.api.repos.biasLabels.list();
    expect(labels).toHaveLength(distractors.length);

    // Paso 2. La pregunta completa y la decisión
    const decide = await screen.findByRole('region', { name: review.decide.title }, WAIT);
    // Ya ve lo del autor, como la justificación del distractor en el formulario
    expect(screen.getAllByDisplayValue(distractors[0]?.rationale ?? '').length).toBeGreaterThan(0);
    await typing.click(within(decide).getByRole('button', { name: review.decide.approve }));
    await waitFor(async () => {
      expect((await rendered.api.repos.questions.get(question.id))?.editorialStatus).toBe(
        'approved',
      );
    }, WAIT);
    expect(await screen.findByText(review.decide.approvedPublished, undefined, WAIT)).toBeVisible();
  });

  it('pedir cambios pide comentario y regresa la versión a borrador', async () => {
    const typing = userEvent.setup({ delay: null });
    const rendered = await open('physician', question.questionId, async (api, user) => {
      await assigned(true)(api, user);
      for (const option of options.filter((item) => !item.isCorrect)) {
        await api.repos.biasLabels.put({
          id: newId(),
          optionId: option.optionId,
          physicianId: user.id,
          biasTag: TAGGABLE_BIASES[1]?.key ?? '',
          labeledAt: '2026-10-08T10:00:00.000Z',
        });
      }
    });
    const decide = await screen.findByRole('region', { name: review.decide.title }, WAIT);
    const changes = within(decide).getByRole('button', { name: review.decide.requestChanges });
    expect(changes).toBeDisabled();
    await typing.type(within(decide).getByLabelText(review.decide.comment), 'Revisa la clave.');
    expect(changes).toBeEnabled();
    await typing.click(changes);
    await waitFor(async () => {
      expect((await rendered.api.repos.questions.get(question.id))?.editorialStatus).toBe('draft');
    }, WAIT);
    expect(await screen.findByText(review.decide.changesRequested, undefined, WAIT)).toBeVisible();
  });
});
