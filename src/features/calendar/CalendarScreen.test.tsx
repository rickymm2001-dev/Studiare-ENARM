// @vitest-environment jsdom
// Calendario (V4-B6, la auditoría de V4-B10 y el rediseño de D-150). Lo que se revisa aquí es lo que
// no cubre el motor. El plan dice que el simulador completo es de pago en Gratis, la fecha provisional
// va bajo el héroe y fuera de la tarjeta del plan, un día más allá del horizonte de la proyección no
// afirma que no hay carga, el cambio de mes se anuncia, cada día se nombra completo para el lector de
// pantalla, la rejilla se recorre con el teclado y las tres columnas muestran solo datos reales.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { createEvent } from '@/data/events/createEvent';
import { newId } from '@/data/ids';
import { UserSettingsSchema } from '@/data/schemas/people';
import { changePlan } from '@/data/usecases/subscription';
import { calendarBranchesText } from '@/i18n/calendarBranches';
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

  it('la pista del plan no manda a unos ajustes que no existen, porque el orden se elige en la misma tarjeta', async () => {
    app = await renderApp(SCREENS.calendar.path);
    const card = await plan();
    expect(within(card).queryByText(/orden de tus ajustes/)).toBeNull();
    expect(within(card).getByText(calendarBranchesText.title)).toBeInTheDocument();
  });
});

describe('ramas del plan y su orden', () => {
  const NAMES = ['Medicina interna', 'Pediatría', 'Ginecología y obstetricia', 'Cirugía general'];

  /** Abre la sección y devuelve la lista de ramas */
  async function openBranches(typing: ReturnType<typeof userEvent.setup>) {
    const card = await plan();
    await typing.click(within(card).getByText(calendarBranchesText.title));
    return {
      card,
      list: within(card).getByRole('list', { name: calendarBranchesText.listLabel }),
    };
  }

  it('trae todas las ramas del examen y las cuatro troncales marcadas, en su orden', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.calendar.path);
    const { list } = await openBranches(typing);
    const boxes = within(list).getAllByRole('checkbox');
    expect(boxes).toHaveLength(8);
    expect(boxes.filter((box) => (box as HTMLInputElement).checked)).toHaveLength(4);
    // Las marcadas van primero y en el orden de los ajustes
    const names = within(list)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    NAMES.forEach((name, index) => {
      expect(names[index]).toContain(name);
    });
    for (const rest of ['Medicina familiar', 'Urgencias', 'Salud pública']) {
      expect(within(list).getByRole('checkbox', { name: rest })).not.toBeChecked();
    }
  });

  it('incluir una rama y bajar otra guardan el orden en los ajustes con un evento por cambio', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.calendar.path);
    const { card, list } = await openBranches(typing);
    await typing.click(within(list).getByRole('checkbox', { name: 'Urgencias' }));
    await typing.click(
      await within(card).findByRole('button', { name: calendarBranchesText.moveUp('Urgencias') }),
    );
    await typing.click(
      within(card).getByRole('button', { name: calendarBranchesText.moveDown('Medicina interna') }),
    );
    expect(await within(card).findByText(calendarBranchesText.saved)).toBeInTheDocument();

    const { user, api } = app;
    const saved = await api.repos.users.get(user.id);
    expect(saved?.settings.branches).toEqual([
      'pediatrics',
      'internal_medicine',
      'obstetrics_gynecology',
      'emergency_medicine',
      'general_surgery',
    ]);
    const changes = (await api.repos.events.query({ userId: user.id })).filter(
      (event) => event.type === 'settings_changed' && event.payload.key === 'settings.branches',
    );
    expect(changes).toHaveLength(3);
    // El plan ya empieza por la primera rama de la lista
    await waitFor(() => {
      expect(card.querySelector('ol li')?.textContent).toContain('Pediatría');
    }, WAIT);
  });

  it('después de bajar una rama el foco se queda en su botón aunque cambie de lugar', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.calendar.path);
    const { card } = await openBranches(typing);
    await typing.click(
      within(card).getByRole('button', { name: calendarBranchesText.moveDown('Medicina interna') }),
    );
    await waitFor(() => {
      expect(
        within(card).getByRole('button', {
          name: calendarBranchesText.moveDown('Medicina interna'),
        }),
      ).toHaveFocus();
    }, WAIT);
  });

  it('si la rama llega al primer lugar el foco pasa a su botón de bajar, y al último a su botón de subir', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.calendar.path);
    const { card } = await openBranches(typing);
    const button = (name: string) => within(card).getByRole('button', { name });
    // Pediatría sube al primer lugar y su botón de subir queda deshabilitado
    await typing.click(button(calendarBranchesText.moveUp('Pediatría')));
    await waitFor(() => {
      expect(button(calendarBranchesText.moveUp('Pediatría'))).toBeDisabled();
      expect(button(calendarBranchesText.moveDown('Pediatría'))).toHaveFocus();
    }, WAIT);
    // Con Pediatría primero, Ginecología y obstetricia baja al último de las cuatro y su botón de bajar se deshabilita
    await typing.click(button(calendarBranchesText.moveDown('Ginecología y obstetricia')));
    await waitFor(() => {
      expect(button(calendarBranchesText.moveDown('Ginecología y obstetricia'))).toBeDisabled();
      expect(button(calendarBranchesText.moveUp('Ginecología y obstetricia'))).toHaveFocus();
    }, WAIT);
  });

  it('al marcar una rama la casilla conserva el foco aunque la rama cambie de grupo', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.calendar.path);
    const { list } = await openBranches(typing);
    const box = () => within(list).getByRole('checkbox', { name: 'Urgencias' });
    await typing.click(box());
    await waitFor(() => {
      expect(box()).toBeChecked();
      expect(box()).toHaveFocus();
    }, WAIT);
    await typing.click(box());
    await waitFor(() => {
      expect(box()).not.toBeChecked();
      expect(box()).toHaveFocus();
    }, WAIT);
  });

  it('no deja quitar la última rama y lo dice', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.calendar.path, {
      user: { settings: UserSettingsSchema.parse({ branches: ['internal_medicine'] }) },
    });
    const { card, list } = await openBranches(typing);
    expect(within(list).getByRole('checkbox', { name: 'Medicina interna' })).toBeDisabled();
    expect(within(card).getByText(calendarBranchesText.atLeastOne)).toBeInTheDocument();
    // Con una sola rama no hay a dónde moverla
    expect(
      within(card).getByRole('button', { name: calendarBranchesText.moveUp('Medicina interna') }),
    ).toBeDisabled();
    expect(
      within(card).getByRole('button', { name: calendarBranchesText.moveDown('Medicina interna') }),
    ).toBeDisabled();
  });
});

describe('fecha provisional', () => {
  it('va bajo el héroe, que lleva la cuenta regresiva, y no dentro de la tarjeta del plan', async () => {
    // Sin fecha propia el plan usa la de la plataforma, que es provisional
    app = await renderApp(SCREENS.calendar.path, { user: { examDate: null } });
    const card = await plan();
    const note = await screen.findByText(text.provisionalDate, undefined, WAIT);
    expect(within(card).queryByText(text.provisionalDate)).toBeNull();
    // La cuenta regresiva va en la explicación en cursiva del héroe, justo arriba del aviso
    const lead = note.previousElementSibling?.querySelector('.screen-lead');
    expect(lead?.textContent).toMatch(
      /^Repasos que ya están programados.*Faltan? \d[\d,]* días? para el ENARM\.$/,
    );
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
    // La píldora abrevia y queda fuera del árbol accesible. El nombre del día dice lo completo
    const pill = today?.querySelector('span[aria-hidden].truncate');
    expect(pill?.textContent).toBe(text.done(1));
    expect(today?.getAttribute('aria-label')).not.toMatch(/Sim\.|~|\d hecha/);
    // El título del detalle en marino es lo primero del día, las tarjetas hechas
    expect(detail()).toContain(text.doneLong(1));
  });

  it('el día elegido lleva el borde cielo, hoy el fondo crema y la rejilla se desplaza de lado en el teléfono', async () => {
    app = await renderApp(SCREENS.calendar.path, {
      seed: async (api, user) => {
        await changePlan(api, user, 'monthly');
      },
    });
    await heading();
    const buttons = await dayButtons();
    const selected = buttons.find((button) => button.getAttribute('aria-pressed') === 'true');
    expect(selected).toHaveClass('border-indicator', 'bg-cream', 'rounded-[10px]');
    expect(selected?.className).not.toMatch(/border-primary/);
    // Solo el día elegido entra con tabulador, los demás con las flechas
    expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
    const table = screen.getByRole('table');
    // El ancho mínimo va en la caja de la tabla y la que se desplaza es relative, para que los
    // nombres largos de los días, solo para el lector de pantalla, no ensanchen la página
    expect(table.parentElement).toHaveClass('min-w-[34rem]');
    expect(table.parentElement?.parentElement).toHaveClass('overflow-x-auto', 'relative');
    // La cabecera dice Lun a Dom a la vista y el nombre completo para el lector de pantalla
    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(7);
    expect(headers[0]?.textContent).toBe('lunlunes');
  });

  it('las flechas recorren la rejilla y al cruzar el fin de mes cambian el mes y conservan el foco', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.calendar.path);
    const title = await heading();
    const before = title.textContent;
    const buttons = await dayButtons();
    const last = buttons.at(-1) as HTMLElement;
    last.focus();
    await typing.keyboard('{ArrowRight}');
    // El primero del mes siguiente queda elegido y con el foco
    await waitFor(() => {
      expect(title.textContent).not.toBe(before);
    }, WAIT);
    const next = (await dayButtons())[0] as HTMLElement;
    expect(next).toHaveAttribute('aria-pressed', 'true');
    expect(next).toHaveFocus();
    await typing.keyboard('{ArrowLeft}');
    await waitFor(() => {
      expect(title.textContent).toBe(before);
    }, WAIT);
    expect((await dayButtons()).at(-1)).toHaveFocus();
    // Inicio y Fin van al lunes y al domingo de la semana sin salir del mes si caben
    await typing.keyboard('{Home}');
    const focused = document.activeElement as HTMLElement;
    expect(focused.getAttribute('aria-pressed')).toBe('true');
    expect(focused.dataset.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('el héroe y las tres columnas (D-150)', () => {
  it('lleva el kicker, el título del mes, la cuenta regresiva en cursiva y Nueva sesión hacia Simular', async () => {
    app = await renderApp(SCREENS.calendar.path, { user: { examDate: '2027-09-14' } });
    await heading();
    expect(screen.getByRole('heading', { level: 1, name: text.heroTitle })).toBeVisible();
    expect(screen.getByText(t.screens.calendar.title, { selector: '.eyebrow' })).toBeVisible();
    const lead = document.querySelector('.screen-lead');
    expect(lead?.textContent.startsWith(text.heroLead)).toBe(true);
    expect(lead?.textContent).toMatch(/para el ENARM\.$/);
    expect(screen.getByRole('link', { name: text.newSession })).toHaveAttribute(
      'href',
      SCREENS.simulatorSetup.path,
    );
    // No hay vistas de semana ni de día, así que no hay segmentado
    expect(screen.queryByRole('button', { name: 'Semana' })).toBeNull();
  });

  it('sin mazos la columna de hoy lo dice en vez de inventar cifras, y Empezar ahora lleva a Simular', async () => {
    app = await renderApp(SCREENS.calendar.path);
    await heading();
    const todayColumn = screen.getByRole('complementary', { name: text.detail.today });
    expect(within(todayColumn).getByText(/^Hoy, [a-zá-ú]+$/)).toBeVisible();
    expect(within(todayColumn).getByText(text.todayCount(0))).toBeVisible();
    const plan = within(todayColumn).getByRole('region', { name: text.todayPlan.title });
    expect(within(plan).getByText(text.detailNoDecks)).toBeVisible();
    const month = within(todayColumn).getByRole('region', { name: text.month.title });
    expect(within(month).getByText(text.month.none)).toBeVisible();
    expect(within(month).getByText(text.detailNoDecks)).toBeVisible();
    // El detalle en marino dice Nada programado y lleva al simulador, porque no hay repasos
    expect(detail()).toContain(text.detail.emptyTitle);
    expect(screen.getByRole('link', { name: text.detail.start })).toHaveAttribute(
      'href',
      SCREENS.simulatorSetup.path,
    );
    // Sin Party la tarjeta salvia es la del siguiente día cargado y tampoco inventa
    const busy = screen.getByRole('region', { name: text.nextBusy.title });
    expect(within(busy).getByText(text.detailNoDecks)).toBeVisible();
    // Leyenda con las cinco clases de píldora, dentro de la tarjeta del mes
    const monthCard = screen.getByRole('region', { name: /\d{4}$/ });
    for (const label of Object.values(text.legendItems)) {
      expect(within(monthCard).getByText(label)).toBeVisible();
    }
  });

  it('una sesión terminada hoy aparece como píldora marina, en el plan de hoy y en las cifras del mes', async () => {
    app = await renderApp(SCREENS.calendar.path, {
      seed: async (api, user) => {
        await api.repos.events.append(
          createEvent(
            'session_ended',
            {
              kind: 'practice',
              reason: 'completed',
              items: 20,
              correct: 14,
              durationMs: 1_440_000,
              xp: 40,
            },
            { userId: user.id, tz: user.timeZone, clock: { now: () => new Date() } },
          ),
        );
      },
    });
    await heading();
    const buttons = await dayButtons();
    const today = buttons.find((button) => button.getAttribute('aria-current') === 'date');
    await expect
      .poll(() => today?.getAttribute('aria-label') ?? '', { timeout: 15_000 })
      .toContain(text.pills.sessionLong('practice', 20));
    const pill = today?.querySelector('span[aria-hidden].bg-primary');
    expect(pill?.textContent).toBe(text.pills.session('practice', 20));
    const todayColumn = screen.getByRole('complementary', { name: text.detail.today });
    const plan = within(todayColumn).getByRole('region', { name: text.todayPlan.title });
    expect(within(plan).getByText(text.pills.sessionLong('practice', 20))).toBeVisible();
    expect(within(plan).getByText(text.todayPlan.sessionHint(24))).toBeVisible();
    expect(within(todayColumn).getByText(text.todayCount(1))).toBeVisible();
    const month = within(todayColumn).getByRole('region', { name: text.month.title });
    expect(within(month).getByText(text.month.sessionsDone).nextElementSibling?.textContent).toBe(
      '1',
    );
    // El título del detalle es la sesión y, sin repasos pendientes, Empezar ahora sigue al simulador
    expect(detail()).toContain(text.pills.sessionLong('practice', 20));
  });
});
