// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import { newId } from '@/data/testing/fixtures';
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

describe('pantalla de Repasar', () => {
  it('sin mazos lo dice y lleva a Mazos', async () => {
    app = await renderApp(SCREENS.review.path);
    expect(
      await screen.findByText(t.review.noDecksTitle, undefined, { timeout: 10_000 }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: t.review.goToDecks })).toBeVisible();
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
});
