// @vitest-environment jsdom
// Mazos con el catálogo de precargados según el plan (4.25 del plan del cambio, B8). En Gratis la lista
// es una vista previa con su candado y seguir un mazo nuevo es de pago. Lo que el alumno ya tiene en
// este dispositivo, o que ya estudió en otro, lo sigue repasando y lo puede volver a seguir. Con un plan
// de pago se sigue cualquiera.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { createEvent } from '@/data/events/createEvent';
import { followDeck, unfollowDeck } from '@/data/usecases/decks';
import { changePlan } from '@/data/usecases/subscription';
import { catalogCardIds, deckIds } from '@/demo/content/deckEntities';
import { scheduleReview } from '@/engines/fsrs';
import { t } from '@/i18n/es-MX';
import { schedulerConfig } from '../review/schedulerConfig';
import { loadCatalog } from './useDeckCatalog';

vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 15_000 };
const SMALL = 'Urgencias (Paco)';
const BIG = 'Medicina interna (Paco)';

/** La fila de un mazo del catálogo, por su nombre */
async function deckRow(name: string): Promise<HTMLElement> {
  const catalog = await screen.findByRole('region', { name: t.decks.preloadedTitle }, WAIT);
  const title = await within(catalog).findByText(name, undefined, WAIT);
  const row = title.closest('li');
  if (!row) throw new Error(`No está la fila de ${name}`);
  return row;
}

describe('catálogo de mazos según el plan', () => {
  it('en Gratis es una vista previa con su candado y Ver planes, sin seguir mazos nuevos', async () => {
    app = await renderApp(SCREENS.decks.path);
    const catalog = await screen.findByRole('region', { name: t.decks.preloadedTitle }, WAIT);
    expect(
      await within(catalog).findByText(t.freePlan.catalog.notice, undefined, WAIT),
    ).toBeVisible();
    expect(within(catalog).getByRole('link', { name: t.billing.featureSeePlans })).toHaveAttribute(
      'href',
      SCREENS.subscription.path,
    );
    // Cada mazo sigue a la vista con lo que trae, pero en lugar de Seguir mazo lleva el candado
    const row = await deckRow(SMALL);
    expect(within(row).getByText(t.decks.author('Paco'))).toBeVisible();
    expect(within(row).getByText(t.freePlan.catalog.rowLocked)).toBeVisible();
    expect(within(catalog).queryByRole('button', { name: t.decks.follow })).toBeNull();
  });

  it('con un plan de pago sigue un mazo nuevo del catálogo y no hay candado', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.decks.path, {
      seed: async (api, user) => {
        await changePlan(api, user, 'monthly');
      },
    });
    const row = await deckRow(SMALL);
    const follow = await within(row).findByRole('button', { name: t.decks.follow }, WAIT);
    await waitFor(() => {
      expect(follow).toBeEnabled();
    });
    expect(screen.queryByText(t.freePlan.catalog.notice)).toBeNull();
    expect(screen.queryByText(t.freePlan.catalog.rowLocked)).toBeNull();
    await typing.click(follow);
    expect(await within(row).findByRole('button', { name: t.decks.unfollow }, WAIT)).toBeVisible();
  });

  it('en Gratis el mazo que ya estaba en el dispositivo se deja y se vuelve a seguir, y los demás siguen cerrados', async () => {
    const typing = userEvent.setup();
    const file = (await loadCatalog()).find((item) => item.name === SMALL);
    if (!file) throw new Error('Falta el mazo chico del catálogo');
    app = await renderApp(SCREENS.decks.path, {
      seed: async (api, user) => {
        // Lo siguió cuando pagaba y después lo dejó. Sus tarjetas siguen en este dispositivo
        const followed = await followDeck(api, user, file);
        await unfollowDeck(api, followed, file.key);
      },
    });
    const row = await deckRow(SMALL);
    const follow = await within(row).findByRole('button', { name: t.decks.follow }, WAIT);
    await waitFor(() => {
      expect(follow).toBeEnabled();
    });
    expect(within(await deckRow(BIG)).getByText(t.freePlan.catalog.rowLocked)).toBeVisible();

    await typing.click(follow);
    const unfollow = await within(row).findByRole('button', { name: t.decks.unfollow }, WAIT);
    await typing.click(unfollow);
    expect(await within(row).findByRole('button', { name: t.decks.follow }, WAIT)).toBeVisible();
  });

  it('en Gratis un mazo ya estudiado en otro dispositivo se vuelve a seguir aunque no esté en este', async () => {
    const typing = userEvent.setup();
    const file = (await loadCatalog()).find((item) => item.name === SMALL);
    if (!file) throw new Error('Falta el mazo chico del catálogo');
    const cardId = catalogCardIds(file)[0];
    if (!cardId) throw new Error('El mazo chico no tiene tarjetas');
    app = await renderApp(SCREENS.decks.path, {
      seed: async (api, user) => {
        // El precargado no viaja entre dispositivos, pero su repaso sí llegó con la bitácora
        await api.recordEvent(
          createEvent(
            'card_reviewed',
            {
              cardId,
              deckId: deckIds.deck(file.key),
              source: 'card',
              rating: 'good',
              confidence: null,
              msToReveal: 2000,
              msToRate: 1000,
              stateBefore: null,
              stateAfter: scheduleReview(
                null,
                'good',
                new Date(),
                schedulerConfig({ user, settings: user.settings }),
                cardId,
              ).state,
            },
            { userId: user.id, tz: user.timeZone },
          ),
        );
      },
    });
    expect(await app.api.repos.decks.get(deckIds.deck(file.key))).toBeUndefined();
    const row = await deckRow(SMALL);
    const follow = await within(row).findByRole('button', { name: t.decks.follow }, WAIT);
    await waitFor(() => {
      expect(follow).toBeEnabled();
    });
    expect(within(row).queryByText(t.freePlan.catalog.rowLocked)).toBeNull();
    expect(within(await deckRow(BIG)).getByText(t.freePlan.catalog.rowLocked)).toBeVisible();
    await typing.click(follow);
    expect(await within(row).findByRole('button', { name: t.decks.unfollow }, WAIT)).toBeVisible();
  });
});
