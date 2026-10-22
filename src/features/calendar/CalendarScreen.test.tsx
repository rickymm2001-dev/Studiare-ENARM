// @vitest-environment jsdom
// Calendario (V4-B6 y la auditoría de V4-B10). Lo que se revisa aquí es lo que no cubre el motor. El plan
// dice que el simulador completo es de pago en Gratis, la fecha provisional va junto a la cuenta
// regresiva, un día más allá del horizonte de la proyección no afirma que no hay carga, el cambio de
// mes se anuncia y cada día se nombra completo para el lector de pantalla.
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { createEvent } from '@/data/events/createEvent';
import { newId } from '@/data/ids';
import { changePlan } from '@/data/usecases/subscription';
import { t } from '@/i18n/es-MX';

vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const text = t.calendar;
const WAIT = { timeout: 15_000 };

const heading = () => screen.findByRole('heading', { level: 2, name: /\d{4}$/ }, WAIT);
const plan = () => screen.findByRole('region', { name: text.plan.title }, WAIT);
/** Los botones de día del mes que se ve, en orden */
const dayButtons = async () => {
  const grid = await screen.findByRole('table', undefined, WAIT);
  return within(grid).getAllByRole('button');
};
/** El texto del detalle del día elegido */
const detail = () => {
  const section = document.getElementById('calendario-dia')?.closest('section');
  if (!section) throw new Error('No está el detalle del día');
  return section.textContent;
};

describe('plan por semanas según el plan del alumno', () => {
  it('en Gratis dice que el simulador completo de los domingos es de pago y lleva a Suscripción', async () => {
    app = await renderApp(SCREENS.calendar.path);
    const card = await plan();
    expect(
      await within(card).findByText(text.plan.simulatorPaid, { exact: false }, WAIT),
    ).toBeVisible();
    expect(within(card).getByRole('link', { name: t.billing.featureSeePlans })).toHaveAttribute(
      'href',
      SCREENS.subscription.path,
    );
    // El plan sigue a la vista, no se esconde
    expect(within(card).getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('con un plan de pago no pone el aviso', async () => {
    app = await renderApp(SCREENS.calendar.path, {
      seed: async (api, user) => {
        await changePlan(api, user, 'monthly');
      },
    });
    const card = await plan();
    expect(within(card).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(within(card).queryByText(text.plan.simulatorPaid, { exact: false })).toBeNull();
  });

  it('la pista no promete un orden de ramas que nadie puede elegir', async () => {
    app = await renderApp(SCREENS.calendar.path);
    const card = await plan();
    expect(within(card).queryByText(/orden de tus ajustes/)).toBeNull();
  });
});

describe('fecha provisional', () => {
  it('va junto a la cuenta regresiva y no dentro de la tarjeta del plan', async () => {
    // Sin fecha propia el plan usa la de la plataforma, que es provisional
    app = await renderApp(SCREENS.calendar.path, { user: { examDate: null } });
    const card = await plan();
    const note = await screen.findByText(text.provisionalDate, undefined, WAIT);
    expect(within(card).queryByText(text.provisionalDate)).toBeNull();
    // Comparte contenedor con la cuenta regresiva
    expect(note.parentElement?.textContent).toMatch(/ENARM/);
    expect(note.parentElement?.querySelector('p.font-medium')).not.toBeNull();
  });

  it('con una fecha propia, como en la demo, no hay aviso de fecha provisional', async () => {
    app = await renderApp(SCREENS.calendar.path, { user: { examDate: '2027-09-14' } });
    await plan();
    expect(screen.queryByText(text.provisionalDate)).toBeNull();
  });
});

describe('mes y días', () => {
  it('el título del mes se anuncia cuando cambia y el botón cambia el mes', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.calendar.path);
    const title = await heading();
    expect(title).toHaveAttribute('aria-live', 'polite');
    const before = title.textContent;
    await typing.click(screen.getByRole('button', { name: text.next }));
    expect(title.textContent).not.toBe(before);
    expect(title.textContent.startsWith('De ')).toBe(false);
    await typing.click(screen.getByRole('button', { name: text.today }));
    expect(title.textContent).toBe(before);
  });

  it('un día más allá de la proyección dice que la proyección llega a 60 días y no que no hay carga', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.calendar.path);
    await heading();
    // Cuatro meses adelante queda siempre más allá de los 60 días
    for (let step = 0; step < 4; step += 1) {
      await typing.click(screen.getByRole('button', { name: text.next }));
    }
    const buttons = await dayButtons();
    await typing.click(buttons[10] as HTMLElement);
    expect(detail()).toContain(text.detailBeyond(60));
    expect(detail()).not.toContain(text.detailNoLoad);
    expect(detail()).not.toMatch(/No hay actividad/);
  });

  it('sin mazos seguidos un día cercano dice que no hay carga proyectada porque no sigue mazos', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.calendar.path);
    await heading();
    const buttons = await dayButtons();
    const todayIndex = buttons.findIndex(
      (button) => button.getAttribute('aria-current') === 'date',
    );
    let tomorrow = buttons[todayIndex + 1];
    if (!tomorrow) {
      // Hoy es el último día del mes, así que mañana es el primero del siguiente
      await typing.click(screen.getByRole('button', { name: text.next }));
      tomorrow = (await dayButtons())[0];
    }
    await typing.click(tomorrow as HTMLElement);
    expect(detail()).toContain(text.detailNoDecks);
    expect(detail()).not.toContain(text.detailBeyond(60));
  });

  it('hoy sin actividad lo dice, y con actividad el nombre del día dice las tarjetas hechas completas', async () => {
    app = await renderApp(SCREENS.calendar.path);
    await heading();
    expect(detail()).toContain(text.detailNothingToday);
    cleanup();
    await resetApp(app.api);
    app = await renderApp(SCREENS.calendar.path, {
      seed: async (api, user) => {
        const now = new Date();
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
                due: new Date(now.getTime() + 14 * 86_400_000).toISOString(),
                stability: 10,
                difficulty: 5,
                scheduledDays: 14,
                learningSteps: 0,
                reps: 1,
                lapses: 0,
                state: 'review',
                lastReview: now.toISOString(),
              },
            },
            { userId: user.id, tz: user.timeZone, clock: { now: () => now } },
          ),
        );
      },
    });
    const buttons = await dayButtons();
    const today = buttons.find((button) => button.getAttribute('aria-current') === 'date');
    await expect
      .poll(() => today?.getAttribute('aria-label') ?? '', { timeout: 15_000 })
      .toContain(text.doneLong(1));
    // En teléfono el día lleva un punto de adorno y el texto corto solo se ve desde sm
    expect(today?.querySelector('span[aria-hidden].sm\\:hidden')).not.toBeNull();
    // Las abreviaturas de la vista no van en el nombre accesible
    expect(today?.getAttribute('aria-label')).not.toMatch(/Sim\.|~|\d hecha/);
  });

  it('los días con algo muestran un punto en teléfono y el texto solo desde sm', async () => {
    app = await renderApp(SCREENS.calendar.path, {
      seed: async (api, user) => {
        await changePlan(api, user, 'monthly');
      },
    });
    await heading();
    const buttons = await dayButtons();
    // Todos los botones tienen el área táctil de un día y el selector usa el color de indicador
    const selected = buttons.find((button) => button.getAttribute('aria-pressed') === 'true');
    expect(selected).toHaveClass('border-indicator');
    expect(selected?.className).not.toMatch(/border-primary/);
    const notes = document.querySelectorAll('table button span.hidden.sm\\:block');
    for (const note of notes) expect(note).toHaveClass('hidden');
  });
});
