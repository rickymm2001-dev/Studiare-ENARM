// @vitest-environment jsdom
// Plan de hoy dentro de Repasar (V4-B10, fase 2). Las tres cifras en chico y, debajo, si los límites
// de hoy caben en los minutos que el alumno declaró. Sin minutos o sin su ritmo real de repaso dice
// calibrando y no avisa de nada, porque un aviso con tiempos de referencia sería un dato inventado.
// Compara lo que de verdad toca hoy y no los topes de los límites.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { createEvent } from '@/data/events/createEvent';
import { UserSettingsSchema } from '@/data/schemas/people';
import { seedOverdueCards } from '@/data/testing/seedCards';
import { t } from '@/i18n/es-MX';
import { reviewPlanText } from '@/i18n/reviewPlan';

vi.mock('@/ui/celebrate', () => ({ celebrate: () => undefined }));
vi.setConfig({ testTimeout: 60_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 15_000 };
/** El principio del aviso de que no caben, sin sus cifras */
const OVER = /^Tu trabajo de tarjetas de hoy pide/;

/** La tarjeta del plan de hoy de Repasar */
const planCard = () => screen.findByRole('region', { name: t.widgets.plan.title }, WAIT);

/**
 * Un mazo con tarjetas vencidas y nuevas y el ritmo del alumno. Las vencidas traen cada una su primer
 * repaso, que cuenta como una muestra de tarjeta nueva de 5 segundos. Además se agregan repasos de una
 * tarjeta que ya no era nueva, con el tiempo que se pida, para tener un ritmo propio de repaso
 */
async function seedPace(
  api: RenderedApp['api'],
  user: RenderedApp['user'],
  options: { overdue: number; unseen: number; reviewSamples: number; reviewMs?: [number, number] },
) {
  const { deckId, overdueIds } = await seedOverdueCards(api, user, {
    overdue: options.overdue,
    unseen: options.unseen,
  });
  const cardId = overdueIds[0];
  if (!cardId) throw new Error('Falta la tarjeta');
  const [msToReveal, msToRate] = options.reviewMs ?? [6000, 2000];
  const day = 86_400_000;
  const state = {
    due: new Date(Date.now() + day).toISOString(),
    stability: 5,
    difficulty: 5,
    scheduledDays: 5,
    learningSteps: 0,
    reps: 3,
    lapses: 0,
    state: 'review' as const,
    lastReview: new Date(Date.now() - 2 * day).toISOString(),
  };
  // Más viejos que el primer repaso de la semilla, para que el estado de la tarjeta no cambie
  for (let index = 0; index < options.reviewSamples; index += 1) {
    const at = new Date(Date.now() - (60 - index * 0.3) * day);
    await api.recordEvent(
      createEvent(
        'card_reviewed',
        {
          cardId,
          deckId,
          source: 'card',
          rating: 'good',
          confidence: null,
          msToReveal,
          msToRate,
          stateBefore: state,
          stateAfter: state,
        },
        { userId: user.id, tz: user.timeZone, clock: { now: () => at } },
      ),
    );
  }
}

const withLimits = (reviewsPerDay: number, newCardsPerDay: number) =>
  UserSettingsSchema.parse({ reviewsPerDay, newCardsPerDay });

describe('plan de hoy en Repasar', () => {
  it('muestra las tres cifras y sin minutos declarados dice calibrando y manda a ponerlos', async () => {
    app = await renderApp(SCREENS.review.path, {
      user: { dailyMinutes: null },
      // Sin mazos Repasar muestra su estado vacío, y el plan va con la pantalla de empezar
      seed: async (api, user) => {
        await seedOverdueCards(api, user, { overdue: 2, unseen: 2 });
      },
    });
    const card = await planCard();
    for (const name of Object.values(t.widgets.plan.rows)) {
      expect(within(card).getByText(name)).toBeInTheDocument();
    }
    expect(within(card).getByText(reviewPlanText.needsMinutes)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: reviewPlanText.goToMinutes })).toHaveAttribute(
      'href',
      SCREENS.progress.path,
    );
    expect(within(card).queryByText(OVER)).toBeNull();
  });

  it('con minutos pero sin su ritmo real calibra con cuánto falta y no avisa con tiempos de referencia', async () => {
    app = await renderApp(SCREENS.review.path, {
      // Con estos límites, tiempos de referencia dirían que no caben, y no se avisa
      user: { dailyMinutes: 5, settings: withLimits(300, 50) },
      seed: async (api, user) => {
        await seedOverdueCards(api, user, { overdue: 2, unseen: 2 });
      },
    });
    const card = await planCard();
    expect(
      await within(card).findByText(
        t.states.calibrating.progress(0, 100, reviewPlanText.historyUnit),
        { exact: false },
        WAIT,
      ),
    ).toBeInTheDocument();
    expect(within(card).queryByText(OVER)).toBeNull();
    expect(within(card).queryByText(reviewPlanText.needsMinutes)).toBeNull();
  });

  it('con su ritmo de repaso pero sin ritmo de tarjetas nuevas, hoy con nuevas, calibra y no cuenta las nuevas con la referencia', async () => {
    app = await renderApp(SCREENS.review.path, {
      // 100 repasos de 8 s, solo 2 nuevas medidas y 10 nuevas por estudiar. Con 30 s de referencia por
      // nueva y estos límites daría que no caben, y no se avisa
      user: { dailyMinutes: 20, settings: withLimits(50, 20) },
      seed: async (api, user) => {
        await seedPace(api, user, { overdue: 2, unseen: 10, reviewSamples: 100 });
      },
    });
    const card = await planCard();
    expect(
      await within(card).findByText(
        t.states.calibrating.progress(2, 20, reviewPlanText.newHistoryUnit),
        { exact: false },
        WAIT,
      ),
    ).toBeInTheDocument();
    expect(within(card).queryByText(OVER)).toBeNull();
  });

  it('con su ritmo real y minutos de sobra no dice nada más que las cifras', async () => {
    app = await renderApp(SCREENS.review.path, {
      user: { dailyMinutes: 240, settings: withLimits(100, 10) },
      seed: async (api, user) => {
        await seedPace(api, user, { overdue: 25, unseen: 5, reviewSamples: 100 });
      },
    });
    const card = await planCard();
    await waitFor(() => {
      expect(within(card).queryByRole('status')).toBeNull();
    }, WAIT);
    expect(within(card).queryByText(OVER)).toBeNull();
    expect(within(card).queryByText(reviewPlanText.overHint)).toBeNull();
  });

  it('compara lo que de verdad toca hoy y no los topes, aunque los límites sean los de fábrica', async () => {
    app = await renderApp(SCREENS.review.path, {
      // Con los topes de fábrica y 25 s por repaso, 200 repasos serían más de 80 minutos. Hoy solo
      // tocan 15 tarjetas, unos 6 minutos, y hay 30 para tarjetas
      user: { dailyMinutes: 60, settings: UserSettingsSchema.parse({}) },
      seed: async (api, user) => {
        await seedPace(api, user, {
          overdue: 15,
          unseen: 0,
          reviewSamples: 100,
          reviewMs: [20_000, 5000],
        });
      },
    });
    const card = await planCard();
    await waitFor(() => {
      expect(within(card).queryByRole('status')).toBeNull();
    }, WAIT);
    expect(within(card).queryByText(OVER)).toBeNull();
  });

  it('con su ritmo real y pocos minutos avisa que no caben, con las cifras ya redondeadas, y abre Ajustes del repaso', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, {
      user: { dailyMinutes: 20, settings: withLimits(100, 10) },
      seed: async (api, user) => {
        await seedPace(api, user, { overdue: 100, unseen: 10, reviewSamples: 100 });
      },
    });
    const card = await planCard();
    // 100 repasos de 8 s y 10 nuevas de 5 s son unos 14 minutos, y hay 10 para tarjetas
    expect(
      await within(card).findByText(reviewPlanText.over(14, 10), undefined, WAIT),
    ).toBeInTheDocument();
    expect(within(card).getByText(reviewPlanText.overHint)).toBeInTheDocument();
    await typing.click(within(card).getByRole('button', { name: reviewPlanText.openSettings }));
    expect(
      await screen.findByRole('dialog', { name: t.settingsPage.reviewSettings.title }),
    ).toBeInTheDocument();
  });
});
