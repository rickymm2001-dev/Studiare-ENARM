// @vitest-environment jsdom
// La semana de Progreso (comentario 13 del plan del cambio, B3). Lo que pasó del planificador a
// Progreso. Los 7 días con lo planeado contra lo hecho, el aviso de sobrecarga con sus ajustes, que
// guardan lo mismo que guardaba el planificador, y los minutos al día con su estado calibrando.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import { UserSettingsSchema, type User } from '@/data/schemas/people';
import { seedManualCards } from '@/data/testing/seedCards';
import { scheduleReview } from '@/engines/fsrs';
import { t } from '@/i18n/es-MX';
import { schedulerConfig } from '../review/schedulerConfig';

// Sembrar más de cien tarjetas y abrir Progreso completo tarda más que el tiempo por defecto
vi.setConfig({ testTimeout: 60_000 });

// Un miércoles a media tarde. Lo hecho hoy y los 7 días de la semana salen de la fecha, así que se fija
// para que la prueba no cruce la medianoche ni dependa del día de la semana
const NOW = new Date('2026-10-14T18:00:00.000Z');

let app: RenderedApp | undefined;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
  vi.useRealTimers();
});

/** La tarjeta de la semana con sus días ya calculados */
async function weekCard() {
  const region = await screen.findByRole(
    'region',
    { name: t.planner.weekTitle },
    { timeout: 15_000 },
  );
  await within(region).findByRole('list', { name: t.weekPlan.daysLabel }, { timeout: 15_000 });
  return region;
}

const days = (region: HTMLElement) =>
  within(within(region).getByRole('list', { name: t.weekPlan.daysLabel })).getAllByRole('listitem');

async function settingsChanges(api: DataApi, userId: string) {
  const events = await api.repos.events.query({ userId });
  return events.flatMap((event) =>
    event.type === 'settings_changed' ? [[event.payload.key, event.payload.value] as const] : [],
  );
}

/** Una tarjeta vista hoy por primera vez y 15 minutos de estudio, para que hoy tenga algo hecho */
async function studyToday(api: DataApi, user: User, card: { cardId: string; deckId: string }) {
  const now = NOW;
  await api.recordEvent(
    createEvent(
      'card_reviewed',
      {
        ...card,
        source: 'card',
        rating: 'good',
        confidence: null,
        msToReveal: 2000,
        msToRate: 1000,
        stateBefore: null,
        stateAfter: scheduleReview(
          null,
          'good',
          now,
          schedulerConfig({ user, settings: user.settings }),
          card.cardId,
        ).state,
      },
      { userId: user.id, tz: user.timeZone },
    ),
  );
  await api.recordEvent(
    createEvent(
      'session_ended',
      {
        kind: 'review',
        reason: 'completed',
        items: 1,
        correct: null,
        durationMs: 15 * 60_000,
        xp: 0,
      },
      { userId: user.id, tz: user.timeZone },
    ),
  );
}

describe('semana de Progreso', () => {
  it('muestra los 7 días con lo planeado y, en el día de hoy, lo hecho', async () => {
    app = await renderApp(SCREENS.progress.path, {
      user: { dailyMinutes: 60 },
      seed: async (api, user) => {
        const { deckId, cardIds } = await seedManualCards(api, user, { count: 5, suspended: 0 });
        await studyToday(api, user, { cardId: cardIds[0] ?? '', deckId });
      },
    });
    const region = await weekCard();
    const list = days(region);
    expect(list).toHaveLength(7);

    // Hoy va primero y marcado, con lo hecho y lo que falta, que ya descuenta lo hecho
    const [today, tomorrow] = list as [HTMLElement, HTMLElement];
    expect(today).toHaveAttribute('aria-current', 'date');
    expect(within(today).getByText(t.planner.today)).toBeInTheDocument();
    expect(within(today).getByText(t.weekPlan.done)).toBeInTheDocument();
    expect(
      within(today).getByText(`${t.weekPlan.doneMinutes(15)} · ${t.weekPlan.doneCards(1)}`),
    ).toBeInTheDocument();
    expect(within(today).getByText(t.weekPlan.toDo)).toBeInTheDocument();
    expect(within(today).getByText(new RegExp(t.planner.newShort(4)))).toBeInTheDocument();
    // Lo hecho más lo planeado de hoy no pasa de su tiempo
    const [, planned] =
      /^(\d+) de 60 min$/.exec(within(today).getByText(/ de 60 min$/).textContent) ?? [];
    expect(Number(planned)).toBeLessThanOrEqual(60);

    // Los días que vienen solo traen lo planeado
    expect(tomorrow).not.toHaveAttribute('aria-current');
    expect(within(tomorrow).getByText(t.planner.tomorrow)).toBeInTheDocument();
    expect(within(tomorrow).getByText(t.weekPlan.planned)).toBeInTheDocument();
    expect(within(tomorrow).queryByText(t.weekPlan.done)).toBeNull();
    for (const day of list.slice(1)) {
      expect(within(day).queryByText(t.weekPlan.done)).toBeNull();
      expect(within(day).getByText(t.weekPlan.planned)).toBeInTheDocument();
    }
    // Sin sobrecarga no hay aviso
    expect(within(region).queryByRole('region', { name: t.planner.overloadTitle })).toBeNull();
  });

  it('avisa la sobrecarga y cada ajuste guarda lo mismo que guardaba el planificador', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.progress.path, {
      user: {
        dailyMinutes: 5,
        settings: UserSettingsSchema.parse({ unlimitedNewCards: true, newCardsPerDay: 30 }),
      },
      seed: async (api, user) => {
        await seedManualCards(api, user, { count: 120, suspended: 0 });
      },
    });
    const region = await weekCard();
    const warning = await within(region).findByRole('region', { name: t.planner.overloadTitle });
    const options = within(warning).getAllByRole('listitem');
    expect(options).toHaveLength(2);

    // Sin límite de nuevas, bajar parte del número guardado y apaga el modo sin límite
    const reduce = options.find((option) =>
      option.textContent.includes('Baja las tarjetas nuevas a 15 por día'),
    );
    if (!reduce) throw new Error('Falta la opción de bajar las nuevas');
    await typing.click(within(reduce).getByRole('button', { name: t.planner.apply }));
    expect(await within(region).findByText(t.planner.applied)).toBeInTheDocument();
    const { api, user } = app;
    await waitFor(async () => {
      const saved = await api.repos.users.get(user.id);
      expect(saved?.settings).toMatchObject({ newCardsPerDay: 15, unlimitedNewCards: false });
    });
    expect(await settingsChanges(api, user.id)).toEqual(
      expect.arrayContaining([
        ['settings.newCardsPerDay', 15],
        ['settings.unlimitedNewCards', false],
      ]),
    );

    // La carga sigue sin caber, así que propone la mitad otra vez
    expect(
      await within(region).findByText(/Baja las tarjetas nuevas a 7 por día/),
    ).toBeInTheDocument();

    // Subir el tiempo guarda los minutos declarados, el aviso se va y el campo los muestra
    const raise = within(
      within(region).getByRole('region', { name: t.planner.overloadTitle }),
    ).getByText(/^Sube tu tiempo a \d+ min al día/);
    const minutes = Number(/a (\d+) min/.exec(raise.textContent)?.[1]);
    expect(minutes).toBeGreaterThan(5);
    const raiseRow = raise.closest('li');
    if (!raiseRow) throw new Error('Falta la fila de subir el tiempo');
    await typing.click(within(raiseRow).getByRole('button', { name: t.planner.apply }));
    await waitFor(() => {
      expect(within(region).queryByRole('region', { name: t.planner.overloadTitle })).toBeNull();
    });
    expect((await api.repos.users.get(user.id))?.dailyMinutes).toBe(minutes);
    expect(await settingsChanges(api, user.id)).toContainEqual(['dailyMinutes', minutes]);
    expect(within(region).getByText(t.planner.applied)).toBeInTheDocument();
    const time = within(region).getByRole('region', { name: t.planner.minutesTitle });
    expect(within(time).getByRole('spinbutton', { name: t.planner.minutesLabel })).toHaveValue(
      minutes,
    );
  });

  it('los minutos calibran, se validan y se guardan, y la semana los usa', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.progress.path, { user: { dailyMinutes: null } });
    const region = await weekCard();
    const time = within(region).getByRole('region', { name: t.planner.minutesTitle });
    // Sin minutos declarados ni días de estudio, el plan usa 60 y lo dice como calibrando
    expect(
      within(time).getByText(t.states.calibrating.remaining(3, t.planner.minutesUnit), {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(within(time).getByText(t.planner.minutesProvisional(60))).toBeInTheDocument();

    const field = within(time).getByRole('spinbutton', { name: t.planner.minutesLabel });
    await typing.type(field, '3');
    await typing.click(within(time).getByRole('button', { name: t.planner.minutesSave }));
    expect(await within(time).findByText(t.planner.minutesError)).toBeInTheDocument();

    await typing.clear(field);
    await typing.type(field, '90');
    await typing.click(within(time).getByRole('button', { name: t.planner.minutesSave }));
    expect(await within(time).findByText(t.planner.minutesSaved)).toBeInTheDocument();
    expect(
      await within(region).findByText(new RegExp(`^${t.planner.minutesDeclared(90)}`)),
    ).toBeInTheDocument();
    expect((await app.api.repos.users.get(app.user.id))?.dailyMinutes).toBe(90);
    expect(within(days(region)[0] as HTMLElement).getByText(/ de 90 min$/)).toBeInTheDocument();

    // Volver al promedio real borra lo declarado y regresa a calibrando
    await typing.click(within(time).getByRole('button', { name: t.planner.minutesUseReal }));
    expect(await within(time).findByText(t.planner.minutesProvisional(60))).toBeInTheDocument();
    expect((await app.api.repos.users.get(app.user.id))?.dailyMinutes).toBeNull();
    expect(within(time).getByRole('spinbutton', { name: t.planner.minutesLabel })).toHaveValue(
      null,
    );
  });

  it('sin mazos lo dice y el plan Gratis recorta la práctica a sus preguntas del día', async () => {
    app = await renderApp(SCREENS.progress.path, { user: { dailyMinutes: 240 } });
    const region = await weekCard();
    // En Gratis no sugiere seguir un mazo del catálogo, que es de pago (4.25, B8)
    expect(await within(region).findByText(t.freePlan.catalog.plannerEmpty)).toBeInTheDocument();
    expect(within(region).queryByText(t.planner.noDecksBody)).toBeNull();
    expect(within(region).getByText(t.planner.limitNote(20))).toBeInTheDocument();
    expect(
      within(days(region)[0] as HTMLElement).getByText(new RegExp(t.planner.questionsShort(20))),
    ).toBeInTheDocument();
  });
});
