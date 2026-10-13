// @vitest-environment jsdom
// Ajustes del repaso en Repasar (B3 del plan del cambio, comentario 4). Un solo panel con todo lo
// que se guarda del repaso. Se abre con su botón o con ?ajustes=1, guarda en los mismos ajustes del
// alumno, y Qué quieres repasar ya no edita los límites, solo los lee y lleva al panel.
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { seedManualCards } from '@/data/testing/seedCards';
import { t } from '@/i18n/es-MX';

// El confeti usa un canvas que jsdom no trae
vi.mock('@/ui/celebrate', () => ({ celebrate: () => undefined }));
vi.setConfig({ testTimeout: 30_000 });

const text = t.settingsPage.reviewSettings;
const WAIT = { timeout: 10_000 };

let app: RenderedApp | undefined;
// jsdom no implementa scrollIntoView. Se pone uno de prueba para ver adónde lleva el panel
const scrolled = vi.fn();
beforeEach(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value: scrolled,
    configurable: true,
    writable: true,
  });
});
afterEach(async () => {
  cleanup();
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  await resetApp(app?.api);
  app = undefined;
});

const panel = () => screen.findByRole('dialog', { name: text.title }, WAIT);
const withCards = (count: number) => ({
  seed: async (api: RenderedApp['api'], user: RenderedApp['user']) => {
    await seedManualCards(api, user, { count, suspended: 0 });
  },
});

describe('Ajustes del repaso', () => {
  it('se abre con el botón de Repasar, trae todo junto y se cierra', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path);
    await typing.click(await screen.findByRole('button', { name: text.open }, WAIT));
    const dialog = await panel();
    expect(within(dialog).getByRole('region', { name: t.settings.goalsTitle })).toBeVisible();
    expect(within(dialog).getByRole('region', { name: t.dailyLoad.title })).toBeVisible();
    expect(within(dialog).getByRole('region', { name: t.settings.pomodoroTitle })).toBeVisible();
    expect(within(dialog).getByLabelText(t.pomodoro.focusMinutes)).toHaveValue(25);

    await typing.click(within(dialog).getByRole('button', { name: text.close }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(screen.getByRole('button', { name: text.open })).toBeVisible();
  });

  it('con ?ajustes=1 se abre solo, guarda un ajuste y lo conserva al volver a abrir', async () => {
    const typing = userEvent.setup();
    app = await renderApp(`${SCREENS.review.path}?ajustes=1`);
    const dialog = await panel();
    const field = await within(dialog).findByRole('spinbutton', {
      name: t.settings.newCardsPerDay,
    });
    expect(field).toHaveValue(20);
    await typing.clear(field);
    await typing.type(field, '35');
    await typing.click(within(dialog).getByRole('button', { name: t.settings.saveChanges }));
    expect(await within(dialog).findByText(t.settings.saved)).toBeInTheDocument();
    const { api, user } = app;
    await waitFor(async () => {
      expect((await api.repos.users.get(user.id))?.settings.newCardsPerDay).toBe(35);
    });

    await typing.click(within(dialog).getByRole('button', { name: text.close }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await typing.click(screen.getByRole('button', { name: text.open }));
    expect(
      within(await panel()).getByRole('spinbutton', { name: t.settings.newCardsPerDay }),
    ).toHaveValue(35);
  });

  it('el Pomodoro se guarda en el panel', async () => {
    const typing = userEvent.setup();
    app = await renderApp(`${SCREENS.review.path}?ajustes=1`);
    const pomodoro = within(await panel()).getByRole('region', { name: t.settings.pomodoroTitle });
    // El campo no se queda vacío al borrar, por eso se escribe el valor completo de una vez
    fireEvent.change(within(pomodoro).getByLabelText(t.pomodoro.focusMinutes), {
      target: { value: '30' },
    });
    await typing.click(within(pomodoro).getByRole('button', { name: t.settings.saveChanges }));
    expect(await within(pomodoro).findByText(t.pomodoro.saved)).toBeInTheDocument();
    const saved = await app.api.repos.users.get(app.user.id);
    expect(saved?.settings.pomodoro.focusMinutes).toBe(30);
  });

  it('Qué quieres repasar solo lee los límites y lleva al panel para cambiarlos', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, withCards(3));
    expect(await screen.findByRole('button', { name: t.reviewSetup.start(3) }, WAIT)).toBeVisible();
    // Cada ajuste tiene un solo lugar. Fuera del panel no hay campos de límites
    expect(screen.queryByRole('spinbutton', { name: t.settings.newCardsPerDay })).toBeNull();
    expect(screen.queryByText(t.reviewSetup.limits)).toBeNull();
    expect(screen.getByText(text.limits(20, 200), { exact: false })).toBeVisible();

    await typing.click(screen.getByRole('button', { name: text.changeLimits }));
    expect(
      within(await panel()).getByRole('spinbutton', { name: t.settings.newCardsPerDay }),
    ).toHaveValue(20);
  });

  it('el engrane del Pomodoro abre el panel en la parte del Pomodoro', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, withCards(1));
    await typing.click(await screen.findByRole('button', { name: t.reviewSetup.start(1) }, WAIT));
    await typing.click(
      await screen.findByRole('button', {
        name: t.pomodoro.show('25:00', t.pomodoro.phases.focus),
      }),
    );
    const pill = screen.getByRole('group', { name: t.pomodoro.label });
    await typing.click(within(pill).getByRole('button', { name: t.pomodoro.settings }));
    const dialog = await panel();
    const pomodoro = within(dialog).getByRole('region', { name: t.settings.pomodoroTitle });
    await waitFor(() => {
      expect(scrolled.mock.contexts).toContain(pomodoro);
    });
  });
});
