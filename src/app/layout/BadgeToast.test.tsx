// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent } from '@/data/events/createEvent';
import type { DataApi } from '@/data/context';
import type { User } from '@/data/schemas/people';
import { newId } from '@/data/testing/fixtures';
import { badgeTierKey } from '@/engines/rewards';
import { loadSeenBadges } from '@/features/rewards/badgesSeen';
import { tierName } from '@/features/rewards/labels';
import { t } from '@/i18n/es-MX';
import { SCREENS } from '../screens';
import { renderApp, resetApp, type RenderedApp } from '../testing/renderApp';

vi.setConfig({ testTimeout: 40_000 });

// El confeti y el sonido necesitan un lienzo y audio que jsdom no tiene
const celebrate = vi.hoisted(() => vi.fn());
vi.mock('@/ui/celebrate', () => ({ celebrate }));

let app: RenderedApp | undefined;
beforeEach(() => {
  localStorage.clear();
  celebrate.mockClear();
});
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

/** Cien repasos de hoy, justo lo que pide el primer nivel de la insignia de repasos */
async function hundredReviews(api: DataApi, user: User) {
  const now = new Date();
  for (let index = 0; index < 100; index += 1) {
    const stamp = new Date(now.getTime() - (100 - index) * 1000);
    await api.repos.events.append(
      createEvent(
        'card_reviewed',
        {
          cardId: newId(),
          deckId: newId(),
          source: 'card',
          rating: 'good',
          confidence: null,
          msToReveal: 2000,
          msToRate: 1500,
          stateBefore: null,
          stateAfter: {
            due: stamp.toISOString(),
            stability: 1,
            difficulty: 5,
            scheduledDays: 1,
            learningSteps: 0,
            reps: 1,
            lapses: 0,
            state: 'review',
            lastReview: stamp.toISOString(),
          },
        },
        { userId: user.id, tz: user.timeZone, clock: { now: () => stamp } },
      ),
    );
  }
}

const seenKey = (userId: string) => `enarm.badges.seen.v1.${userId}`;
const bronzeReviews = t.rewards.tierOf(t.rewards.families.reviews.name, tierName(1));

describe('aviso al ganar una insignia', () => {
  it('avisa del nivel nuevo y deja constancia de que ya lo vio al cerrarlo', async () => {
    const typing = userEvent.setup();
    const { user } = (app = await renderApp(SCREENS.home.path, {
      seed: async (api, owner) => {
        // El dispositivo ya había visto sus insignias, que entonces eran ninguna
        localStorage.setItem(seenKey(owner.id), '[]');
        await hundredReviews(api, owner);
      },
    }));
    expect(
      await screen.findByText(t.rewards.toast.title(1), {}, { timeout: 25_000 }),
    ).toBeVisible();
    expect(screen.getByText(bronzeReviews)).toBeVisible();
    expect(celebrate).toHaveBeenCalledWith('badge');
    expect(screen.getByRole('link', { name: t.rewards.toast.see })).toHaveAttribute(
      'href',
      expect.stringContaining(SCREENS.rewards.path),
    );
    await typing.click(screen.getByRole('button', { name: t.rewards.toast.dismiss }));
    await waitFor(() => {
      expect(screen.queryByText(t.rewards.toast.title(1))).toBeNull();
    });
    await waitFor(() => {
      expect(loadSeenBadges(user.id)?.has(badgeTierKey('reviews', 1))).toBe(true);
    });
  });

  it('la primera vez en un dispositivo anota lo que ya tenía y no avisa de golpe', async () => {
    const { user } = (app = await renderApp(SCREENS.home.path, {
      seed: hundredReviews,
    }));
    await screen.findByRole('heading', { level: 1 }, { timeout: 25_000 });
    await waitFor(() => {
      expect(loadSeenBadges(user.id)?.has(badgeTierKey('reviews', 1))).toBe(true);
    });
    expect(screen.queryByText(t.rewards.toast.title(1))).toBeNull();
  });

  it('no repite el aviso de lo que ya vio', async () => {
    app = await renderApp(SCREENS.home.path, {
      seed: async (api, owner) => {
        localStorage.setItem(seenKey(owner.id), JSON.stringify([badgeTierKey('reviews', 1)]));
        await hundredReviews(api, owner);
      },
    });
    await screen.findByRole('heading', { level: 1 }, { timeout: 25_000 });
    expect(screen.queryByText(t.rewards.toast.title(1))).toBeNull();
    expect(celebrate).not.toHaveBeenCalled();
  });
});
