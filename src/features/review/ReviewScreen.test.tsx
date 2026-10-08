// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import { newId } from '@/data/testing/fixtures';
import { seedManualCards } from '@/data/testing/seedCards';
import { UserSettingsSchema, type User } from '@/data/schemas/people';
import { t } from '@/i18n/es-MX';

// El confeti usa un canvas que jsdom no trae
vi.mock('@/ui/celebrate', () => ({ celebrate: () => undefined }));

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const NOW = '2026-10-01T15:00:00.000Z';

/** Un mazo propio del alumno con una tarjeta básica, que siempre cuenta como seguido */
function seedDeck(isDemo: boolean) {
  return async (api: DataApi, user: User) => {
    const deckId = newId();
    const noteId = newId();
    await api.repos.decks.put({
      id: deckId,
      name: 'Mi mazo de prueba',
      description: '',
      ownerId: user.id,
      origin: 'manual',
      visibility: 'private',
      isDemo,
      createdAt: NOW,
    });
    await api.repos.notes.put({
      id: noteId,
      deckId,
      tags: [],
      origin: 'manual',
      editorialStatus: 'draft',
      sourceQuote: null,
      sourceQuestionVersionId: null,
      isDemo,
      createdAt: NOW,
      kind: 'basic',
      front: '<p>¿Cuál es el tratamiento de primera línea?</p>',
      back: '<p>Amoxicilina</p>',
    });
    await api.repos.cards.put({ id: newId(), noteId, deckId, ordinal: 0, createdAt: NOW });
  };
}

type Content =
  | { kind: 'basic_reverse'; front: string; back: string }
  | { kind: 'cloze'; text: string; extra: string };

/**
 * Un mazo propio con una sola nota de un tipo con varias cartas. Las cartas se crean en el orden de
 * ordinals y entran a la cola por su ID, así que la primera es la que sale. Las hermanas se
 * entierran para otro día, como en Anki
 */
function seedNoteDeck(content: Content, ordinals: readonly number[]) {
  return async (api: DataApi, user: User) => {
    const deckId = newId();
    const noteId = newId();
    await api.repos.decks.put({
      id: deckId,
      name: 'Mi mazo de prueba',
      description: '',
      ownerId: user.id,
      origin: 'manual',
      visibility: 'private',
      isDemo: false,
      createdAt: NOW,
    });
    await api.repos.notes.put({
      id: noteId,
      deckId,
      tags: [],
      origin: 'manual',
      editorialStatus: 'draft',
      sourceQuote: null,
      sourceQuestionVersionId: null,
      isDemo: false,
      createdAt: NOW,
      ...content,
    });
    for (const ordinal of ordinals) {
      await api.repos.cards.put({ id: newId(), noteId, deckId, ordinal, createdAt: NOW });
    }
  };
}

describe('pantalla de Repasar', () => {
  it('las tarjetas suspendidas no cuentan en el botón de empezar', async () => {
    app = await renderApp(SCREENS.review.path, {
      seed: async (api, user) => {
        await seedManualCards(api, user, { count: 3, suspended: 1 });
      },
    });
    // De tres tarjetas una está suspendida, así que tocan dos
    expect(
      await screen.findByRole('button', { name: t.reviewSetup.start(2) }, { timeout: 10_000 }),
    ).toBeVisible();
  });

  it('con todo suspendido lo dice y lleva a Explorar, no a Mazos', async () => {
    app = await renderApp(SCREENS.review.path, {
      seed: async (api, user) => {
        await seedManualCards(api, user, { count: 3, suspended: 3 });
      },
    });
    expect(
      await screen.findByText(t.review.allSuspendedTitle, undefined, { timeout: 10_000 }),
    ).toBeVisible();
    expect(screen.queryByText(t.review.noDecksTitle)).toBeNull();
    const link = screen.getByRole('link', { name: t.review.goToExplore });
    expect(link).toHaveAttribute('href', SCREENS.explore.path);
  });

  it('sin mazos lo dice y lleva a Mazos', async () => {
    app = await renderApp(SCREENS.review.path);
    expect(
      await screen.findByText(t.review.noDecksTitle, undefined, { timeout: 10_000 }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: t.review.goToDecks })).toBeVisible();
  });

  it('Repasar y Mazos son pestañas de una sola sección y Repasar es la activa aquí', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, { seed: seedDeck(false) });
    await screen.findByRole('button', { name: t.reviewSetup.start(1) }, { timeout: 10_000 });
    const tabs = screen.getByRole('navigation', { name: t.studyTabs.label });
    expect(within(tabs).getByRole('link', { name: t.studyTabs.review })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await typing.click(within(tabs).getByRole('link', { name: t.studyTabs.decks }));
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.decks.title }),
    ).toBeVisible();
    const decksTabs = screen.getByRole('navigation', { name: t.studyTabs.label });
    expect(within(decksTabs).getByRole('link', { name: t.studyTabs.decks })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('ofrece repasar lo que toca y registra la calificación con su XP', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, { seed: seedDeck(false) });
    await typing.click(
      await screen.findByRole('button', { name: t.reviewSetup.start(1) }, { timeout: 10_000 }),
    );

    // Sin pregunta de confianza. Revela la respuesta y califica (D-087)
    expect(await screen.findByText('¿Cuál es el tratamiento de primera línea?')).toBeVisible();
    expect(screen.queryByText('Amoxicilina')).toBeNull();
    expect(screen.queryByRole('button', { name: t.review.confidence.sure })).toBeNull();
    await typing.click(screen.getByRole('button', { name: t.review.show }));
    expect(screen.getByText('Amoxicilina')).toBeVisible();
    await typing.click(
      screen.getByRole('button', { name: new RegExp(`^${t.review.ratings.good}`) }),
    );

    expect(await screen.findByText(t.review.doneTitle)).toBeVisible();
    const { api, user } = app;
    await waitFor(async () => {
      const events = await api.repos.events.query({ userId: user.id });
      const reviewed = events.filter((event) => event.type === 'card_reviewed');
      expect(reviewed).toHaveLength(1);
      expect(reviewed[0]?.payload).toMatchObject({ rating: 'good', confidence: null });
      // Calificar al instante no da XP, para que no se pueda ganar tocando sin leer
      expect(events.some((event) => event.type === 'xp_awarded')).toBe(false);
    });
  });

  it('una tarjeta fallada pregunta la causa y la registra', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, { seed: seedDeck(false) });
    await typing.click(
      await screen.findByRole('button', { name: t.reviewSetup.start(1) }, { timeout: 10_000 }),
    );
    await typing.click(await screen.findByRole('button', { name: t.review.show }));
    await typing.click(
      screen.getByRole('button', { name: new RegExp(`^${t.review.ratings.again}`) }),
    );
    await typing.click(await screen.findByRole('button', { name: t.review.causes.forgot }));
    const { api, user } = app;
    await waitFor(async () => {
      const events = await api.repos.events.query({ userId: user.id });
      expect(events.find((event) => event.type === 'cause_reported')?.payload).toMatchObject({
        targetKind: 'card',
        cause: 'forgot',
      });
    });
  });

  it('con la seguridad encendida la pregunta antes de revelar y la registra', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, {
      seed: seedDeck(false),
      user: { settings: UserSettingsSchema.parse({ cardConfidenceStep: true }) },
    });
    await typing.click(
      await screen.findByRole('button', { name: t.reviewSetup.start(1) }, { timeout: 10_000 }),
    );
    await typing.click(await screen.findByRole('button', { name: t.review.confidence.sure }));
    await typing.click(screen.getByRole('button', { name: t.review.show }));
    await typing.click(
      screen.getByRole('button', { name: new RegExp(`^${t.review.ratings.good}`) }),
    );
    const { api, user } = app;
    await waitFor(async () => {
      const events = await api.repos.events.query({ userId: user.id });
      expect(events.find((event) => event.type === 'card_reviewed')?.payload).toMatchObject({
        confidence: 'sure',
      });
    });
  });

  it('se puede repasar solo con el teclado, Espacio muestra y los números califican', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, { seed: seedDeck(false) });
    await typing.click(
      await screen.findByRole('button', { name: t.reviewSetup.start(1) }, { timeout: 10_000 }),
    );
    await screen.findByText('¿Cuál es el tratamiento de primera línea?');
    (document.activeElement as HTMLElement | null)?.blur();
    await typing.keyboard(' ');
    expect(await screen.findByText('Amoxicilina')).toBeVisible();
    // 1 es Otra vez. La tarjeta pregunta la causa y 2 elige Lo olvidé
    await typing.keyboard('1');
    expect(await screen.findByText(t.review.causeQuestion)).toBeVisible();
    await typing.keyboard('2');
    const { api, user } = app;
    await waitFor(async () => {
      const events = await api.repos.events.query({ userId: user.id });
      expect(events.find((event) => event.type === 'card_reviewed')?.payload).toMatchObject({
        rating: 'again',
      });
      expect(events.find((event) => event.type === 'cause_reported')?.payload).toMatchObject({
        cause: 'forgot',
      });
    });
  });

  it('el contenido de demostración lleva su etiqueta al elegir y en cada tarjeta, y el propio no', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, { seed: seedDeck(true) });
    const start = await screen.findByRole(
      'button',
      { name: t.reviewSetup.start(1) },
      { timeout: 10_000 },
    );
    expect(screen.getAllByText(t.labels.demoContent).length).toBeGreaterThan(0);
    await typing.click(start);
    await screen.findByText('¿Cuál es el tratamiento de primera línea?');
    expect(screen.getAllByText(t.labels.demoContent).length).toBeGreaterThan(0);
  });

  it('un mazo propio no lleva la etiqueta de demostración', async () => {
    app = await renderApp(SCREENS.review.path, { seed: seedDeck(false) });
    await screen.findByRole('button', { name: t.reviewSetup.start(1) }, { timeout: 10_000 });
    expect(screen.queryByText(t.labels.demoContent)).toBeNull();
  });

  it.each([
    { first: 0, asked: 'Fármaco de primera línea', shown: 'Amoxicilina' },
    { first: 1, asked: 'Amoxicilina', shown: 'Fármaco de primera línea' },
  ])(
    'una tarjeta inversa pregunta $asked cuando sale primero la carta $first y muestra $shown',
    async ({ first, asked, shown }) => {
      const typing = userEvent.setup();
      const ordinals = first === 0 ? [0, 1] : [1, 0];
      app = await renderApp(SCREENS.review.path, {
        seed: seedNoteDeck(
          {
            kind: 'basic_reverse',
            front: '<p>Fármaco de primera línea</p>',
            back: '<p>Amoxicilina</p>',
          },
          ordinals,
        ),
      });
      // Las dos cartas son hermanas, así que hoy solo sale una
      await typing.click(
        await screen.findByRole('button', { name: t.reviewSetup.start(1) }, { timeout: 10_000 }),
      );
      expect(await screen.findByText(asked)).toBeVisible();
      expect(screen.queryByText(shown)).toBeNull();
      await typing.click(screen.getByRole('button', { name: t.review.show }));
      expect(screen.getByText(shown)).toBeVisible();
      // La pregunta sigue a la vista junto a la respuesta
      expect(screen.getByText(asked)).toBeVisible();
      await typing.click(
        screen.getByRole('button', { name: new RegExp(`^${t.review.ratings.good}`) }),
      );
      expect(await screen.findByText(t.review.doneTitle)).toBeVisible();
      const { api, user } = app;
      await waitFor(async () => {
        const events = await api.repos.events.query({ userId: user.id });
        const reviewed = events.filter((event) => event.type === 'card_reviewed');
        expect(reviewed).toHaveLength(1);
        const card = (await api.repos.cards.list()).find(
          (entry) => entry.id === reviewed[0]?.payload.cardId,
        );
        expect(card?.ordinal).toBe(first);
      });
    },
  );

  it.each([
    { ordinal: 1, front: '[…]', marked: 'El ventrículo izquierdo bombea a la aorta' },
    { ordinal: 2, front: 'El […] bombea a la aorta', marked: 'ventrículo izquierdo' },
  ])(
    'un cloze anidado en la carta c$ordinal oculta lo que toca y lo revela al mostrar',
    async ({ ordinal, front, marked }) => {
      const typing = userEvent.setup();
      app = await renderApp(SCREENS.review.path, {
        seed: seedNoteDeck(
          {
            kind: 'cloze',
            text: '<p>{{c1::El {{c2::ventrículo izquierdo}} bombea a la aorta}}</p>',
            extra: '',
          },
          ordinal === 1 ? [1, 2] : [2, 1],
        ),
      });
      await typing.click(
        await screen.findByRole('button', { name: t.reviewSetup.start(1) }, { timeout: 10_000 }),
      );
      await screen.findByText('[…]');
      const faces = () =>
        [...document.querySelectorAll('.card-html')].map((face) => face.textContent);
      // En la pregunta no queda nada de lo que se oculta, ni lo del hueco de adentro
      expect(faces()).toEqual([front]);
      await typing.click(screen.getByRole('button', { name: t.review.show }));
      expect(faces()).toEqual([front, 'El ventrículo izquierdo bombea a la aorta']);
      // Se resalta solo el hueco que se preguntó
      expect(screen.getByText(marked, { selector: 'mark' })).toBeVisible();
    },
  );
});
