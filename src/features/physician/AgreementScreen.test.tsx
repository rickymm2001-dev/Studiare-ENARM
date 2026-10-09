// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import type { BiasLabel } from '@/data/schemas/bank';
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
const demo = buildDemoBank();
const questions = demo.questions.map((entry) => entry.question);
const sample = sampleQuestionIds(questions);
const text = t.agreementScreen;
const [tagA, tagB, tagC, tagD] = TAGGABLE_BIASES.map((bias) => bias.key) as [
  string,
  string,
  string,
  string,
];

const putLabel = (api: DataApi, optionId: string, physicianId: string, biasTag: string) =>
  api.repos.biasLabels.put({
    id: newId(),
    optionId,
    physicianId,
    biasTag,
    labeledAt: '2026-10-08T10:00:00.000Z',
  } satisfies BiasLabel);

/** Dos médicos que etiquetan 100 opciones con las cuatro etiquetas. Coinciden en `agreements` */
async function seedPairs(api: DataApi, agreements: number) {
  const a = newId();
  const b = newId();
  const tags = [tagA, tagB, tagC, tagD];
  for (let index = 0; index < 100; index += 1) {
    const optionId = newId();
    const first = tags[index % 4] as string;
    const second = index < agreements ? first : (tags[(index + 1) % 4] as string);
    await putLabel(api, optionId, a, first);
    await putLabel(api, optionId, b, second);
  }
}

async function open(options: {
  role: 'physician' | 'admin';
  seed?: (api: DataApi, user: User) => Promise<void>;
}) {
  usePreferences.setState({ role: options.role });
  app = await renderApp(SCREENS.agreement.path, { seed: options.seed });
  await screen.findByRole('heading', { level: 1, name: t.screens.agreement.title }, WAIT);
  return app;
}

/** Asigna al médico la primera pregunta de la muestra */
const assignFirst = async (api: DataApi, user: User) => {
  const first = questions.find((question) => question.questionId === sample[0]);
  if (!first) throw new Error('Sin muestra');
  await api.repos.reviewAssignments.put({
    id: newId(),
    questionId: first.questionId,
    physicianId: user.id,
    assignedBy: null,
    assignedAt: '2026-10-08T10:00:00.000Z',
  });
  return first;
};

describe('acuerdo del etiquetado (pantalla 19)', () => {
  it('el médico etiqueta a ciegas, se guarda al elegir y avanza su cola', async () => {
    const typing = userEvent.setup();
    const rendered = await open({
      role: 'physician',
      seed: async (api, user) => {
        await assignFirst(api, user);
      },
    });
    const queue = await screen.findByRole('region', { name: text.queue.title }, WAIT);
    expect(await within(queue).findByText(text.queue.remaining(1), undefined, WAIT)).toBeVisible();

    // Abre la pregunta. No muestra la etiqueta del autor y todas empiezan sin etiquetar
    const first = questions.find((question) => question.questionId === sample[0]);
    await typing.click(within(queue).getByText(first?.prompt ?? ''));
    const selects = within(queue).getAllByLabelText(/^Etiqueta del distractor/);
    expect(selects.length).toBeGreaterThan(2);
    for (const select of selects) expect(select).toHaveValue('');

    await typing.selectOptions(selects[0] as HTMLElement, tagB);
    await waitFor(async () => {
      expect(await rendered.api.repos.biasLabels.list()).toHaveLength(1);
    }, WAIT);
    const [saved] = await rendered.api.repos.biasLabels.list();
    expect(saved).toMatchObject({ biasTag: tagB, physicianId: rendered.user.id });
    // La definición de la etiqueta elegida queda a la vista
    const definition =
      TAGGABLE_BIASES.find((bias) => bias.key === tagB)?.distractorDefinition ?? '';
    expect(await within(queue).findByText(definition)).toBeVisible();
    expect(await within(queue).findByText(text.queue.saved, undefined, WAIT)).toBeVisible();

    // Quitar la etiqueta la borra
    await typing.selectOptions(selects[0] as HTMLElement, '');
    await waitFor(async () => {
      expect(await rendered.api.repos.biasLabels.list()).toHaveLength(0);
    }, WAIT);
  });

  it('un médico sin preguntas asignadas no tiene cola', async () => {
    await open({ role: 'physician' });
    const queue = await screen.findByRole('region', { name: text.queue.title }, WAIT);
    expect(await within(queue).findByText(text.queue.empty)).toBeVisible();
  });

  it('el admin ve el tablero y no etiqueta', async () => {
    await open({ role: 'admin' });
    const queue = await screen.findByRole('region', { name: text.queue.title }, WAIT);
    expect(within(queue).getByText(text.queue.adminNote)).toBeVisible();
    expect(within(queue).queryAllByRole('combobox')).toHaveLength(0);
    const stats = screen.getByRole('region', { name: text.stats.label });
    expect(await within(stats).findByText(String(sample.length), undefined, WAIT)).toBeVisible();
  });

  it('sin pares calibra y dice que el alumno ve trampas', async () => {
    await open({ role: 'admin' });
    const title = await screen.findByText(text.vocabulary.title, undefined, WAIT);
    const status = title.closest('[role="status"]') as HTMLElement;
    expect(
      within(status).getAllByText(text.vocabulary.unit, { exact: false }).length,
    ).toBeGreaterThan(0);
    expect(within(status).getByText(text.vocabulary.trap, { exact: false })).toBeVisible();
    expect(screen.getByText(text.byTag.none)).toBeVisible();
  });

  it('con kappa de 0.40 el alumno ve sesgos y con 0.39 ve trampas, y el tablero lo dice', async () => {
    // 55 coincidencias en 100 pares dan kappa de 0.40 exacto
    await open({ role: 'admin', seed: (api) => seedPairs(api, 55) });
    const card = await screen.findByRole('region', { name: text.vocabulary.title }, WAIT);
    expect(within(card).getByText(text.vocabulary.bias)).toBeVisible();
    expect(screen.getByRole('region', { name: text.byTag.title })).toBeVisible();
    // Por etiqueta, con las de menos acuerdo primero
    const table = within(screen.getByRole('region', { name: text.byTag.title })).getByRole('table');
    expect(within(table).getAllByRole('row').length).toBe(5);
  });

  it('con kappa menor a 0.4 dice trampas', async () => {
    await open({ role: 'admin', seed: (api) => seedPairs(api, 40) });
    const card = await screen.findByRole('region', { name: text.vocabulary.title }, WAIT);
    expect(within(card).getByText(text.vocabulary.trap)).toBeVisible();
  });
});
