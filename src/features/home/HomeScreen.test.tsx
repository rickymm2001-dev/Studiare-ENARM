// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { DataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import { newId } from '@/data/ids';
import type { User } from '@/data/schemas/people';
import { EMPTY_DETAILS } from '@/data/usecases/account';
import { changePlan } from '@/data/usecases/subscription';
import { longDate } from '@/features/billing/planState';
import { t } from '@/i18n/es-MX';
import { billingCloudText } from '@/i18n/billingCloud';
import { DEFAULT_APPEARANCE } from '@/ui/appearance';

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

/** Repasos hechos hoy, cada uno con su siguiente fecha en dos semanas */
async function reviewToday(api: DataApi, user: User, count: number) {
  const now = new Date();
  for (let index = 0; index < count; index += 1) {
    const stamp = new Date(now.getTime() - (count - index) * 1000);
    const due = new Date(stamp.getTime() + 14 * 86_400_000).toISOString();
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
            due,
            stability: 10,
            difficulty: 5,
            scheduledDays: 14,
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

describe('Inicio con el diseño fijo', () => {
  it('saluda y muestra cada parte del diseño sin inventar cifras', async () => {
    app = await renderApp(SCREENS.home.path, { user: { alias: 'Marta' } });
    expect(
      await screen.findByRole('heading', { level: 1, name: t.home.welcome('Marta', null) }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: t.home.reviewsTitle })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: t.home.simulatorsTitle })).toBeVisible();

    const goal = screen.getByRole('region', { name: t.widgets.names.daily_goal });
    expect(within(goal).getByText(t.widgets.goal.ratio(0, 20))).toBeVisible();
    // La frase del día lleva su autor
    expect(within(goal).getByRole('figure')).toBeVisible();

    const due = screen.getByRole('region', { name: t.home.dueTitle });
    expect(within(due).getByText(t.home.dueLabel(0))).toBeInTheDocument();
    expect(within(due).getByRole('link', { name: t.widgets.today.review })).toHaveAttribute(
      'href',
      SCREENS.review.path,
    );

    // Sin repasos la gráfica no se pinta y dice qué va a mostrar
    const load = screen.getByRole('region', { name: t.home.load.title });
    expect(within(load).getByText(t.home.load.empty)).toBeVisible();
    expect(within(load).getByText(t.home.load.averageNone, { exact: false })).toBeVisible();
    expect(within(load).getByRole('link', { name: t.home.load.linkLabel })).toHaveAttribute(
      'href',
      SCREENS.progress.path,
    );

    // Los análisis calibran mientras no hay respuestas suficientes
    const bias = screen.getByRole('region', { name: t.vocabulary.trap.homeTitle });
    expect(await within(bias).findByText(t.states.calibrating.title)).toBeVisible();
    expect(
      within(bias).getByText(
        t.states.calibrating.remaining(
          DEFAULT_THRESHOLDS.bias.minTaggedErrors,
          t.widgets.biasPattern.unit,
        ),
        { exact: false },
      ),
    ).toBeVisible();
    const topics = screen.getByRole('region', { name: t.home.topicsTitle });
    expect(await within(topics).findByText(t.states.calibrating.title)).toBeVisible();

    expect(screen.getByRole('region', { name: t.widgets.names.missions })).toBeVisible();
    // En Gratis el reto de Party lleva el aviso corto del candado (respuesta 20, B8)
    const party = screen.getByRole('region', { name: t.widgets.names.party_challenge });
    expect(await within(party).findByText(t.freePlan.widget)).toBeVisible();
    expect(within(party).getByRole('link', { name: t.billing.featureSeePlans })).toHaveAttribute(
      'href',
      SCREENS.subscription.path,
    );
    const heatmap = screen.getByRole('region', { name: t.widgets.names.heatmap });
    expect(heatmap).toBeVisible();
    // Las iniciales de lunes a domingo van a la izquierda de las filas
    expect(
      within(heatmap)
        .getAllByText(/^[LMJVSD]$/)
        .map((letter) => letter.textContent),
    ).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D']);

    // Ya no hay tablero que editar
    expect(screen.queryByRole('button', { name: 'Editar tablero' })).toBeNull();
  });

  it('el plan actual está siempre a la vista con el botón para mejorarlo', async () => {
    app = await renderApp(SCREENS.home.path);
    const plan = await screen.findByRole('region', { name: t.home.plan.title });
    expect(await within(plan).findByText(t.billing.plans.free)).toBeVisible();
    expect(within(plan).getByRole('link', { name: t.home.plan.upgrade })).toHaveAttribute(
      'href',
      SCREENS.subscription.path,
    );
  });

  it('con un plan de pago dice cuál es y ofrece cambiarlo', async () => {
    app = await renderApp(SCREENS.home.path, {
      seed: async (api, user) => {
        await changePlan(api, user, 'annual');
      },
    });
    const plan = await screen.findByRole('region', { name: t.home.plan.title });
    expect(await within(plan).findByText(t.billing.plans.annual)).toBeVisible();
    expect(within(plan).getByRole('link', { name: t.home.plan.change })).toBeVisible();
  });

  it('con la prueba gratis de la nube dice hasta cuándo dura (B10)', async () => {
    const end = '2026-10-21T15:00:00.000Z';
    app = await renderApp(SCREENS.home.path, {
      seed: async (api, user) => {
        await api.repos.subscriptions.put({
          userId: user.id,
          plan: 'founder',
          status: 'active',
          isSimulated: false,
          periodEnd: end,
          source: 'payment',
          cloudStatus: 'trialing',
          trialEnd: end,
          provider: 'stripe',
          updatedAt: new Date().toISOString(),
        });
      },
    });
    const plan = await screen.findByRole('region', { name: t.home.plan.title });
    expect(await within(plan).findByText(t.billing.plans.founder)).toBeVisible();
    expect(await within(plan).findByText(billingCloudText.trialUntil(longDate(end)))).toBeVisible();
  });

  it('el saludo concuerda con el sexo que declaró el alumno', async () => {
    app = await renderApp(SCREENS.home.path, {
      user: { alias: 'Ana' },
      seed: async (api, user) => {
        await api.repos.accounts.put({
          userId: user.id,
          email: 'ana@example.com',
          ...EMPTY_DETAILS,
          sex: 'female',
          updatedAt: new Date().toISOString(),
        });
      },
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: t.home.welcome('Ana', 'female') }),
    ).toBeVisible();
  });

  it('con repasos hechos la carga muestra la gráfica, su tabla y el promedio del mes', async () => {
    app = await renderApp(SCREENS.home.path, {
      seed: async (api, user) => {
        await reviewToday(api, user, 3);
      },
    });
    const load = await screen.findByRole('region', { name: t.home.load.title });
    expect(await within(load).findByRole('img', { name: t.home.load.chartLabel })).toBeVisible();
    // La tabla para el lector de pantalla trae los cinco meses
    const table = within(load).getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(6);
    expect(
      within(load).getByText(t.home.load.scheduled, { selector: 'figcaption span' }),
    ).toBeVisible();
    // Las tres tarjetas cuentan hoy y ninguna está vencida
    const due = screen.getByRole('region', { name: t.home.dueTitle });
    expect(within(due).getByText(t.widgets.today.done(3, 0))).toBeVisible();
  });

  it('con un plan de pago el reto de Party ya no lleva el candado', async () => {
    app = await renderApp(SCREENS.home.path, {
      seed: async (api, user) => {
        await changePlan(api, user, 'monthly');
      },
    });
    const party = await screen.findByRole('region', { name: t.widgets.names.party_challenge });
    // Sin la nube no hay grupos, pero ya no es por el plan
    expect(await within(party).findByText(t.widgets.party.empty)).toBeVisible();
    expect(within(party).queryByText(t.freePlan.widget)).toBeNull();
  });

  it('sin sesión la raíz es la portada de venta', async () => {
    const { usePreferences } = await import('@/app/preferences');
    // renderApp abre sesión, así que aquí se cierra antes de pintar
    app = await renderApp(SCREENS.home.path);
    usePreferences.setState({ sessionUserId: null });
    expect(await screen.findByRole('heading', { level: 1, name: t.landing.title })).toBeVisible();
  });

  // Modo enfoque (respuesta 82 del plan del cambio, B7)
  it('sin modo enfoque la barra muestra la racha y el nivel, y Inicio el reto de Party', async () => {
    app = await renderApp(SCREENS.home.path);
    await screen.findByRole('heading', { level: 2, name: t.home.reviewsTitle });
    expect(await screen.findByLabelText(t.headerStats.streak(0))).toBeVisible();
    expect(
      screen.getByRole('button', { name: new RegExp(`^${t.headerStats.openLevels}`) }),
    ).toBeVisible();
    expect(screen.getByRole('region', { name: t.widgets.names.party_challenge })).toBeVisible();
  });

  it('en modo enfoque no hay racha, nivel, XP, misiones de hoy ni reto de Party', async () => {
    const { usePreferences } = await import('@/app/preferences');
    usePreferences.setState({ appearance: { ...DEFAULT_APPEARANCE, focusMode: true } });
    app = await renderApp(SCREENS.home.path);
    await screen.findByRole('heading', { level: 2, name: t.home.reviewsTitle });
    // La foto sigue llevando a Configuración
    expect(await screen.findByRole('link', { name: t.headerStats.profile })).toHaveAttribute(
      'href',
      SCREENS.settings.path,
    );
    expect(screen.queryByLabelText(t.headerStats.streak(0))).toBeNull();
    expect(
      screen.queryByRole('button', { name: new RegExp(`^${t.headerStats.openLevels}`) }),
    ).toBeNull();
    expect(screen.queryByText(/\bXP\b/)).toBeNull();
    expect(screen.queryByRole('region', { name: t.widgets.names.party_challenge })).toBeNull();
    // El modo enfoque oculta también las misiones de hoy (4.12). El plan se queda
    expect(screen.queryByRole('region', { name: t.widgets.names.missions })).toBeNull();
    expect(screen.getByRole('region', { name: t.home.plan.title })).toBeVisible();
  });
});
