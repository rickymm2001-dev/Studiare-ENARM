// @vitest-environment jsdom
// Buscar tarjetas (B4 del plan del cambio, comentario 11). Busca al teclear, filtra con chips y su
// conteo, ordena por columna, abre una tarjeta en el panel de al lado para verla y editarla, actúa
// por lote y llega con los filtros de siempre por la dirección.
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { DataApi } from '@/data/context';
import type { FsrsCardState } from '@/data/schemas/common';
import { newId, subscribe } from '@/data/testing/fixtures';
import { UserSettingsSchema, type User } from '@/data/schemas/people';
import { deckIds } from '@/demo/content/deckEntities';
import { t } from '@/i18n/es-MX';
import { DESKTOP_QUERY } from '@/ui/hooks/use-media-query';

vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 15_000 };
const NOW = '2026-10-01T15:00:00.000Z';
// Un mazo precargado que el alumno sigue, con el ID estable que le da su clave
const FOLLOWED_KEY = 'mazo-precargado-de-prueba';
const PRELOADED_DECK = deckIds.deck(FOLLOWED_KEY);
const text = t.cardSearch;

/** La pantalla como en la computadora, con la tabla y el panel al lado */
function asDesktop() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === DESKTOP_QUERY,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

const fsrs = (overrides: Partial<FsrsCardState> = {}): FsrsCardState => ({
  due: '2026-10-02T15:00:00.000Z',
  stability: 3,
  difficulty: 5,
  scheduledDays: 3,
  learningSteps: 0,
  reps: 3,
  lapses: 0,
  state: 'review',
  lastReview: '2026-09-29T15:00:00.000Z',
  ...overrides,
});

interface Seeded {
  cards: Record<'hyper' | 'nephrotic' | 'heart' | 'preloaded', string>;
  decks: Record<'nephro' | 'cardio', string>;
}

/** Dos mazos propios con tres notas y un mazo precargado con una más, y algunos repasos */
async function seed(api: DataApi, user: User): Promise<Seeded> {
  const own = { ownerId: user.id, origin: 'manual' as const, visibility: 'private' as const };
  const nephro = newId();
  const cardio = newId();
  for (const [id, name] of [
    [nephro, 'Nefrología'],
    [cardio, 'Cardiología'],
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
      key: 'hyper',
      deckId: nephro,
      front: 'Tratamiento de la hiperpotasemia',
      back: 'Gluconato de calcio',
      tags: ['Renal::Electrolitos'],
      origin: 'manual' as const,
    },
    {
      key: 'nephrotic',
      deckId: nephro,
      front: 'Causa de síndrome nefrótico en niños',
      back: 'Cambios mínimos',
      tags: ['Renal'],
      origin: 'manual' as const,
    },
    {
      key: 'heart',
      deckId: cardio,
      front: 'Primera línea en insuficiencia cardiaca',
      back: 'IECA y betabloqueador',
      tags: [],
      origin: 'manual' as const,
    },
    {
      key: 'preloaded',
      deckId: PRELOADED_DECK,
      front: 'Precargada sobre diuréticos',
      back: 'Furosemida',
      // Cuatro niveles, como muchas notas de Paco. El tema que se ve llega hasta el tercero
      tags: ['Medicina-Interna::Nefrología::Sx-Nefrótico::Cambios_Mínimos'],
      origin: 'preloaded' as const,
    },
  ];
  const cards = {} as Seeded['cards'];
  for (const note of notes) {
    const id = newId();
    const cardId = newId();
    await api.repos.notes.put({
      id,
      deckId: note.deckId,
      tags: note.tags,
      origin: note.origin,
      editorialStatus: 'draft',
      sourceQuote: null,
      sourceQuestionVersionId: null,
      isDemo: note.origin === 'preloaded',
      createdAt: NOW,
      kind: 'basic',
      front: note.front,
      back: note.back,
    });
    await api.repos.cards.put({
      id: cardId,
      noteId: id,
      deckId: note.deckId,
      ordinal: 0,
      createdAt: NOW,
    });
    cards[note.key as keyof Seeded['cards']] = cardId;
  }
  // La de la hiperpotasemia ya toca y la del síndrome nefrótico es sanguijuela
  const review = async (cardId: string, deckId: string, stateAfter: FsrsCardState) => {
    await api.recordEvent({
      id: newId(),
      userId: user.id,
      at: '2026-09-29T15:00:00.000Z',
      tz: user.timeZone,
      schemaVersion: 1,
      sessionId: null,
      type: 'card_reviewed',
      payload: {
        cardId,
        deckId,
        source: 'card',
        rating: 'good',
        confidence: null,
        msToReveal: 1000,
        msToRate: 1000,
        stateBefore: null,
        stateAfter,
      },
    });
  };
  await review(cards.hyper, nephro, fsrs());
  await review(
    cards.nephrotic,
    nephro,
    fsrs({ lapses: DEFAULT_THRESHOLDS.fsrs.leechLapses, due: '2099-01-01T15:00:00.000Z' }),
  );
  return { cards, decks: { nephro, cardio } };
}

async function openSearch(path: string = SCREENS.explore.path) {
  let seeded: Seeded | undefined;
  app = await renderApp(path, {
    seed: async (api, user) => {
      seeded = await seed(api, user);
    },
    user: { settings: UserSettingsSchema.parse({ followedDecks: [FOLLOWED_KEY] }) },
  });
  await screen.findByText(text.results(4, 4), undefined, WAIT);
  return seeded as Seeded;
}

const list = () => screen.getByRole('list', { name: text.resultsLabel });
const listRows = () => within(list()).getAllByRole('listitem');
const table = () => screen.getByRole('table', { name: text.resultsLabel });
/** El frente de cada fila de la tabla, en el orden en que se ve */
const tableFronts = () =>
  within(table())
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('button')[0]?.textContent);

describe('Buscar tarjetas', () => {
  it('sin tarjetas lo dice y lleva a Mazos', async () => {
    app = await renderApp(SCREENS.explore.path, { seed: (api, user) => subscribe(api, user) });
    expect(await screen.findByText(text.empty, undefined, WAIT)).toBeVisible();
    // La pestaña y el botón del estado vacío
    expect(screen.getAllByRole('link', { name: t.studyTabs.decks })).toHaveLength(2);
  });

  it('en Gratis, sin tarjetas, sugiere crear un mazo propio y no seguir uno del catálogo', async () => {
    app = await renderApp(SCREENS.explore.path);
    expect(await screen.findByText(t.freePlan.catalog.exploreEmpty, undefined, WAIT)).toBeVisible();
    expect(screen.queryByText(text.empty)).toBeNull();
  });

  it('es la tercera pestaña de Repasar, se llama Buscar tarjetas y lista todas las tarjetas', async () => {
    await openSearch();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Buscar tarjetas');
    const tabs = screen.getByRole('navigation', { name: t.studyTabs.label });
    expect(within(tabs).getByRole('link', { name: 'Buscar tarjetas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(listRows()).toHaveLength(4);
  });

  it('busca al teclear sin importar acentos, por frase, con exclusiones y por el nombre del tema', async () => {
    const typing = userEvent.setup();
    await openSearch();
    const search = screen.getByRole('searchbox', { name: text.searchLabel });
    await typing.type(search, 'hiperpotasemia tratamiento');
    await waitFor(() => {
      expect(listRows()).toHaveLength(1);
    });
    await typing.clear(search);
    await typing.type(search, '"insuficiencia cardiaca"');
    await waitFor(() => {
      expect(listRows()).toHaveLength(1);
    });
    await typing.clear(search);
    await typing.type(search, '-precargada');
    await waitFor(() => {
      expect(listRows()).toHaveLength(3);
    });
    // Sx-Nefrótico se lee Síndrome nefrótico con la tabla de nombres
    await typing.clear(search);
    await typing.type(search, 'sindrome nefrotico');
    await waitFor(() => {
      expect(listRows()).toHaveLength(2);
    });
    await typing.clear(search);
    await typing.type(search, 'zzzzxqj');
    expect(await screen.findByText(text.noResults)).toBeVisible();
  });

  it('los chips dicen su conteo y filtran por mazo, tema, estado, vencidas y sanguijuelas', async () => {
    asDesktop();
    const typing = userEvent.setup();
    await openSearch();
    const filters = screen.getByRole('group', { name: text.filtersLabel });
    // Los chips que se prenden cuentan lo que darían
    expect(
      within(filters).getByRole('button', { name: new RegExp(`^${text.due}\\s*1$`) }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      within(filters).getByRole('button', { name: new RegExp(`^${text.leech}\\s*1$`) }),
    ).toBeVisible();
    expect(
      within(filters).getByRole('button', { name: new RegExp(`^${text.flagged}\\s*0$`) }),
    ).toBeVisible();

    // Mazo, con los mazos y su conteo
    await typing.click(within(filters).getByRole('button', { name: text.deck }));
    const deckPanel = screen.getByRole('group', { name: text.deck });
    await typing.click(within(deckPanel).getByRole('button', { name: /^Nefrología\s*2$/ }));
    await waitFor(() => {
      expect(tableFronts()).toHaveLength(2);
    });
    expect(
      within(filters).getByRole('button', {
        name: new RegExp(`^${text.chipValue(text.deck, 'Nefrología')}\\s*2$`),
      }),
    ).toBeVisible();

    // Dentro de Nefrología, las vencidas
    await typing.click(within(filters).getByRole('button', { name: new RegExp(`^${text.due}`) }));
    await waitFor(() => {
      expect(tableFronts()).toEqual(['Tratamiento de la hiperpotasemia']);
    });
    await typing.click(within(filters).getByRole('button', { name: text.clear }));
    await waitFor(() => {
      expect(tableFronts()).toHaveLength(4);
    });

    // Tema, de la rama al tema más fino
    await typing.click(within(filters).getByRole('button', { name: text.topic }));
    const topicPanel = screen.getByRole('group', { name: text.topic });
    await typing.click(within(topicPanel).getByRole('button', { name: /^Renal\s*2$/ }));
    await waitFor(() => {
      expect(tableFronts()).toHaveLength(2);
    });
    await typing.click(within(filters).getByRole('button', { name: /^Tema, Renal/ }));
    await typing.click(
      within(screen.getByRole('group', { name: text.topic })).getByRole('button', {
        name: /^Síndrome nefrótico\s*1$/,
      }),
    );
    await waitFor(() => {
      expect(tableFronts()).toEqual(['Precargada sobre diuréticos']);
    });
    await typing.click(within(filters).getByRole('button', { name: text.clear }));

    // Estado, que se combina con O
    await typing.click(within(filters).getByRole('button', { name: text.status }));
    const statusPanel = screen.getByRole('group', { name: text.status });
    await typing.click(
      within(statusPanel).getByRole('button', { name: new RegExp(`^${text.statuses.new}\\s*2$`) }),
    );
    await waitFor(() => {
      expect(tableFronts()).toHaveLength(2);
    });
    // Escape cierra las opciones y regresa el foco a su chip
    fireEvent.keyDown(statusPanel, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: text.status })).toBeNull();
    expect(document.activeElement).toHaveAccessibleName(
      new RegExp(`^${text.chipValue(text.status, text.statuses.new)}`),
    );
  });

  it('ordena por columna y tocarla otra vez invierte el orden', async () => {
    asDesktop();
    const typing = userEvent.setup();
    await openSearch();
    const front = within(table()).getByRole('button', { name: text.sortBy(text.columns.front) });
    await typing.click(front);
    await waitFor(() => {
      expect(tableFronts()).toEqual([
        'Causa de síndrome nefrótico en niños',
        'Precargada sobre diuréticos',
        'Primera línea en insuficiencia cardiaca',
        'Tratamiento de la hiperpotasemia',
      ]);
    });
    expect(front.closest('th')).toHaveAttribute('aria-sort', 'ascending');
    await typing.click(front);
    await waitFor(() => {
      expect(tableFronts()[0]).toBe('Tratamiento de la hiperpotasemia');
    });
    expect(front.closest('th')).toHaveAttribute('aria-sort', 'descending');

    // Por fallos, la sanguijuela primero
    await typing.click(
      within(table()).getByRole('button', { name: text.sortBy(text.columns.lapses) }),
    );
    await waitFor(() => {
      expect(tableFronts()[0]).toBe('Causa de síndrome nefrótico en niños');
    });
    // Por próximo repaso, las nuevas al final
    await typing.click(
      within(table()).getByRole('button', { name: text.sortBy(text.columns.due) }),
    );
    await waitFor(() => {
      expect(tableFronts().slice(0, 2)).toEqual([
        'Tratamiento de la hiperpotasemia',
        'Causa de síndrome nefrótico en niños',
      ]);
    });
  });

  it('abre una tarjeta en el panel, la edita y la lista sigue a la vista', async () => {
    asDesktop();
    const typing = userEvent.setup();
    await openSearch();
    await typing.click(
      within(table()).getByRole('button', { name: 'Tratamiento de la hiperpotasemia' }),
    );
    const panel = await screen.findByRole('region', { name: text.panel.label });
    expect(within(panel).getByText('Gluconato de calcio')).toBeVisible();
    expect(within(panel).getByText('Renal › Electrolitos')).toBeVisible();
    expect(table()).toBeVisible();
    // Con el panel abierto la tabla deja Intervalo y Fallos, que el panel ya dice
    const sortButton = (column: keyof typeof text.columns) =>
      within(table()).queryByRole('button', { name: text.sortBy(text.columns[column]) });
    expect(sortButton('interval')).toBeNull();
    expect(sortButton('lapses')).toBeNull();
    expect(sortButton('due')).toBeVisible();
    expect(within(panel).getByText(text.panel.lapses)).toBeVisible();

    await typing.click(within(panel).getByRole('button', { name: text.panel.edit }));
    const front = within(panel).getByLabelText(t.decks.editor.front);
    await typing.clear(front);
    await typing.type(front, 'Manejo de la hiperpotasemia');
    const tags = within(panel).getByLabelText(text.panel.tagsLabel);
    await typing.clear(tags);
    await typing.type(tags, 'Renal::Electrolitos Urgencias');
    await typing.click(within(panel).getByRole('button', { name: text.panel.save }));
    expect(await within(panel).findByText(text.panel.saved)).toBeVisible();
    await waitFor(() => {
      expect(tableFronts()).toContain('Manejo de la hiperpotasemia');
    });
    const notes = await app?.api.repos.notes.list();
    expect(
      notes?.find((note) => note.kind === 'basic' && note.front.includes('Manejo'))?.tags,
    ).toEqual(['Renal::Electrolitos', 'Urgencias']);

    // Escape cierra el panel y la tabla sigue igual, otra vez con todas sus columnas
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: text.panel.label })).toBeNull();
    });
    expect(tableFronts()).toHaveLength(4);
    expect(sortButton('interval')).toBeVisible();
    expect(sortButton('lapses')).toBeVisible();
  });

  it('una precargada se ve en el panel pero no se edita, solo se suspende o se reinicia', async () => {
    asDesktop();
    const typing = userEvent.setup();
    await openSearch();
    await typing.click(
      within(table()).getByRole('button', { name: 'Precargada sobre diuréticos' }),
    );
    const panel = await screen.findByRole('region', { name: text.panel.label });
    expect(within(panel).getByText(text.panel.preloaded)).toBeVisible();
    expect(within(panel).queryByRole('button', { name: text.panel.edit })).toBeNull();
    // Su tema sale de la etiqueta con nombres legibles, hasta el tercer nivel como en Repasar, en el
    // panel y en la columna de tema
    expect(
      within(panel).getByText('Medicina interna › Nefrología › Síndrome nefrótico'),
    ).toBeVisible();
    const row = within(table())
      .getAllByRole('row')
      .find((candidate) =>
        within(candidate).queryByRole('button', { name: 'Precargada sobre diuréticos' }),
      );
    expect(row && within(row).getByText('Síndrome nefrótico')).toBeVisible();
    expect(screen.queryByText(/Cambios Mínimos/)).toBeNull();
    await typing.click(within(panel).getByRole('button', { name: text.panel.suspend }));
    expect(await within(panel).findByText(text.panel.suspended)).toBeVisible();
    expect(within(panel).getByRole('button', { name: text.panel.resume })).toBeVisible();
  });

  it('reiniciar desde el panel no pierde el foco', async () => {
    asDesktop();
    const typing = userEvent.setup();
    const { cards } = await openSearch();
    await typing.click(
      within(table()).getByRole('button', { name: 'Causa de síndrome nefrótico en niños' }),
    );
    const panel = await screen.findByRole('region', { name: text.panel.label });
    const reset = within(panel).getByRole('button', { name: text.panel.reset });

    // Al pedir la confirmación el foco pasa a Sí, reiniciar. Reiniciar no se deshabilita
    await typing.click(reset);
    expect(within(panel).getByRole('button', { name: text.panel.resetYes })).toHaveFocus();
    expect(reset).toBeEnabled();
    expect(reset).toHaveAttribute('aria-expanded', 'true');
    // Cancelar la regresa a Reiniciar
    await typing.click(within(panel).getByRole('button', { name: text.panel.resetNo }));
    expect(reset).toHaveFocus();
    expect(within(panel).queryByRole('button', { name: text.panel.resetYes })).toBeNull();

    // Con el teclado, confirmar también la regresa a Reiniciar
    await typing.keyboard('{Enter}');
    expect(within(panel).getByRole('button', { name: text.panel.resetYes })).toHaveFocus();
    await typing.keyboard('{Enter}');
    expect(await within(panel).findByText(text.panel.wasReset)).toBeVisible();
    expect(within(panel).getByRole('button', { name: text.panel.reset })).toHaveFocus();
    const events = (await app?.api.repos.events.query({ userId: app.user.id })) ?? [];
    expect(events.at(-1)?.payload).toEqual({ cardIds: [cards.nephrotic] });
  });

  it('suspende varias por lote con eventos y se pueden reanudar', async () => {
    asDesktop();
    const typing = userEvent.setup();
    const { cards } = await openSearch();
    await typing.click(
      screen.getByRole('checkbox', { name: text.selectRow('Tratamiento de la hiperpotasemia') }),
    );
    await typing.click(
      screen.getByRole('checkbox', { name: text.selectRow('Precargada sobre diuréticos') }),
    );
    const actions = screen.getByRole('region', { name: text.actions.title });
    expect(within(actions).getByText(text.selected(2))).toBeVisible();
    await typing.click(within(actions).getByRole('button', { name: text.actions.suspend }));
    expect(await screen.findByText(text.actions.suspended(2))).toBeVisible();
    const events = await app?.api.repos.events.query({ userId: app.user.id });
    const suspended = events?.filter((event) => event.type === 'cards_suspended');
    expect(suspended).toHaveLength(1);
    expect(
      suspended?.[0]?.type === 'cards_suspended' ? [...suspended[0].payload.cardIds].sort() : [],
    ).toEqual([cards.hyper, cards.preloaded].sort());

    // El chip de estado las cuenta y reanudarlas las regresa
    const filters = screen.getByRole('group', { name: text.filtersLabel });
    await typing.click(within(filters).getByRole('button', { name: text.status }));
    expect(
      within(screen.getByRole('group', { name: text.status })).getByRole('button', {
        name: new RegExp(`^${text.statuses.suspended}\\s*2$`),
      }),
    ).toBeVisible();
    await typing.click(within(actions).getByRole('button', { name: text.actions.unsuspend }));
    expect(await screen.findByText(text.actions.unsuspended(2))).toBeVisible();
  });

  it('reinicia por lote después de confirmar, con un evento que solo se agrega', async () => {
    asDesktop();
    const typing = userEvent.setup();
    const { cards } = await openSearch();
    await typing.click(
      within(table()).getByRole('button', { name: text.sortBy(text.columns.front) }),
    );
    await typing.click(
      screen.getByRole('checkbox', {
        name: text.selectRow('Causa de síndrome nefrótico en niños'),
      }),
    );
    const actions = screen.getByRole('region', { name: text.actions.title });
    await typing.click(within(actions).getByRole('button', { name: text.actions.reset }));
    expect(within(actions).getByText(text.actions.resetConfirm(1))).toBeVisible();
    await typing.click(within(actions).getByRole('button', { name: text.actions.resetYes }));
    expect(await screen.findByText(text.actions.wasReset(1))).toBeVisible();
    const events = (await app?.api.repos.events.query({ userId: app.user.id })) ?? [];
    expect(events.map((event) => event.type)).toEqual([
      'card_reviewed',
      'card_reviewed',
      'cards_reset',
    ]);
    expect(events.at(-1)?.payload).toEqual({ cardIds: [cards.nephrotic] });
    // Ya no es sanguijuela ni tiene fecha
    await waitFor(() => {
      expect(
        within(screen.getByRole('group', { name: text.filtersLabel })).getByRole('button', {
          name: new RegExp(`^${text.leech}\\s*0$`),
        }),
      ).toBeVisible();
    });
  });

  it('mueve notas a otro mazo propio y etiqueta por lote sin tocar las precargadas', async () => {
    const typing = userEvent.setup();
    await openSearch();
    await typing.click(screen.getByRole('button', { name: text.selectAll(4) }));
    const actions = screen.getByRole('region', { name: text.actions.title });
    await typing.click(within(actions).getByRole('button', { name: text.actions.tag }));
    await typing.type(within(actions).getByLabelText(text.actions.tagLabel), 'Repaso rápido');
    await typing.click(within(actions).getByRole('button', { name: text.actions.addTag }));
    expect(
      await screen.findByText(`${text.actions.tagged(3)} ${text.actions.skipped(1)}`),
    ).toBeVisible();

    await typing.click(within(actions).getByRole('button', { name: text.actions.move }));
    await typing.selectOptions(within(actions).getByLabelText(text.actions.moveLabel), [
      within(actions).getByRole('option', { name: 'Cardiología' }),
    ]);
    await typing.click(within(actions).getByRole('button', { name: text.actions.moveHere }));
    expect(
      await screen.findByText(`${text.actions.moved(2)} ${text.actions.skipped(1)}`),
    ).toBeVisible();
  });

  it('llega con el chip de sanguijuelas puesto desde el enlace de Repasar', async () => {
    asDesktop();
    let seeded: Seeded | undefined;
    app = await renderApp(`${SCREENS.explore.path}?estado=sanguijuelas`, {
      seed: async (api, user) => {
        seeded = await seed(api, user);
      },
      user: { settings: UserSettingsSchema.parse({ followedDecks: [FOLLOWED_KEY] }) },
    });
    expect(await screen.findByText(text.results(1, 4), undefined, WAIT)).toBeVisible();
    expect(seeded).toBeDefined();
    const filters = screen.getByRole('group', { name: text.filtersLabel });
    expect(
      within(filters).getByRole('button', { name: new RegExp(`^${text.leech}\\s*1$`) }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(tableFronts()).toEqual(['Causa de síndrome nefrótico en niños']);
  });

  it('con el teclado, / busca, las flechas mueven, Enter abre y el panel sigue a la fila', async () => {
    asDesktop();
    const typing = userEvent.setup();
    await openSearch();
    await typing.click(
      within(table()).getByRole('button', { name: text.sortBy(text.columns.front) }),
    );
    await typing.click(screen.getByRole('heading', { level: 1 }));
    await typing.keyboard('/');
    const search = screen.getByRole('searchbox', { name: text.searchLabel });
    expect(search).toHaveFocus();
    await typing.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveTextContent('Causa de síndrome nefrótico en niños');
    await typing.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveTextContent('Precargada sobre diuréticos');
    await typing.keyboard('{Enter}');
    const panel = await screen.findByRole('region', { name: text.panel.label });
    expect(
      within(panel).getByRole('heading', { name: 'Precargada sobre diuréticos' }),
    ).toBeVisible();
    await typing.keyboard('{ArrowDown}');
    expect(
      within(screen.getByRole('region', { name: text.panel.label })).getByRole('heading', {
        name: 'Primera línea en insuficiencia cardiaca',
      }),
    ).toBeVisible();
    await typing.keyboard('x');
    expect(
      screen.getByRole('checkbox', {
        name: text.selectRow('Primera línea en insuficiencia cardiaca'),
      }),
    ).toBeChecked();
    // La ayuda dice lo que hace X, seleccionar, y no marcar, para no confundirlo con Marcadas por
    // la IA
    const hint = screen.getByText(`${text.shortcuts.label}.`).parentElement;
    expect(hint).toHaveTextContent('X seleccionar');
    expect(hint).not.toHaveTextContent('marcar');
    await typing.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: text.panel.label })).toBeNull();
    });
    expect(document.activeElement).toHaveTextContent('Primera línea en insuficiencia cardiaca');
  });

  it('no muestra lo de otro perfil ni lo de mazos precargados que no sigues', async () => {
    app = await renderApp(SCREENS.explore.path, {
      user: { settings: UserSettingsSchema.parse({ followedDecks: [FOLLOWED_KEY] }) },
      seed: async (api, user) => {
        await seed(api, user);
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
    expect(await screen.findByText(text.results(4, 4), undefined, WAIT)).toBeVisible();
    expect(screen.queryByText(/Tarjeta de Mazo ajeno/)).toBeNull();
    expect(screen.queryByText(/Tarjeta de Sin seguir/)).toBeNull();
  });
});
