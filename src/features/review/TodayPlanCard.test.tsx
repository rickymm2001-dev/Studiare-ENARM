// @vitest-environment jsdom
// Plan de hoy dentro de Repasar (V4-B10, fase 2). Las tres cifras en chico y, debajo, si los límites
// de hoy caben en los minutos que el alumno declaró. Sin minutos o sin su ritmo real de repaso dice
// calibrando y no avisa de nada, porque un aviso con tiempos de referencia sería un dato inventado.
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

/** La tarjeta del plan de hoy de Repasar */
const planCard = () => screen.findByRole('region', { name: t.widgets.plan.title }, WAIT);

/** 100 repasos de una tarjeta que ya no era nueva, de 8 segundos cada uno (6 para revelar y 2 para calificar) */
async function seedRealPace(api: RenderedApp['api'], user: RenderedApp['user']) {
  const { deckId, overdueIds } = await seedOverdueCards(api, user, { overdue: 1 });
  const cardId = overdueIds[0];
  if (!cardId) throw new Error('Falta la tarjeta');
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
  for (let index = 0; index < 100; index += 1) {
    const at = new Date(Date.now() - (60 - index * 0.5) * day);
    await api.recordEvent(
      createEvent(
        'card_reviewed',
        {
          cardId,
          deckId,
          source: 'card',
          rating: 'good',
          confidence: null,
          msToReveal: 6000,
          msToRate: 2000,
          stateBefore: state,
          stateAfter: state,
        },
        { userId: user.id, tz: user.timeZone, clock: { now: () => at } },
      ),
    );
  }
}

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
    expect(within(card).queryByText(/^Si llegas a tus límites/)).toBeNull();
  });

  it('con minutos pero sin su ritmo real calibra con cuánto falta y no avisa con tiempos de referencia', async () => {
    app = await renderApp(SCREENS.review.path, {
      user: {
        dailyMinutes: 5,
        // Con estos límites, tiempos de referencia dirían que no caben, y no se avisa
        settings: UserSettingsSchema.parse({ reviewsPerDay: 300, newCardsPerDay: 50 }),
      },
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
    expect(within(card).queryByText(/^Si llegas a tus límites/)).toBeNull();
    expect(within(card).queryByText(reviewPlanText.needsMinutes)).toBeNull();
  });

  it('con su ritmo real y minutos de sobra no dice nada más que las cifras', async () => {
    app = await renderApp(SCREENS.review.path, {
      user: {
        dailyMinutes: 240,
        settings: UserSettingsSchema.parse({ reviewsPerDay: 100, newCardsPerDay: 10 }),
      },
      seed: seedRealPace,
    });
    const card = await planCard();
    await waitFor(() => {
      expect(within(card).queryByRole('status')).toBeNull();
    }, WAIT);
    expect(within(card).queryByText(/^Si llegas a tus límites/)).toBeNull();
    expect(within(card).queryByText(reviewPlanText.overHint)).toBeNull();
  });

  it('con su ritmo real y pocos minutos avisa que los límites no caben y abre Ajustes del repaso', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, {
      user: {
        dailyMinutes: 20,
        settings: UserSettingsSchema.parse({ reviewsPerDay: 100, newCardsPerDay: 10 }),
      },
      seed: seedRealPace,
    });
    const card = await planCard();
    // 100 repasos de 8 s y 10 nuevas de 30 s son unos 18 minutos, y hay 10 para tarjetas
    expect(
      await within(card).findByText(reviewPlanText.over(18, 10), undefined, WAIT),
    ).toBeInTheDocument();
    expect(within(card).getByText(reviewPlanText.overHint)).toBeInTheDocument();
    await typing.click(within(card).getByRole('button', { name: reviewPlanText.openSettings }));
    expect(
      await screen.findByRole('dialog', { name: t.settingsPage.reviewSettings.title }),
    ).toBeInTheDocument();
  });
});
