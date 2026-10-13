// @vitest-environment jsdom
// Ajustes del repaso, parte de metas y repaso (D-085, filas 6, 7 y 8, B3 del plan del cambio).
// Temporizador de tarjeta, días fáciles y tarjetas nuevas sin límite, ahora en el panel de Repasar.
// Se guardan con la barra de guardar y quedan como eventos de ajustes.
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { UserSettingsSchema } from '@/data/schemas/people';
import { t } from '@/i18n/es-MX';

// El panel trae muchos campos y userEvent tarda más que los 5 segundos por defecto
vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const PANEL = `${SCREENS.review.path}?ajustes=1`;
const open = () => renderApp(PANEL);
/** El panel abierto, que vive en un diálogo */
const panel = () =>
  screen.findByRole('dialog', { name: t.settingsPage.reviewSettings.title }, { timeout: 10_000 });

describe('ajustes de carga diaria en Ajustes del repaso', () => {
  it('el temporizador viene apagado, no muestra sus opciones y se enciende con sus segundos', async () => {
    const typing = userEvent.setup();
    app = await open();
    const dialog = await panel();
    const toggle = await within(dialog).findByRole('checkbox', {
      name: t.settings.cardTimerEnabled,
    });
    expect(toggle).not.toBeChecked();
    expect(within(dialog).queryByLabelText(t.settings.cardTimerSeconds)).not.toBeInTheDocument();

    await typing.click(toggle);
    await typing.selectOptions(
      within(dialog).getByRole('combobox', { name: t.settings.cardTimerSeconds }),
      '45',
    );
    await typing.click(
      within(dialog).getByRole('checkbox', { name: t.settings.cardTimerAutoReveal }),
    );
    await typing.click(within(dialog).getByRole('button', { name: t.settings.saveChanges }));

    expect(await within(dialog).findByText(t.settings.saved)).toBeInTheDocument();
    const saved = await app.api.repos.users.get(app.user.id);
    expect(saved?.settings.cardTimer).toEqual({ enabled: true, seconds: 45, autoReveal: true });
  });

  it('los días fáciles empiezan todos normales y se guardan por día de la semana', async () => {
    const typing = userEvent.setup();
    app = await open();
    const dialog = await panel();
    await typing.click(
      await within(dialog).findByText(t.settings.easyDaysTitle, { selector: 'summary span' }),
    );
    const fields = within(dialog).getByRole('group', { name: t.settings.easyDaysTitle });
    const sunday = within(fields).getByRole('combobox', { name: t.settings.weekdays.sun });
    expect(within(fields).getAllByRole('combobox')).toHaveLength(7);
    for (const select of within(fields).getAllByRole('combobox')) {
      expect(select).toHaveValue('normal');
    }
    expect(within(dialog).getByText(t.settings.easyDaysSummary(0))).toBeInTheDocument();

    await typing.selectOptions(sunday, 'minimum');
    await typing.selectOptions(
      within(fields).getByRole('combobox', { name: t.settings.weekdays.sat }),
      'reduced',
    );
    expect(within(dialog).getByText(t.settings.easyDaysSummary(2))).toBeInTheDocument();
    await typing.click(within(dialog).getByRole('button', { name: t.settings.saveChanges }));

    expect(await within(dialog).findByText(t.settings.saved)).toBeInTheDocument();
    const saved = await app.api.repos.users.get(app.user.id);
    expect(saved?.settings.easyDays).toMatchObject({
      sun: 'minimum',
      sat: 'reduced',
      mon: 'normal',
    });
  });

  it('sin límite de nuevas apaga el campo y avisa del riesgo', async () => {
    const typing = userEvent.setup();
    app = await open();
    const dialog = await panel();
    const field = await within(dialog).findByRole('spinbutton', {
      name: t.settings.newCardsPerDay,
    });
    expect(field).toBeEnabled();
    // El aviso de la avalancha está escrito junto a la opción, antes de encenderla
    expect(within(dialog).getByText(t.settings.unlimitedNewCardsHint)).toBeInTheDocument();
    await typing.click(
      within(dialog).getByRole('checkbox', { name: t.settings.unlimitedNewCards }),
    );
    expect(field).toBeDisabled();
    await typing.click(within(dialog).getByRole('button', { name: t.settings.saveChanges }));
    expect(await within(dialog).findByText(t.settings.saved)).toBeInTheDocument();
    const saved = await app.api.repos.users.get(app.user.id);
    expect(saved?.settings.unlimitedNewCards).toBe(true);
    // Cada ajuste que cambió quedó como su propio evento
    const keys = (await app.api.repos.events.query({ userId: app.user.id }))
      .filter((event) => event.type === 'settings_changed')
      .map((event) => event.payload.key);
    expect(keys).toContain('settings.unlimitedNewCards');
  });

  it('descartar regresa el temporizador a como estaba', async () => {
    const typing = userEvent.setup();
    app = await open();
    const dialog = await panel();
    const toggle = await within(dialog).findByRole('checkbox', {
      name: t.settings.cardTimerEnabled,
    });
    await typing.click(toggle);
    expect(toggle).toBeChecked();
    await typing.click(within(dialog).getByRole('button', { name: t.settings.discard }));
    expect(toggle).not.toBeChecked();
  });

  it('un intervalo máximo del perfil guía que no está en la lista se muestra tal cual', async () => {
    app = await renderApp(PANEL, {
      user: { settings: UserSettingsSchema.parse({ maxIntervalDays: 287 }) },
    });
    const typing = userEvent.setup();
    const dialog = await panel();
    await typing.click(
      await within(dialog).findByText(t.settings.advanced, { selector: 'summary span' }),
    );
    expect(within(dialog).getByRole('combobox', { name: t.settings.maxInterval })).toHaveValue(
      '287',
    );
  });
});
