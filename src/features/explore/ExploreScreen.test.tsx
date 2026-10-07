// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import { newId } from '@/data/testing/fixtures';
import { UserSettingsSchema, type User } from '@/data/schemas/people';
import { deckIds } from '@/demo/content/deckEntities';
import { t } from '@/i18n/es-MX';

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const NOW = '2026-10-01T15:00:00.000Z';
// Un mazo precargado que el alumno sigue, con el ID estable que le da su clave
const FOLLOWED_KEY = 'mazo-precargado-de-prueba';
const PRELOADED_DECK = deckIds.deck(FOLLOWED_KEY);

/** Dos mazos propios con tres notas, y un mazo precargado con una más */
async function seed(api: DataApi, user: User) {
  const own = { ownerId: user.id, origin: 'manual' as const, visibility: 'private' as const };
  const deckA = newId();
  const deckB = newId();
  for (const [id, name] of [
    [deckA, 'Nefrología'],
    [deckB, 'Cardiología'],
  ] as const) {
    await api.repos.decks.put({ id, name, description: '', isDemo: false, createdAt: NOW, ...own });
  }
  await api.repos.decks.put({
    id: PRELOADED_DECK,
    name: 'Mazo de Paco',
    description: '',
    ownerId: null,
    origin: 'preloaded',
    visibility: 'public',
    isDemo: true,
    createdAt: NOW,
  });
  const notes = [
    {
      deckId: deckA,
      front: 'Tratamiento de la hiperpotasemia',
      back: 'Gluconato de calcio',
      tags: ['renal::electrolitos'],
    },
    {
      deckId: deckA,
      front: 'Causa de síndrome nefrótico en niños',
      back: 'Cambios mínimos',
      tags: ['renal'],
    },
    {
      deckId: deckB,
      front: 'Primera línea en insuficiencia cardiaca',
      back: 'IECA y betabloqueador',
      tags: [],
    },
  ];
  for (const note of notes) {
    const id = newId();
    await api.repos.notes.put({
      id,
      ...note,
      origin: 'manual',
      editorialStatus: 'draft',
      sourceQuote: null,
      sourceQuestionVersionId: null,
      isDemo: false,
      createdAt: NOW,
      kind: 'basic',
    });
    await api.repos.cards.put({
      id: newId(),
      noteId: id,
      deckId: note.deckId,
      ordinal: 0,
      createdAt: NOW,
    });
  }
  const pre = newId();
  await api.repos.notes.put({
    id: pre,
    deckId: PRELOADED_DECK,
    tags: ['paco::tema'],
    origin: 'preloaded',
    editorialStatus: 'draft',
    sourceQuote: null,
    sourceQuestionVersionId: null,
    isDemo: true,
    createdAt: NOW,
    kind: 'basic',
    front: 'Precargada sobre diuréticos',
    back: 'Furosemida',
  });
  await api.repos.cards.put({
    id: newId(),
    noteId: pre,
    deckId: PRELOADED_DECK,
    ordinal: 0,
    createdAt: NOW,
  });
}

async function openExplore() {
  app = await renderApp(SCREENS.explore.path, {
    seed,
    user: { settings: UserSettingsSchema.parse({ followedDecks: [FOLLOWED_KEY] }) },
  });
  const list = await screen.findByRole('list', { name: t.explore.list }, { timeout: 10_000 });
  return list;
}

const rowsIn = (list: HTMLElement) => within(list).getAllByRole('listitem');

describe('pantalla de Explorar', () => {
  it('sin tarjetas lo dice y lleva a Mazos', async () => {
    app = await renderApp(SCREENS.explore.path);
    expect(await screen.findByText(t.explore.empty, undefined, { timeout: 10_000 })).toBeVisible();
    // La pestaña y el botón del estado vacío
    expect(screen.getAllByRole('link', { name: t.studyTabs.decks })).toHaveLength(2);
  });

  it('es la tercera pestaña de la sección y lista todas las tarjetas', async () => {
    const list = await openExplore();
    const tabs = screen.getByRole('navigation', { name: t.studyTabs.label });
    expect(within(tabs).getByRole('link', { name: t.studyTabs.explore })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(rowsIn(list)).toHaveLength(4);
    expect(screen.getByText(t.explore.results(4, 4))).toBeVisible();
  });

  it('busca por palabras sin importar acentos, por frase y con exclusiones', async () => {
    const typing = userEvent.setup();
    const list = await openExplore();
    const search = screen.getByRole('searchbox', { name: t.explore.search });
    await typing.type(search, 'nefrologia');
    // El texto de la tarjeta no dice nefrología, pero sí "nefrótico" en una y la otra no coincide
    await waitFor(() => {
      expect(screen.queryByRole('list', { name: t.explore.list })).toBeNull();
    });
    expect(screen.getByText(t.explore.noResults)).toBeVisible();

    await typing.clear(search);
    await typing.type(search, 'tratamiento hiperpotasemia');
    await waitFor(() => {
      expect(rowsIn(screen.getByRole('list', { name: t.explore.list }))).toHaveLength(1);
    });

    await typing.clear(search);
    await typing.type(search, '"insuficiencia cardiaca"');
    await waitFor(() => {
      expect(rowsIn(screen.getByRole('list', { name: t.explore.list }))).toHaveLength(1);
    });

    await typing.clear(search);
    await typing.type(search, '-precargada');
    await waitFor(() => {
      expect(rowsIn(screen.getByRole('list', { name: t.explore.list }))).toHaveLength(3);
    });
    expect(list).toBeDefined();
  });

  it('filtra por mazo y por ruta de etiqueta con todo lo que cuelga de ella', async () => {
    const typing = userEvent.setup();
    await openExplore();
    await typing.selectOptions(screen.getByRole('combobox', { name: t.explore.deck }), [
      screen.getByRole('option', { name: /Cardiología/ }),
    ]);
    await waitFor(() => {
      expect(rowsIn(screen.getByRole('list', { name: t.explore.list }))).toHaveLength(1);
    });
    await typing.click(screen.getByRole('button', { name: t.explore.clear }));
    await waitFor(() => {
      expect(rowsIn(screen.getByRole('list', { name: t.explore.list }))).toHaveLength(4);
    });

    // La ruta renal incluye renal::electrolitos
    await typing.click(screen.getByText(t.explore.tagsTitle));
    await typing.click(screen.getByRole('button', { name: /^renal\s*2$/ }));
    await waitFor(() => {
      expect(rowsIn(screen.getByRole('list', { name: t.explore.list }))).toHaveLength(2);
    });
  });

  it('suspende lo marcado y lo muestra suspendido, y se puede reanudar', async () => {
    const typing = userEvent.setup();
    const list = await openExplore();
    const [first] = rowsIn(list);
    await typing.click(within(first as HTMLElement).getByRole('checkbox'));
    expect(screen.getByText(t.explore.selected(1))).toBeVisible();
    await typing.click(screen.getByRole('button', { name: t.explore.actions.suspend }));
    expect(await screen.findByText(t.explore.actions.suspended(1))).toBeVisible();

    // Aparece como suspendida y el filtro de estado la cuenta
    await typing.click(
      screen.getByRole('button', { name: new RegExp(`^${t.explore.statuses.suspended}\\s*1$`) }),
    );
    await waitFor(() => {
      expect(rowsIn(screen.getByRole('list', { name: t.explore.list }))).toHaveLength(1);
    });
    await typing.click(screen.getByRole('button', { name: t.explore.actions.unsuspend }));
    expect(await screen.findByText(t.explore.actions.unsuspended(1))).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole('list', { name: t.explore.list })).toBeNull();
    });
  });

  it('etiqueta por lote y avisa de las precargadas, que no se editan', async () => {
    const typing = userEvent.setup();
    await openExplore();
    await typing.click(screen.getByRole('checkbox', { name: t.explore.selectPage }));
    await typing.type(
      screen.getByLabelText(t.explore.actions.tagLabel),
      'Repaso rápido::Urgencias',
    );
    await typing.click(screen.getByRole('button', { name: t.explore.actions.addTag }));
    expect(
      await screen.findByText(`${t.explore.actions.tagged(3)} ${t.explore.actions.skipped(1)}`),
    ).toBeVisible();

    // La etiqueta quedó limpia, sin espacios, y ya se puede filtrar por ella
    await typing.click(screen.getByText(t.explore.tagsTitle));
    expect(await screen.findByRole('button', { name: /^Repaso_rápido\s*3$/ })).toBeVisible();
  });

  it('mueve notas a otro mazo propio', async () => {
    const typing = userEvent.setup();
    const list = await openExplore();
    const nefro = rowsIn(list).filter((row) => /hiperpotasemia|nefrótico/.test(row.textContent));
    expect(nefro).toHaveLength(2);
    for (const row of nefro) await typing.click(within(row).getByRole('checkbox'));
    await typing.selectOptions(
      screen.getByRole('combobox', { name: t.explore.actions.moveLabel }),
      [screen.getByRole('option', { name: 'Cardiología' })],
    );
    await typing.click(screen.getByRole('button', { name: t.explore.actions.move }));
    expect(await screen.findByText(t.explore.actions.moved(2))).toBeVisible();
    await typing.selectOptions(screen.getByRole('combobox', { name: t.explore.deck }), [
      screen.getByRole('option', { name: /Cardiología \(3\)/ }),
    ]);
    await waitFor(() => {
      expect(rowsIn(screen.getByRole('list', { name: t.explore.list }))).toHaveLength(3);
    });
  });

  it('no muestra lo de otro perfil ni lo de mazos precargados que no sigues', async () => {
    app = await renderApp(SCREENS.explore.path, {
      user: { settings: UserSettingsSchema.parse({ followedDecks: [FOLLOWED_KEY] }) },
      seed: async (api, user) => {
        await seed(api, user);
        // Un mazo de otro perfil de este mismo navegador y un mazo precargado sin seguir
        const strangers = [
          { id: newId(), ownerId: newId(), origin: 'manual' as const, name: 'Mazo ajeno' },
          {
            id: deckIds.deck('paco-otro'),
            ownerId: null,
            origin: 'preloaded' as const,
            name: 'Sin seguir',
          },
        ];
        for (const stranger of strangers) {
          await api.repos.decks.put({
            ...stranger,
            description: '',
            visibility: 'private',
            isDemo: false,
            createdAt: NOW,
          });
          const noteId = newId();
          await api.repos.notes.put({
            id: noteId,
            deckId: stranger.id,
            tags: [],
            origin: stranger.origin,
            editorialStatus: 'draft',
            sourceQuote: null,
            sourceQuestionVersionId: null,
            isDemo: false,
            createdAt: NOW,
            kind: 'basic',
            front: `Tarjeta de ${stranger.name}`,
            back: 'x',
          });
          await api.repos.cards.put({
            id: newId(),
            noteId,
            deckId: stranger.id,
            ordinal: 0,
            createdAt: NOW,
          });
        }
      },
    });
    const list = await screen.findByRole('list', { name: t.explore.list }, { timeout: 10_000 });
    expect(rowsIn(list)).toHaveLength(4);
    expect(screen.queryByText(/Tarjeta de Mazo ajeno/)).toBeNull();
    expect(screen.queryByText(/Tarjeta de Sin seguir/)).toBeNull();
    // Y el selector de mazos tampoco ofrece los que no se ven
    expect(screen.queryByRole('option', { name: /Mazo ajeno/ })).toBeNull();
  });

  it('la etiqueta de demostración sale con tarjetas de demostración y no sin ellas', async () => {
    const list = await openExplore();
    expect(screen.getAllByText(t.labels.demoContent).length).toBeGreaterThan(0);
    const typing = userEvent.setup();
    await typing.selectOptions(screen.getByRole('combobox', { name: t.explore.deck }), [
      screen.getByRole('option', { name: /Nefrología/ }),
    ]);
    await waitFor(() => {
      expect(screen.queryByText(t.labels.demoContent)).toBeNull();
    });
    expect(list).toBeDefined();
  });

  it('abre una tarjeta para ver sus dos caras', async () => {
    const typing = userEvent.setup();
    const list = await openExplore();
    const row = rowsIn(list).find((item) => item.textContent.includes('hiperpotasemia'));
    await typing.click(
      within(row as HTMLElement).getByRole('button', {
        name: t.explore.seeCardOf('Tratamiento de la hiperpotasemia'),
      }),
    );
    expect(within(row as HTMLElement).getByText(t.explore.front)).toBeVisible();
    expect(within(row as HTMLElement).getByText(t.explore.back)).toBeVisible();
    await typing.click(
      within(row as HTMLElement).getByRole('button', {
        name: t.explore.hideCardOf('Tratamiento de la hiperpotasemia'),
      }),
    );
    expect(within(row as HTMLElement).queryByText(t.explore.front)).toBeNull();
  });
});
