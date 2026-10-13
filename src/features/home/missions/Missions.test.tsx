// @vitest-environment jsdom
// Misiones de hoy en Inicio (Fase P bloque 6). Logros se quitó en B3 del plan del cambio y las
// misiones se quedan en Inicio (4.12).
import 'fake-indexeddb/auto';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { MISSION_TARGETS } from '@/config/rewards';
import { createEvent } from '@/data/events/createEvent';
import type { DataApi } from '@/data/context';
import type { User } from '@/data/schemas/people';
import { newId } from '@/data/testing/fixtures';
import type { Mission } from '@/engines/rewards';
import { t } from '@/i18n/es-MX';
import { MissionList } from './MissionList';
import { missionTitle } from './missionTitle';

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

const mission = (overrides: Partial<Mission> & Pick<Mission, 'key'>): Mission => ({
  scope: 'daily',
  current: 0,
  target: 10,
  done: false,
  calibrating: null,
  ...overrides,
});

describe('lista de misiones', () => {
  it('cada misión dice su objetivo, su avance y lleva su barra', () => {
    render(
      <MissionList
        label={t.widgets.names.missions}
        missions={[
          mission({ key: 'dailyCards', current: 20, target: 20, done: true }),
          mission({ key: 'dailyQuestions', current: 3, target: 10 }),
        ]}
      />,
    );
    const list = screen.getByRole('list', { name: t.widgets.names.missions });
    const [cards, questions] = within(list).getAllByRole('listitem');
    expect(cards).toHaveTextContent(t.missions.titles.dailyCards(20));
    expect(cards).toHaveTextContent(t.missions.done);
    expect(questions).toHaveTextContent(t.missions.titles.dailyQuestions(10));
    expect(questions).toHaveTextContent(t.missions.progress(3, 10));
    expect(within(questions as HTMLElement).getByRole('progressbar')).toHaveAccessibleName(
      `${t.missions.titles.dailyQuestions(10)}. ${t.missions.progress(3, 10)}`,
    );
  });

  it('una misión que calibra lo dice y no muestra una barra que no se puede medir', () => {
    render(
      <MissionList
        label={t.widgets.names.missions}
        missions={[
          mission({
            key: 'weeklyAccuracy',
            scope: 'weekly',
            target: 70,
            calibrating: { have: 4, need: 30 },
          }),
        ]}
      />,
    );
    expect(screen.getByText(t.missions.calibrating(4, 30))).toBeVisible();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('cada clave de misión tiene su título', () => {
    const keys: Mission['key'][] = [
      'dailyCards',
      'dailyQuestions',
      'dailyMinutes',
      'weeklyDays',
      'weeklyXp',
      'weeklyAccuracy',
    ];
    const titles = keys.map((key) => missionTitle(mission({ key, target: 5 })));
    expect(new Set(titles).size).toBe(keys.length);
    expect(titles.every((title) => title.length > 0 && !title.includes('undefined'))).toBe(true);
  });
});

describe('misiones en Inicio', () => {
  it('las misiones de hoy salen en Inicio con su avance', async () => {
    app = await renderApp(SCREENS.home.path, { seed: (api, user) => study(api, user, 30, 200) });
    const missions = await screen.findByRole('region', { name: t.widgets.names.missions });
    const cards = await within(missions).findByText(
      t.missions.titles.dailyCards(MISSION_TARGETS.dailyCards),
    );
    expect(cards).toBeVisible();
    // Con 30 tarjetas hoy la misión de tarjetas ya se cumplió
    expect(cards.closest('li')).toHaveTextContent(t.missions.done);
    expect(within(missions).getAllByRole('listitem')).toHaveLength(3);
  });
});
