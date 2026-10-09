// @vitest-environment jsdom
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
import { TAGGABLE_BIASES } from '@/data/usecases/labeling';
import { buildDemoBank } from '@/demo/content/bank';
import { t } from '@/i18n/es-MX';
import { sampleQuestionIds } from './agreementView';

vi.setConfig({ testTimeout: 60_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 30_000 };
const text = t.questionEditor;
const demo = buildDemoBank();
const entries = demo.questions;
const sample = new Set(sampleQuestionIds(entries.map((entry) => entry.question)));
const inSample = entries.find((entry) => sample.has(entry.question.questionId));
const outOfSample = entries.find((entry) => !sample.has(entry.question.questionId));
if (!inSample || !outOfSample) throw new Error('El banco demo no alcanza para la prueba');

const assign = (api: DataApi, user: User, questionId: string) =>
  api.repos.reviewAssignments.put({
    id: newId(),
    questionId,
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

  it('el admin edita, guarda una versión nueva en borrador y el historial dice qué cambió', async () => {
    const typing = userEvent.setup();
    const { question } = outOfSample;
    const rendered = await open('admin', question.questionId);
    const explanation = await screen.findByLabelText(text.meta.explanation, undefined, WAIT);
    expect(explanation).toHaveValue(question.explanation);
    const history = screen.getByRole('region', { name: text.sections.history });
    expect(within(history).getByText(text.history.first)).toBeVisible();

    await typing.clear(explanation);
    await typing.type(explanation, 'Explicación corregida por el médico.');
    await typing.click(await screen.findByRole('button', { name: t.settings.saveChanges }));

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
    // El historial lista las dos versiones y lo que cambió. El formulario se arma de nuevo con la
    // versión 2, así que se busca otra vez en cada intento
    await waitFor(() => {
      const after = screen.getByRole('region', { name: text.sections.history });
      expect(within(after).getByText(text.status.version(2))).toBeVisible();
      expect(
        within(after).getByText(text.history.changed([text.history.parts.explanation ?? ''])),
      ).toBeVisible();
    }, WAIT);
    expect(screen.getByText(text.save.saved)).toBeVisible();
  });

  it('lleva la versión por borrador, revisión y aprobación', async () => {
    const typing = userEvent.setup();
    const { question } = outOfSample;
    const rendered = await open('admin', question.questionId);
    await typing.click(
      await screen.findByRole('button', { name: text.status.move.in_review }, WAIT),
    );
    await waitFor(async () => {
      expect((await rendered.api.repos.questions.get(question.id))?.editorialStatus).toBe(
        'in_review',
      );
    }, WAIT);
    await typing.click(await screen.findByRole('button', { name: text.status.move.approved }));
    await waitFor(async () => {
      expect((await rendered.api.repos.questions.get(question.id))?.editorialStatus).toBe(
        'approved',
      );
    }, WAIT);
    expect(await screen.findByRole('button', { name: text.status.reopen })).toBeVisible();
    // Aprobada no pasa directo a otra cosa que no sea reabrir la revisión
    expect(screen.queryByRole('button', { name: text.status.move.rejected })).toBeNull();
  });

  it('no guarda con problemas y los dice, y la versión no cambia', async () => {
    const typing = userEvent.setup();
    const { question } = outOfSample;
    const rendered = await open('admin', question.questionId);
    const prompt = await screen.findByLabelText(text.case.prompt, undefined, WAIT);
    await typing.clear(prompt);
    await typing.click(await screen.findByRole('button', { name: t.settings.saveChanges }));
    const alert = await screen.findByRole('alert', undefined, WAIT);
    expect(within(alert).getByText(text.issues.prompt_empty ?? '')).toBeVisible();
    expect(await rendered.api.repos.questions.listVersions(question.questionId)).toHaveLength(1);
  });

  it('cada distractor muestra la definición de su etiqueta y la correcta no lleva etiqueta', async () => {
    const typing = userEvent.setup();
    const { question, options } = outOfSample;
    await open('admin', question.questionId);
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

  it('un médico sin la pregunta asignada no la edita', async () => {
    await open('physician', outOfSample.question.questionId);
    expect(await screen.findByText(text.notAssigned.title, undefined, WAIT)).toBeVisible();
    expect(screen.queryByLabelText(text.meta.explanation)).toBeNull();
  });

  it('un médico con la pregunta asignada y fuera del doble etiquetado la edita', async () => {
    await open('physician', outOfSample.question.questionId, async (api, user) => {
      await assign(api, user, outOfSample.question.questionId);
    });
    expect(await screen.findByLabelText(text.meta.explanation, undefined, WAIT)).toBeVisible();
  });

  it('en el doble etiquetado primero etiqueta a ciegas y después se abre el editor', async () => {
    const { question, options } = inSample;
    const distractors = options.filter((option) => !option.isCorrect);
    const labelAll = async (api: DataApi, user: User, count: number) => {
      for (const option of distractors.slice(0, count))
        await api.repos.biasLabels.put({
          id: newId(),
          optionId: option.optionId,
          physicianId: user.id,
          biasTag: TAGGABLE_BIASES[0]?.key ?? '',
          labeledAt: '2026-10-08T10:00:00.000Z',
        });
    };
    // Con un distractor sin etiquetar sigue cerrado
    await open('physician', question.questionId, async (api, user) => {
      await assign(api, user, question.questionId);
      await labelAll(api, user, distractors.length - 1);
    });
    expect(await screen.findByText(text.blind.title, undefined, WAIT)).toBeVisible();
    expect(screen.getByRole('link', { name: text.blind.cta })).toHaveAttribute(
      'href',
      SCREENS.agreement.path,
    );
    expect(screen.queryByLabelText(text.meta.explanation)).toBeNull();
    cleanup();
    await resetApp(app?.api);

    // Con todos etiquetados ya se abre
    await open('physician', question.questionId, async (api, user) => {
      await assign(api, user, question.questionId);
      await labelAll(api, user, distractors.length);
    });
    expect(await screen.findByLabelText(text.meta.explanation, undefined, WAIT)).toBeVisible();
  });

  it('el admin edita una pregunta del doble etiquetado sin esperar nada', async () => {
    await open('admin', inSample.question.questionId);
    expect(await screen.findByLabelText(text.meta.explanation, undefined, WAIT)).toBeVisible();
  });
});
