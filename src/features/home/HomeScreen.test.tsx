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
import { updateProfile } from '@/data/usecases/profile';
import { changePlan } from '@/data/usecases/subscription';
import { INDICATOR_THRESHOLDS } from '@/engines/keyIndicators';
import { longDate } from '@/features/billing/planState';
import { settingsPath } from '@/features/settings/sections';
import { t } from '@/i18n/es-MX';
import { billingCloudText } from '@/i18n/billingCloud';
import { homePlanText } from '@/i18n/homePlan';
import { DEFAULT_APPEARANCE } from '@/ui/appearance';

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

/** Repasos hechos hoy, cada uno con su siguiente fecha en dos semanas */
async function reviewToday(api: DataApi, user: User, count: number, extra = false) {
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
          ...(extra ? { extra: true } : {}),
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

/** Preguntas contestadas hoy, todas correctas y en un minuto cada una */
async function answerToday(api: DataApi, user: User, count: number) {
  const now = new Date();
  for (let index = 0; index < count; index += 1) {
    const stamp = new Date(now.getTime() - (count - index) * 1000);
    await api.repos.events.append(
      createEvent(
        'question_answered',
        {
          questionVersionId: newId(),
          optionVersionId: newId(),
          correct: true,
          confidence: null,
          msToAnswer: 60_000,
          changeCount: 0,
          highlightEnabled: false,
        },
        { userId: user.id, tz: user.timeZone, clock: { now: () => stamp } },
      ),
    );
  }
}

/** La tarjeta de cifra no es región, se encuentra por su título */
const cardOf = (title: string) =>
  screen.getByRole('heading', { name: title }).closest('section') as HTMLElement;

describe('Inicio con el canvas de D-150', () => {
  it('saluda y muestra cada parte del diseño sin inventar cifras', async () => {
    app = await renderApp(SCREENS.home.path, { user: { alias: 'Marta' } });
    expect(
      await screen.findByRole('heading', { level: 1, name: t.home.welcome('Marta', null) }),
    ).toBeVisible();
    // La frase del día con cifras reales. Nada vencido y las 20 preguntas del plan Gratis
    expect(screen.getByText(t.home.lead(0, 20))).toBeVisible();
    expect(screen.getByRole('link', { name: t.home.startReviews })).toHaveAttribute(
      'href',
      SCREENS.review.path,
    );
    expect(screen.getByRole('link', { name: t.home.customize })).toHaveAttribute(
      'href',
      settingsPath('apariencia'),
    );
    expect(screen.getByRole('heading', { level: 2, name: t.home.reviewsTitle })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: t.home.simulatorsTitle })).toBeVisible();

    // Estado de las tarjetas en anillo, sin tarjetas activas
    const cards = screen.getByRole('region', { name: t.home.cards.title });
    expect(within(cards).getByRole('img', { name: t.home.cards.label(0, 0, 0, 0) })).toBeVisible();
    expect(within(cards).getByText(t.home.cards.active)).toBeVisible();

    // La meta de hoy con las tres filas del plan de la guía, con los límites por omisión
    const goal = screen.getByRole('region', { name: t.home.goal.title });
    const rows = t.widgets.plan.rows;
    expect(within(goal).getByText(t.home.goal.row(rows.cards, 0, 220))).toBeVisible();
    expect(within(goal).getByText(t.home.goal.row(rows.newCards, 0, 20))).toBeVisible();
    expect(within(goal).getByText(t.home.goal.row(rows.questions, 0, 20))).toBeVisible();
    // La cuarta fila es la meta de la racha, por omisión 20 tarjetas (V5, D-151)
    expect(
      within(goal).getByText(
        t.home.goal.row(t.home.goal.streakRow(t.widgets.goal.metricNames.cards), 0, 20),
      ),
    ).toBeVisible();
    expect(within(goal).getByText(t.home.goal.ofDay)).toBeVisible();
    // La frase del día lleva su autor
    expect(within(goal).getByRole('figure')).toBeVisible();

    // Sin repasos la carga no pinta la gráfica y dice qué va a mostrar
    const load = cardOf(t.home.load.title);
    expect(within(load).getByText(t.home.load.empty)).toBeVisible();
    expect(within(load).getByText(t.home.load.averageCaption)).toBeVisible();
    expect(within(load).getByRole('link', { name: t.home.load.seeAll })).toHaveAttribute(
      'href',
      SCREENS.progress.path,
    );

    // El pulso calibra con los días en la barra y dice lo que falta de las otras dos partes, sin
    // repetir la frase de la barra
    const pulse = screen.getByRole('region', { name: t.home.pulse.title });
    expect(within(pulse).getByText(t.states.calibrating.title)).toBeVisible();
    expect(
      within(pulse).getByText(t.states.calibrating.remaining(7, t.home.pulse.units.activeDays)),
    ).toBeVisible();
    expect(within(pulse).getByText(t.home.pulse.calibratingNote(0, 50, 50))).toBeVisible();
    expect(within(pulse).queryByText(t.home.pulse.calibratingNote(7, 50, 50))).toBeNull();
    expect(t.home.pulse.calibratingNote(0, 0, 0)).toBe('');

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
    expect(within(topics).getByRole('link', { name: t.home.simulateTopics })).toHaveAttribute(
      'href',
      SCREENS.simulatorSetup.path,
    );

    expect(screen.getByRole('region', { name: t.widgets.names.missions })).toBeVisible();
    // En Gratis el reto de Party lleva el aviso corto del candado (respuesta 20, B8)
    const party = screen.getByRole('region', { name: t.widgets.names.party_challenge });
    expect(await within(party).findByText(t.freePlan.widget)).toBeVisible();
    expect(within(party).getByRole('link', { name: t.billing.featureSeePlans })).toHaveAttribute(
      'href',
      SCREENS.subscription.path,
    );

    // Los indicadores clave calibran con su umbral, nunca con una cifra inventada
    const indicators = screen.getByRole('region', { name: t.home.indicators.title });
    expect(
      within(indicators).getByRole('link', { name: t.home.indicators.seeAll }),
    ).toHaveAttribute('href', SCREENS.progress.path);
    const retention = within(indicators).getByRole('heading', {
      name: t.home.indicators.retention.title,
    }).parentElement?.parentElement as HTMLElement;
    expect(within(retention).getByText(t.states.calibrating.title)).toBeVisible();
    expect(
      within(retention).getByText(
        t.home.indicators.missing(INDICATOR_THRESHOLDS.reviews, t.home.indicators.retention.unit),
      ),
    ).toBeVisible();
    const fatigue = within(indicators).getByRole('heading', {
      name: t.home.indicators.fatigue.title,
    }).parentElement?.parentElement as HTMLElement;
    expect(
      await within(fatigue).findByText(t.home.indicators.fatigue.calibratingNote),
    ).toBeVisible();

    // Sin mazos seguidos la dona dice qué hacer, y las preguntas por día van en cero
    const branches = screen.getByRole('region', { name: t.home.branches.title });
    expect(within(branches).getByText(t.home.branches.empty)).toBeVisible();
    // Vacía queda a su altura y no se estira a la de Preguntas por día
    expect(branches).toHaveClass('lg:self-start');
    const questions = cardOf(t.home.questions.title);
    expect(within(questions).getByText(t.home.questions.same)).toBeVisible();
    expect(within(questions).getByText(t.home.questions.caption(0))).toBeVisible();

    const heatmap = screen.getByRole('region', { name: t.home.yearTitle });
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

  it('con repasos hechos la carga muestra la gráfica con su sombra, su tabla y el promedio', async () => {
    app = await renderApp(SCREENS.home.path, {
      seed: async (api, user) => {
        await reviewToday(api, user, 3);
      },
    });
    await screen.findByRole('heading', { level: 2, name: t.home.reviewsTitle });
    const load = cardOf(t.home.load.title);
    const chart = await within(load).findByRole('img', { name: t.home.load.chartLabel });
    expect(chart).toBeVisible();
    // El sombreado bajo la línea de programados es el único degradado dentro de la app
    expect(chart.querySelector('linearGradient')).not.toBeNull();
    // La tabla para el lector de pantalla trae los cinco meses
    const table = within(load).getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(6);
    expect(
      within(load).getByText(t.home.load.scheduled, { selector: 'figcaption span' }),
    ).toBeVisible();
    // Las tres tarjetas cuentan en la meta de hoy
    const goal = screen.getByRole('region', { name: t.home.goal.title });
    expect(
      within(goal).getByText(t.home.goal.row(t.widgets.plan.rows.cards, 3, 220)),
    ).toBeVisible();
  });

  it('las preguntas por día cuentan esta semana contra la pasada con cifras reales', async () => {
    app = await renderApp(SCREENS.home.path, {
      seed: async (api, user) => {
        await answerToday(api, user, 4);
      },
    });
    await screen.findByRole('heading', { level: 2, name: t.home.reviewsTitle });
    const questions = cardOf(t.home.questions.title);
    // La cifra grande de la tarjeta. La tabla del lector de pantalla también trae el 4
    expect(within(questions).getByText('4', { selector: 'p span' })).toBeVisible();
    expect(within(questions).getByText(t.home.questions.more(4))).toBeVisible();
    expect(
      within(questions).getByRole('table', { name: t.home.questions.tableCaption }),
    ).toBeInTheDocument();
    // Cuatro preguntas no llegan al umbral de aciertos ni al de tiempo por pregunta, que siguen
    // calibrando y dicen cuánto falta
    const indicators = screen.getByRole('region', { name: t.home.indicators.title });
    const missing = within(indicators).getAllByText(
      t.home.indicators.missing(INDICATOR_THRESHOLDS.answered - 4, t.home.indicators.accuracy.unit),
    );
    expect(missing).toHaveLength(2);
    expect(missing[0]).toBeVisible();
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

describe('plan de hoy en Inicio', () => {
  const row = (
    goal: HTMLElement,
    key: 'cards' | 'newCards' | 'questions',
    done: number,
    of: number,
  ) => within(goal).getByText(t.home.goal.row(t.widgets.plan.rows[key], done, of));

  it('en Gratis las preguntas del plan no pasan del tope de 20 al día y lo dice', async () => {
    app = await renderApp(SCREENS.home.path);
    const goal = await screen.findByRole('region', { name: t.home.goal.title });
    // El ajuste del alumno es de 50, pero el plan Gratis solo da 20
    expect(row(goal, 'questions', 0, 20)).toBeVisible();
    expect(within(goal).getByText(homePlanText.capped(20))).toBeVisible();
    // El anillo lo lee el lector de pantalla con las tres filas
    expect(within(goal).getByRole('img', { name: /Meta de hoy al 0 por ciento/ })).toBeVisible();
  });

  it('con un plan de pago las preguntas del plan son las del ajuste y no hay tope', async () => {
    app = await renderApp(SCREENS.home.path, {
      seed: async (api, user) => {
        await changePlan(api, user, 'monthly');
      },
    });
    const goal = await screen.findByRole('region', { name: t.home.goal.title });
    expect(
      await within(goal).findByText(t.home.goal.row(t.widgets.plan.rows.questions, 0, 50)),
    ).toBeVisible();
    expect(within(goal).queryByText(homePlanText.capped(20))).toBeNull();
  });

  it('las nuevas del plan incluyen las que se estudiaron por tema, que no gastan el cupo', async () => {
    app = await renderApp(SCREENS.home.path, {
      seed: async (api, user) => {
        await reviewToday(api, user, 2, true);
      },
    });
    const goal = await screen.findByRole('region', { name: t.home.goal.title });
    // Dos tarjetas nuevas, las dos de una sesión por tema
    expect(
      await within(goal).findByText(t.home.goal.row(t.widgets.plan.rows.newCards, 2, 20)),
    ).toBeVisible();
    expect(row(goal, 'cards', 2, 220)).toBeVisible();
  });

  it('la cuarta fila lleva la meta de la racha con la métrica y la cifra que eligió el alumno (V5, D-151)', async () => {
    app = await renderApp(SCREENS.home.path, {
      seed: async (api, user) => {
        await updateProfile(api, user, {
          settings: { dailyGoal: { metric: 'questions', value: 12 } },
        });
      },
    });
    const goal = await screen.findByRole('region', { name: t.home.goal.title });
    const streakName = t.home.goal.streakRow(t.widgets.goal.metricNames.questions);
    expect(await within(goal).findByText(t.home.goal.row(streakName, 0, 12))).toBeVisible();
    // La fila de preguntas del plan sigue aparte, con su propio tope
    expect(row(goal, 'questions', 0, 20)).toBeVisible();
    // El anillo la lee como cuarta fila, después de las tres del plan
    expect(
      within(goal).getByRole('img', {
        name: new RegExp(
          `${t.home.goal.row(t.widgets.plan.rows.questions, 0, 20)}, ${streakName} 0 de 12$`,
        ),
      }),
    ).toBeVisible();
    const items = within(goal).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[3]).toHaveTextContent(t.home.goal.row(streakName, 0, 12));
  });

  it('la racha cuenta lo hecho hoy en su métrica y entra en el avance del día', async () => {
    app = await renderApp(SCREENS.home.path, {
      seed: async (api, user) => {
        await updateProfile(api, user, {
          settings: { dailyGoal: { metric: 'cards', value: 2 } },
        });
        await reviewToday(api, user, 2);
      },
    });
    const goal = await screen.findByRole('region', { name: t.home.goal.title });
    const streakName = t.home.goal.streakRow(t.widgets.goal.metricNames.cards);
    expect(await within(goal).findByText(t.home.goal.row(streakName, 2, 2))).toBeVisible();
    // Las cuatro filas, con la racha al 100 y las tres del plan casi en cero, promedian 28 por ciento
    expect(
      within(goal).getByRole('img', { name: /^Meta de hoy al 28 por ciento\./ }),
    ).toBeVisible();
  });

  it('el heatmap lleva un enlace al Calendario, que sí da el detalle por día con teclado', async () => {
    app = await renderApp(SCREENS.home.path);
    const heatmap = await screen.findByRole('region', { name: t.home.yearTitle });
    expect(within(heatmap).getByRole('link', { name: t.calendar.heatmapLink })).toHaveAttribute(
      'href',
      SCREENS.calendar.path,
    );
  });
});
