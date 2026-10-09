// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import type { Deck, Note } from '@/data/schemas/decks';
import type { User } from '@/data/schemas/people';
import { newId } from '@/data/testing/fixtures';
import { TAGGABLE_BIASES } from '@/data/usecases/labeling';
import { biasTaxonomy, biasTips } from '@/demo/content';
import { buildDemoBank } from '@/demo/content/bank';
import { guardRestructure } from '@/engines/aiGuards';
import { mockRestructure } from '@/engines/aiMock';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import { tipReviewId } from '../shared/tipReviews';
import { draftFromVersion } from './editorDraft';
import { buildRestructureInput } from './restructure';

vi.setConfig({ testTimeout: 60_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 30_000 };
const text = physicianText.draftsScreen;
const entries = buildDemoBank().questions;
// Una pregunta suelta cuya propuesta de ejemplo pasa las guardas
const target = entries.find((entry) => {
  const built = buildRestructureInput(entry.question, entry.options, 'to_except');
  return (
    built.ok &&
    entry.question.caseId === null &&
    guardRestructure(mockRestructure(built.input), built.input).passed
  );
});
if (!target) throw new Error('El banco demo no tiene una pregunta que sirva para la prueba');

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
  seed?: (api: DataApi, user: User) => Promise<void>,
) {
  usePreferences.setState({ role });
  app = await renderApp(SCREENS.aiDrafts.path, { seed });
  await screen.findByRole('heading', { level: 1, name: t.screens.aiDrafts.title }, WAIT);
  return app;
}

const section = async (typing: ReturnType<typeof userEvent.setup>, name: string) => {
  await typing.click(await screen.findByRole('button', { name }, WAIT));
};

describe('cola de borradores de IA (pantalla 20)', () => {
  it('muestra las tres secciones y la de preguntas abierta', async () => {
    await open('admin');
    const group = await screen.findByRole('group', { name: text.sections.label }, WAIT);
    expect(within(group).getAllByRole('button')).toHaveLength(3);
    expect(await screen.findByText(text.questions.pendingEmpty, undefined, WAIT)).toBeVisible();
  });

  it('pide una propuesta, la deja como borrador con el original al lado y la rechaza sin crear nada', async () => {
    const typing = userEvent.setup();
    const rendered = await open('physician', async (api, user) => {
      await assign(api, user, target.question.questionId);
    });
    await typing.type(
      await screen.findByLabelText(text.questions.search, undefined, WAIT),
      target.question.prompt.slice(0, 30),
    );
    await typing.click(
      await screen.findByRole('button', { name: new RegExp(`^${text.questions.pick}`) }),
    );
    await typing.click(screen.getByRole('button', { name: text.questions.ask }));

    expect(await screen.findByText(text.questions.created, undefined, WAIT)).toBeVisible();
    const form = await screen.findByRole('form', undefined, WAIT);
    expect(within(form).getByText(text.draftLabel)).toBeVisible();
    expect(within(form).getByText(text.questions.original)).toBeVisible();
    expect(within(form).getByText(text.questions.proposal)).toBeVisible();
    expect(within(form).getByText(text.questions.modes.template ?? '')).toBeVisible();
    expect(await rendered.api.repos.aiArtifacts.list()).toHaveLength(1);

    await typing.click(within(form).getByRole('button', { name: text.questions.reject }));
    expect(await screen.findByText(text.questions.rejectedNotice, undefined, WAIT)).toBeVisible();
    expect((await rendered.api.repos.aiArtifacts.list())[0]).toMatchObject({ status: 'rejected' });
    expect(
      (await rendered.api.repos.questions.listLatest()).every((q) => q.variantOf === undefined),
    ).toBe(true);
  });

  it('un médico sin la pregunta asignada no puede elegirla', async () => {
    const typing = userEvent.setup();
    await open('physician');
    await typing.type(
      await screen.findByLabelText(text.questions.search, undefined, WAIT),
      target.question.prompt.slice(0, 30),
    );
    expect(await screen.findByText(text.questions.noResults, undefined, WAIT)).toBeVisible();
  });

  it('aprobar pide completar etiquetas y razones, y luego crea la variante', async () => {
    const typing = userEvent.setup();
    const rendered = await open('admin');
    await typing.type(
      await screen.findByLabelText(text.questions.search, undefined, WAIT),
      target.question.prompt.slice(0, 30),
    );
    const picks = await screen.findAllByRole('button', {
      name: new RegExp(`^${text.questions.pick}`),
    });
    await typing.click(picks[0] as HTMLElement);
    await typing.click(screen.getByRole('button', { name: text.questions.ask }));
    const form = await screen.findByRole('form', undefined, WAIT);

    // Todavía faltan etiquetas y razones de las opciones que cambiaron de papel
    await typing.click(within(form).getByRole('button', { name: text.questions.approve }));
    const alert = await within(form).findByRole('alert', undefined, WAIT);
    expect(within(alert).getAllByText(/Elige el sesgo|Explica por qué/).length).toBeGreaterThan(0);
    expect(
      (await rendered.api.repos.questions.listLatest()).filter((q) => q.variantOf !== undefined),
    ).toHaveLength(0);

    // Las completa una por una. Abre cada opción con problema
    const groups = within(form).getAllByRole('group', { name: /^Opción \d+$/ });
    for (const group of groups) {
      const tag = within(group).queryByLabelText(physicianText.questionEditor.options.tag);
      const rationale = within(group).getByLabelText(
        physicianText.questionEditor.options.rationale,
      );
      if (!(rationale as HTMLTextAreaElement).value) {
        await typing.type(rationale, 'Justificación escrita por el médico.');
      }
      if (tag && (tag as HTMLSelectElement).value === '') {
        await typing.selectOptions(tag, TAGGABLE_BIASES[0]?.key ?? '');
      }
    }
    await typing.click(within(form).getByRole('button', { name: text.questions.approve }));
    expect(await screen.findByText(text.questions.approvedNotice, undefined, WAIT)).toBeVisible();

    await waitFor(async () => {
      const variants = (await rendered.api.repos.questions.listLatest()).filter(
        (question) => question.variantOf !== undefined,
      );
      expect(variants).toHaveLength(1);
      expect(variants[0]).toMatchObject({
        variantOf: target.question.questionId,
        editorialStatus: 'approved',
      });
    }, WAIT);
    const [artifact] = await rendered.api.repos.aiArtifacts.list();
    expect(artifact).toMatchObject({ status: 'approved', userId: null });
    // Quedó en el historial con enlace a la variante
    await typing.click(screen.getByText(text.questions.decidedTitle));
    expect(
      await screen.findByRole('link', { name: text.questions.openVariant }, WAIT),
    ).toBeVisible();
    // La original sigue como estaba
    expect(
      draftFromVersion(
        (await rendered.api.repos.questions.latest(target.question.questionId)) ?? target.question,
        await rendered.api.repos.options.listForQuestionVersion(target.question.id),
      ).options,
    ).toHaveLength(target.options.length);
  });
});

describe('consejos por sesgo', () => {
  it('aprueba, edita y rechaza el texto base', async () => {
    const typing = userEvent.setup();
    const rendered = await open('admin');
    await section(typing, text.sections.tips);
    const [first, second] = biasTips.tips;
    if (!first || !second) throw new Error('Sin consejos');

    const nameOf = (key: string) =>
      biasTaxonomy.biases.find((bias) => bias.key === key)?.name ?? key;
    const list = await screen.findByRole('region', { name: text.sections.tips }, WAIT);
    const rows = within(list).getAllByRole('listitem');
    // Primero se aprueba tal cual
    await typing.click(within(rows[0] as HTMLElement).getByText(nameOf(first.biasKey)));
    await typing.click(
      within(rows[0] as HTMLElement).getByRole('button', { name: text.tips.approve }),
    );
    await waitFor(async () => {
      expect(await rendered.api.repos.aiArtifacts.get(tipReviewId(first.biasKey))).toMatchObject({
        status: 'approved',
        userId: null,
        kind: 'bias_tip',
      });
    }, WAIT);

    // El segundo se edita y se aprueba
    await typing.click(within(rows[1] as HTMLElement).getByText(nameOf(second.biasKey)));
    const box = within(rows[1] as HTMLElement).getByLabelText(new RegExp(`^${text.tips.text}`));
    await typing.type(box, ' Hazlo cada vez que dudes.');
    await typing.click(
      within(rows[1] as HTMLElement).getByRole('button', { name: text.tips.approve }),
    );
    await waitFor(async () => {
      const saved = await rendered.api.repos.aiArtifacts.get(tipReviewId(second.biasKey));
      expect(saved?.status).toBe('edited');
      expect(saved?.content).toMatchObject({ tip: `${second.tip} Hazlo cada vez que dudes.` });
    }, WAIT);
  });
});

describe('tarjetas de mazos públicos', () => {
  const deck: Deck = {
    id: newId(),
    name: 'Mazo público de prueba',
    description: '',
    ownerId: null,
    origin: 'preloaded',
    visibility: 'public',
    isDemo: true,
    createdAt: '2026-10-01T10:00:00.000Z',
  };
  const card = (front: string) =>
    ({
      id: newId(),
      deckId: deck.id,
      tags: [],
      origin: 'preloaded',
      editorialStatus: 'draft',
      sourceQuote: null,
      sourceQuestionVersionId: null,
      isDemo: true,
      createdAt: '2026-10-01T10:00:00.000Z',
      kind: 'basic' as const,
      front,
      back: 'Reverso de la tarjeta',
    }) satisfies Note;

  it('sin tarjetas pendientes lo dice', async () => {
    const typing = userEvent.setup();
    await open('admin');
    await section(typing, text.sections.cards);
    expect(await screen.findByText(text.cards.empty.title, undefined, WAIT)).toBeVisible();
  });

  it('aprueba una tarjeta y rechaza otra', async () => {
    const typing = userEvent.setup();
    const first = card('Primera tarjeta pendiente');
    const second = card('Segunda tarjeta pendiente');
    const rendered = await open('admin', async (api) => {
      await api.repos.decks.put(deck);
      await api.repos.notes.putMany([first, second]);
    });
    await section(typing, text.sections.cards);
    await typing.click(
      await screen.findByRole('button', { name: `${text.cards.approve}. ${first.front}` }, WAIT),
    );
    await typing.click(
      await screen.findByRole('button', { name: `${text.cards.reject}. ${second.front}` }, WAIT),
    );
    await waitFor(async () => {
      expect((await rendered.api.repos.notes.get(first.id))?.editorialStatus).toBe('approved');
      expect((await rendered.api.repos.notes.get(second.id))?.editorialStatus).toBe('rejected');
    }, WAIT);
    expect(await screen.findByText(text.cards.empty.title, undefined, WAIT)).toBeVisible();
  });
});
