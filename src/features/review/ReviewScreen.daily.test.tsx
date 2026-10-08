// @vitest-environment jsdom
// Carga diaria en Repasar (D-085, fila 8). Los tres contadores, el temporizador opcional y el flujo
// de sanguijuelas, con una tarjeta que ya se olvidó 7 veces y se olvida la octava.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import type { FsrsCardState } from '@/data/schemas/common';
import { UserSettingsSchema, type User } from '@/data/schemas/people';
import { newId } from '@/data/testing/fixtures';
import { seedManualCards } from '@/data/testing/seedCards';
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

/** Una tarjeta ya repasada que venció ayer y lleva 7 olvidos, con el mazo propio o generado */
function seedLeech(options: { editable: boolean; lapses?: number }) {
  return async (api: DataApi, user: User) => {
    const deckId = newId();
    const noteId = newId();
    const cardId = newId();
    await api.repos.decks.put({
      id: deckId,
      name: 'Mazo de sanguijuelas',
      description: '',
      ownerId: user.id,
      origin: options.editable ? 'manual' : 'generated',
      visibility: 'private',
      isDemo: false,
      createdAt: NOW,
    });
    await api.repos.notes.put({
      id: noteId,
      deckId,
      tags: [],
      origin: options.editable ? 'manual' : 'generated',
      editorialStatus: 'draft',
      sourceQuote: options.editable ? null : 'Frase de la fuente',
      sourceQuestionVersionId: options.editable ? null : newId(),
      isDemo: false,
      createdAt: NOW,
      kind: 'basic',
      front: '<p>¿Cuál es el tratamiento de primera línea?</p>',
      back: '<p>Amoxicilina</p>',
    });
    await api.repos.cards.put({ id: cardId, noteId, deckId, ordinal: 0, createdAt: NOW });
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const state: FsrsCardState = {
      due: yesterday,
      stability: 4,
      difficulty: 7,
      scheduledDays: 3,
      learningSteps: 0,
      reps: 12,
      lapses: options.lapses ?? 7,
      state: 'review',
      lastReview: new Date(Date.now() - 4 * 86_400_000).toISOString(),
    };
    await api.recordEvent(
      createEvent(
        'card_reviewed',
        {
          cardId,
          deckId,
          source: 'card',
          rating: 'good',
          confidence: null,
          msToReveal: 1000,
          msToRate: 1000,
          stateBefore: null,
          stateAfter: state,
        },
        {
          userId: user.id,
          tz: user.timeZone,
          clock: { now: () => new Date(Date.now() - 3600_000 * 24 * 2) },
        },
      ),
    );
  };
}

async function startSession(typing: ReturnType<typeof userEvent.setup>) {
  await typing.click(
    await screen.findByRole('button', { name: t.reviewSetup.start(1) }, { timeout: 10_000 }),
  );
}

describe('contadores del repaso', () => {
  it('muestran Nuevas, Aprendizaje y Programadas y bajan al calificar', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, {
      seed: async (api, user) => {
        await seedManualCards(api, user, { count: 3, suspended: 0 });
      },
    });
    await typing.click(
      await screen.findByRole('button', { name: t.reviewSetup.start(3) }, { timeout: 10_000 }),
    );
    const list = await screen.findByRole('list', { name: t.review.counters.label });
    const numbers = () =>
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('strong')?.textContent);
    expect(numbers()).toEqual(['3', '0', '0']);
    // La tarjeta de ahora es nueva y por eso cuenta en Nuevas
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.getAttribute('aria-current')),
    ).toEqual(['true', null, null]);
    await typing.click(await screen.findByRole('button', { name: t.review.show }));
    await typing.click(
      screen.getByRole('button', { name: new RegExp(`^${t.review.ratings.good}`) }),
    );
    await waitFor(() => {
      expect(numbers()).toEqual(['2', '0', '0']);
    });
  });
});

describe('temporizador de tarjeta', () => {
  it('apagado por defecto no se ve', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, { seed: seedLeech({ editable: true }) });
    await startSession(typing);
    await screen.findByRole('button', { name: t.review.show });
    expect(screen.queryByText(t.review.timer.label)).toBeNull();
  });

  it('encendido muestra el tiempo sugerido sin bloquear nada', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, {
      seed: seedLeech({ editable: true }),
      user: {
        settings: UserSettingsSchema.parse({
          cardTimer: { enabled: true, seconds: 30, autoReveal: false },
        }),
      },
    });
    await startSession(typing);
    expect(await screen.findByText(t.review.timer.label)).toBeVisible();
    // Corre desde que se ve la tarjeta, así que con un equipo lento ya puede haber bajado unos segundos
    expect(screen.getByRole('timer')).toHaveTextContent(/^(2\d|30) s$/);
    // Se puede revelar y calificar como siempre
    await typing.click(screen.getByRole('button', { name: t.review.show }));
    expect(screen.getByText('Amoxicilina')).toBeVisible();
  });
});

describe('flujo de sanguijuelas', () => {
  /** Olvida la tarjeta que ya llevaba 7 olvidos y omite la causa */
  async function failLeech(typing: ReturnType<typeof userEvent.setup>) {
    await startSession(typing);
    await typing.click(await screen.findByRole('button', { name: t.review.show }));
    await typing.click(
      screen.getByRole('button', { name: new RegExp(`^${t.review.ratings.again}`) }),
    );
    await typing.click(await screen.findByRole('button', { name: t.review.skipCause }));
  }

  it('al olvidarla por octava vez la atiende, sugiere qué hacer y se puede suspender', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, { seed: seedLeech({ editable: true }) });
    await failLeech(typing);
    const panel = await screen.findByRole('region', { name: t.review.leech.title });
    expect(within(panel).getByText(t.review.leech.body(8))).toBeVisible();
    // Sin pistas de calidad claras sugiere reescribirla, y como es propia se puede editar
    expect(within(panel).getByText(t.review.leech.suggestions.rewrite)).toBeVisible();
    expect(within(panel).getByRole('button', { name: t.review.leech.edit })).toBeVisible();

    await typing.click(within(panel).getByRole('button', { name: t.review.leech.suspend }));
    expect(await screen.findByText(t.review.doneTitle)).toBeVisible();
    const { api, user } = app;
    await waitFor(async () => {
      const events = await api.repos.events.query({ userId: user.id });
      expect(events.find((event) => event.type === 'cards_suspended')?.payload).toMatchObject({
        reason: 'leech',
      });
    });
  });

  it('una tarjeta que ya era sanguijuela lo dice al verla y no vuelve a avisar al fallar la novena vez', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, {
      seed: seedLeech({ editable: true, lapses: 8 }),
    });
    await startSession(typing);
    expect(await screen.findByText(t.review.leech.badge)).toBeVisible();
    await typing.click(await screen.findByRole('button', { name: t.review.show }));
    await typing.click(
      screen.getByRole('button', { name: new RegExp(`^${t.review.ratings.again}`) }),
    );
    await typing.click(await screen.findByRole('button', { name: t.review.skipCause }));
    // El aviso sale al llegar al umbral y cada medio umbral, no en cada olvido
    expect(screen.queryByRole('region', { name: t.review.leech.title })).toBeNull();
    expect(await screen.findByRole('button', { name: t.review.show })).toBeVisible();
  });

  it('seguir con ella no suspende nada y la tarjeta vuelve a salir al final', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, { seed: seedLeech({ editable: true }) });
    await failLeech(typing);
    await typing.click(await screen.findByRole('button', { name: t.review.leech.keep }));
    // Una tarjeta fallada vuelve al final de la sesión, así que sigue la misma
    expect(await screen.findByText('¿Cuál es el tratamiento de primera línea?')).toBeVisible();
    const { api, user } = app;
    const events = await api.repos.events.query({ userId: user.id });
    expect(events.some((event) => event.type === 'cards_suspended')).toBe(false);
  });

  it('una tarjeta que no es del alumno no se edita y lo explica', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, { seed: seedLeech({ editable: false }) });
    await failLeech(typing);
    const panel = await screen.findByRole('region', { name: t.review.leech.title });
    expect(within(panel).getByText(t.review.leech.cannotEdit)).toBeVisible();
    expect(within(panel).queryByRole('button', { name: t.review.leech.edit })).toBeNull();
  });

  it('editar abre la tarjeta lista para cambiarla y al cerrar sigue el repaso', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, { seed: seedLeech({ editable: true }) });
    await failLeech(typing);
    await typing.click(await screen.findByRole('button', { name: t.review.leech.edit }));
    const dialog = await screen.findByRole('dialog');
    // El editor ya trae la tarjeta cargada para editar
    expect(
      await within(dialog).findByDisplayValue('¿Cuál es el tratamiento de primera línea?'),
    ).toBeVisible();
    await typing.click(within(dialog).getByRole('button', { name: t.decks.editor.close }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(await screen.findByRole('button', { name: t.review.show })).toBeVisible();
  });
});
