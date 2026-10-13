// @vitest-environment jsdom
// Cada mazo en Repasar dice su rama y todos sus temas (B4 del plan del cambio, comentario 8). Los
// de un mazo precargado salen de la etiqueta de cada nota, con nombres legibles, y los de un mazo
// propio de sus submazos. Las tarjetas suspendidas también cuentan, porque siguen en el mazo.
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import { newId } from '@/data/testing/fixtures';
import { UserSettingsSchema, type User } from '@/data/schemas/people';
import { deckIds } from '@/demo/content/deckEntities';
import { t } from '@/i18n/es-MX';

vi.mock('@/ui/celebrate', () => ({ celebrate: () => undefined }));
vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const NOW = '2026-10-01T15:00:00.000Z';
const KEY = 'paco-prueba';

async function seed(api: DataApi, user: User) {
  const preloaded = deckIds.deck(KEY);
  const own = newId();
  const ownChild = newId();
  await api.repos.decks.putMany([
    {
      id: preloaded,
      name: 'Medicina interna (Paco)',
      description: '',
      ownerId: null,
      origin: 'preloaded',
      visibility: 'public',
      isDemo: true,
      createdAt: NOW,
    },
    {
      id: own,
      name: 'Mi residencia',
      description: '',
      ownerId: user.id,
      origin: 'manual',
      visibility: 'private',
      isDemo: false,
      createdAt: NOW,
    },
    {
      id: ownChild,
      name: 'Cardiología',
      description: '',
      ownerId: user.id,
      origin: 'manual',
      visibility: 'private',
      isDemo: false,
      parentId: own,
      createdAt: NOW,
    },
  ]);
  const notes = [
    { deckId: preloaded, tags: ['Medicina-Interna::Reumatología::LES'], origin: 'preloaded' },
    { deckId: preloaded, tags: ['Medicina-Interna::Reumatología::AR'], origin: 'preloaded' },
    { deckId: preloaded, tags: ['Medicina-Interna::Nefrología::ERC'], origin: 'preloaded' },
    { deckId: ownChild, tags: [], origin: 'manual' },
  ] as const;
  for (const [index, note] of notes.entries()) {
    const noteId = newId();
    await api.repos.notes.put({
      id: noteId,
      deckId: note.deckId,
      tags: [...note.tags],
      origin: note.origin,
      editorialStatus: 'draft',
      sourceQuote: null,
      sourceQuestionVersionId: null,
      isDemo: note.origin === 'preloaded',
      createdAt: NOW,
      kind: 'basic',
      front: `Pregunta ${String(index)}`,
      back: `Respuesta ${String(index)}`,
    });
    await api.repos.cards.put({
      id: newId(),
      noteId,
      deckId: note.deckId,
      ordinal: 0,
      createdAt: NOW,
    });
  }
}

describe('temas de cada mazo en Repasar', () => {
  it('cada mazo dice su rama y todos sus temas en orden alfabético', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, {
      seed,
      user: { settings: UserSettingsSchema.parse({ followedDecks: [KEY] }) },
    });
    await screen.findByText(t.reviewSetup.title, undefined, { timeout: 15_000 });
    await typing.click(screen.getByText(t.reviewSetup.filters));
    expect(screen.getByLabelText('Medicina interna (Paco)')).toBeChecked();

    // Al abrir Mazos y temas la lista de cada mazo ya está abierta, sin un segundo pliegue
    const topics = screen.getByRole('list', {
      name: t.deckTopics.listLabel('Medicina interna (Paco)'),
    });
    expect(topics).toBeVisible();
    expect(topics.closest('details')?.querySelector(':scope > summary')).toHaveTextContent(
      t.reviewSetup.filters,
    );
    expect(screen.queryByText(t.deckTopics.title)).toBeNull();
    const rheumatology = within(topics).getByRole('list', { name: 'Reumatología' });
    expect(
      within(rheumatology)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Artritis reumatoide', 'Lupus eritematoso sistémico']);
    expect(
      within(within(topics).getByRole('list', { name: 'Nefrología' })).getByText(
        'Enfermedad renal crónica',
      ),
    ).toBeInTheDocument();

    // El mazo propio dice sus submazos
    const own = screen.getByRole('list', { name: t.deckTopics.listLabel('Mi residencia') });
    expect(within(own).getByText('Cardiología')).toBeInTheDocument();
  });
});
