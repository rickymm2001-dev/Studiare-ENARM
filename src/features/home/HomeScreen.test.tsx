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
import { t } from '@/i18n/es-MX';

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

/** Un mazo propio, que siempre cuenta como seguido, con tarjetas básicas nuevas */
async function seedOwnDeck(api: DataApi, user: User, count: number) {
  const deckId = newId();
  const createdAt = new Date().toISOString();
  await api.repos.decks.put({
    id: deckId,
    name: 'Mi mazo de prueba',
    description: '',
    ownerId: user.id,
    origin: 'manual',
    visibility: 'private',
    isDemo: false,
    createdAt,
  });
  for (let index = 0; index < count; index += 1) {
    const noteId = newId();
    await api.repos.notes.put({
      id: noteId,
      deckId,
      tags: [],
      origin: 'manual',
      editorialStatus: 'draft',
      sourceQuote: null,
      sourceQuestionVersionId: null,
      isDemo: false,
      createdAt,
      kind: 'basic',
      front: `<p>Pregunta ${String(index + 1)}</p>`,
      back: '<p>Respuesta</p>',
    });
    await api.repos.cards.put({ id: newId(), noteId, deckId, ordinal: 0, createdAt });
  }
}

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

    // Sin mazos que seguir la gráfica no se pinta, dice qué va a mostrar y lleva a Mazos
    const load = screen.getByRole('region', { name: t.home.load.title });
    expect(within(load).getByText(t.home.load.empty)).toBeVisible();
    expect(within(load).getByRole('link', { name: t.home.load.goToDecks })).toHaveAttribute(
      'href',
      SCREENS.decks.path,
    );
    expect(within(load).queryByRole('img')).toBeNull();

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
    const party = screen.getByRole('region', { name: t.widgets.names.party_challenge });
    expect(await within(party).findByText(t.widgets.party.empty)).toBeVisible();
    const heatmap = screen.getByRole('region', { name: t.home.calendarTitle });
    expect(
      within(heatmap).getByRole('heading', { level: 2, name: t.home.calendarTitle }),
    ).toBeVisible();
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

  it('con un mazo la carga muestra lo que toca cada uno de los próximos 7 días', async () => {
    app = await renderApp(SCREENS.home.path, {
      seed: async (api, user) => {
        await seedOwnDeck(api, user, 3);
        await reviewToday(api, user, 3);
      },
    });
    const load = await screen.findByRole('region', { name: t.home.load.title });
    // Las tres nuevas tocan hoy, dentro del límite de nuevas por día. Si las contesta Bien vuelven
    // en los días siguientes, así que la semana suma más de tres
    const chart = await within(load).findByRole('img', { name: /^Tarjetas por día/ });
    expect(chart).toBeVisible();
    expect(within(load).getByText(/^En los próximos 7 días te tocan/)).toBeVisible();
    expect(within(load).getByRole('link', { name: t.home.load.linkLabel })).toHaveAttribute(
      'href',
      SCREENS.progress.path,
    );
    // La tabla para el lector de pantalla trae los siete días, hoy primero
    const table = within(load).getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(8);
    expect(within(rows[1] as HTMLElement).getByRole('rowheader')).toHaveTextContent(
      t.home.load.today,
    );
    expect(
      within(rows[1] as HTMLElement)
        .getAllByRole('cell')
        .at(-1),
    ).toHaveTextContent('3');
    // Las tres tarjetas cuentan hoy y ninguna está vencida
    const due = screen.getByRole('region', { name: t.home.dueTitle });
    expect(within(due).getByText(t.widgets.today.done(3, 0))).toBeVisible();
  });

  it('sin sesión la raíz es la portada de venta', async () => {
    const { usePreferences } = await import('@/app/preferences');
    // renderApp abre sesión, así que aquí se cierra antes de pintar
    app = await renderApp(SCREENS.home.path);
    usePreferences.setState({ sessionUserId: null });
    expect(await screen.findByRole('heading', { level: 1, name: t.landing.title })).toBeVisible();
  });
});
