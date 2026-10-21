// @vitest-environment jsdom
// Acuerdo del etiquetado (pantalla 19, 4.4 del plan de B11) con el repositorio local de la demo. El
// tablero compara la etiqueta del autor, que en la demo es la del banco, con la que puso a ciegas el
// revisor. Debajo, las preguntas en revisión que al médico le faltan por etiquetar.
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { DataApi } from '@/data/context';
import type { BiasLabel } from '@/data/schemas/bank';
import type { User } from '@/data/schemas/people';
import { newId } from '@/data/testing/fixtures';
import { TAGGABLE_BIASES } from '@/data/usecases/labeling';
import { ensureDemoBank } from '@/data/usecases/bank';
import { buildDemoBank } from '@/demo/content/bank';
import { calibrationAdminTexts } from '@/i18n/calibrationAdmin';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';

vi.setConfig({ testTimeout: 60_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 30_000 };
const demo = buildDemoBank();
const text = physicianText.agreementScreen;
const tags = TAGGABLE_BIASES.map((bias) => bias.key);
const distractors = demo.questions
  .flatMap((entry) => entry.options)
  .filter((option) => !option.isCorrect && option.biasTag !== null);

const putLabel = (api: DataApi, optionId: string, physicianId: string, biasTag: string) =>
  api.repos.biasLabels.put({
    id: newId(),
    optionId,
    physicianId,
    biasTag,
    labeledAt: '2026-10-08T10:00:00.000Z',
  } satisfies BiasLabel);

/** Etiquetas a ciegas de un revisor sobre distractores del banco. agree dice si coincide con el autor */
async function seedPairs(api: DataApi, count: number, agree: (index: number) => boolean) {
  const reviewer = newId();
  for (const [index, option] of distractors.slice(0, count).entries()) {
    const author = option.biasTag ?? '';
    const other = tags.find((tag) => tag !== author) ?? author;
    await putLabel(api, option.optionId, reviewer, agree(index) ? author : other);
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

/** Asigna al médico la primera pregunta del banco y la deja en revisión */
const assignInReview = async (api: DataApi, user: User) => {
  await ensureDemoBank(api);
  const first = demo.questions[0]?.question;
  if (!first) throw new Error('Sin banco');
  await api.repos.reviewAssignments.put({
    id: newId(),
    questionId: first.questionId,
    physicianId: user.id,
    assignedBy: null,
    assignedAt: '2026-10-08T10:00:00.000Z',
  });
  await api.repos.questions.setEditorialStatus(first.id, 'in_review');
  return first;
};

describe('acuerdo del etiquetado (pantalla 19)', () => {
  it('el médico ve las preguntas en revisión que le faltan por etiquetar a ciegas, con su enlace', async () => {
    await open({
      role: 'physician',
      seed: async (api, user) => {
        await assignInReview(api, user);
      },
    });
    const queue = await screen.findByRole('region', { name: text.queue.title }, WAIT);
    expect(await within(queue).findByText(text.queue.remaining(1), undefined, WAIT)).toBeVisible();
    const link = within(queue).getByRole('link', { name: text.queue.open });
    expect(link).toHaveAttribute(
      'href',
      `${SCREENS.questionEditor.path}?pregunta=${demo.questions[0]?.question.questionId ?? ''}`,
    );
    const stats = screen.getByRole('region', { name: text.stats.label });
    expect(within(stats).getByText('1')).toBeVisible();
  });

  it('una pregunta asignada que no está en revisión no entra a la cola', async () => {
    await open({
      role: 'physician',
      seed: async (api, user) => {
        const first = await assignInReview(api, user);
        await api.repos.questions.setEditorialStatus(first.id, 'draft');
      },
    });
    const queue = await screen.findByRole('region', { name: text.queue.title }, WAIT);
    expect(await within(queue).findByText(text.queue.empty, undefined, WAIT)).toBeVisible();
  });

  it('un médico sin preguntas asignadas no tiene cola', async () => {
    await open({ role: 'physician' });
    const queue = await screen.findByRole('region', { name: text.queue.title }, WAIT);
    expect(await within(queue).findByText(text.queue.empty, undefined, WAIT)).toBeVisible();
  });

  it('en la demostración el historial por noche dice que no hay calibración nocturna (B14)', async () => {
    await open({ role: 'physician' });
    const history = await screen.findByRole(
      'region',
      { name: calibrationAdminTexts.agreementHistory.title },
      WAIT,
    );
    expect(within(history).getByText(calibrationAdminTexts.agreementHistory.local)).toBeVisible();
    expect(within(history).queryByRole('table')).toBeNull();
  });

  it('el admin ve el tablero y no etiqueta', async () => {
    await open({ role: 'admin' });
    const queue = await screen.findByRole('region', { name: text.queue.title }, WAIT);
    expect(within(queue).getByText(text.queue.adminNote)).toBeVisible();
    expect(within(queue).queryAllByRole('link')).toHaveLength(0);
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

  it('con 29 pares sigue calibrando aunque coincidan todos', async () => {
    const minPairs = DEFAULT_THRESHOLDS.bias.minLabeledPairs;
    await open({ role: 'admin', seed: (api) => seedPairs(api, minPairs - 1, () => true) });
    const title = await screen.findByText(text.vocabulary.title, undefined, WAIT);
    expect(title.closest('[role="status"]')).not.toBeNull();
    const stats = screen.getByRole('region', { name: text.stats.label });
    expect(within(stats).getByText(String(minPairs - 1))).toBeVisible();
    // Un kappa de pocos pares es ruido. Mientras calibra no se muestra
    expect(within(stats).getByText(text.stats.noKappa)).toBeVisible();
  });

  it('con 30 pares que coinciden el alumno ve sesgos y el tablero lista el acuerdo por etiqueta', async () => {
    await open({ role: 'admin', seed: (api) => seedPairs(api, 40, () => true) });
    const card = await screen.findByRole('region', { name: text.vocabulary.title }, WAIT);
    expect(within(card).getByText(text.vocabulary.bias)).toBeVisible();
    const table = within(screen.getByRole('region', { name: text.byTag.title })).getByRole('table');
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);
  });

  it('con poco acuerdo dice trampas', async () => {
    await open({ role: 'admin', seed: (api) => seedPairs(api, 40, (index) => index % 4 === 0) });
    const card = await screen.findByRole('region', { name: text.vocabulary.title }, WAIT);
    expect(within(card).getByText(text.vocabulary.trap)).toBeVisible();
  });
});
