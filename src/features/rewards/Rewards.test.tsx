// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { MISSION_TARGETS } from '@/config/rewards';
import { createEvent } from '@/data/events/createEvent';
import type { DataApi } from '@/data/context';
import type { User } from '@/data/schemas/people';
import { newId } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';

vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

/** Tarjetas y XP de hoy, sembrados como eventos de la bitácora */
async function study(api: DataApi, user: User, cards: number, xpAmount: number) {
  const now = new Date();
  for (let index = 0; index < cards; index += 1) {
    const stamp = new Date(now.getTime() - (cards - index) * 1000);
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
  if (xpAmount > 0) {
    await api.repos.events.append(
      createEvent(
        'xp_awarded',
        { amount: xpAmount, reason: 'card_review', sourceEventId: null },
        { userId: user.id, tz: user.timeZone, clock: { now: () => now } },
      ),
    );
  }
}

describe('pantalla de Logros', () => {
  it('un alumno nuevo ve sus misiones en cero, la liga de partida y las insignias por ganar', async () => {
    app = await renderApp(SCREENS.rewards.path);
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.rewards.title }),
    ).toBeVisible();
    const today = await screen.findByRole('region', { name: t.rewards.missionsToday });
    expect(
      within(today).getByText(t.rewards.missions.dailyCards(MISSION_TARGETS.dailyCards)),
    ).toBeVisible();
    expect(screen.getByText(t.rewards.leagueNow(t.rewards.leagues.bronze, 0))).toBeVisible();
    expect(screen.getByText(t.rewards.noRecent)).toBeVisible();
    // La misión de aciertos calibra mientras no haya preguntas
    expect(
      screen.getByText(t.rewards.calibrating(0, MISSION_TARGETS.weeklyAccuracyMinQuestions)),
    ).toBeVisible();
  });

  it('con actividad completa la misión de tarjetas, sube de liga y gana la primera insignia', async () => {
    app = await renderApp(SCREENS.rewards.path, {
      seed: (api, user) => study(api, user, 105, 450),
    });
    const today = await screen.findByRole('region', { name: t.rewards.missionsToday });
    const row = within(today)
      .getByText(t.rewards.missions.dailyCards(MISSION_TARGETS.dailyCards))
      .closest('li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText(t.rewards.done)).toBeVisible();
    expect(screen.getByText(t.rewards.leagueNow(t.rewards.leagues.gold, 450))).toBeVisible();
    const badges = screen.getByRole('list', { name: t.rewards.badgesTitle });
    expect(
      within(badges).getByText(
        t.rewards.tierOf(t.rewards.families.reviews.name, t.rewards.tiers[0] as string),
        { exact: false },
      ),
    ).toBeVisible();
    // La nota aclara que no da XP ni predice el puntaje
    expect(screen.getByText(t.rewards.note)).toBeVisible();
  });
});

describe('widgets de logros en Inicio', () => {
  it('se pueden agregar al tablero y llevan a Logros', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.home.path, { seed: (api, user) => study(api, user, 30, 200) });
    await typing.click(await screen.findByRole('button', { name: t.home.edit }));
    await typing.selectOptions(screen.getByLabelText(t.home.addLabel), 'missions');
    await typing.click(screen.getByRole('button', { name: t.home.add }));
    const missions = await screen.findByRole('region', { name: t.widgets.names.missions });
    expect(
      await within(missions).findByText(t.rewards.missions.dailyCards(MISSION_TARGETS.dailyCards)),
    ).toBeVisible();
    expect(within(missions).getByRole('link', { name: t.rewards.widgetGo })).toHaveAttribute(
      'href',
      SCREENS.rewards.path,
    );
    await typing.selectOptions(screen.getByLabelText(t.home.addLabel), 'league');
    await typing.click(screen.getByRole('button', { name: t.home.add }));
    const league = await screen.findByRole('region', { name: t.widgets.names.league });
    expect(await within(league).findByText(t.rewards.leagues.silver)).toBeVisible();
    await typing.selectOptions(screen.getByLabelText(t.home.addLabel), 'badges');
    await typing.click(screen.getByRole('button', { name: t.home.add }));
    const badges = await screen.findByRole('region', { name: t.widgets.names.badges });
    expect(await within(badges).findByText(t.rewards.noRecent)).toBeVisible();
  });
});
