// @vitest-environment jsdom
// Configuración, sección Estudio (D-085, filas 6, 7 y 8). Temporizador de tarjeta, días fáciles y
// tarjetas nuevas sin límite. Se guardan con la barra de guardar y quedan como eventos de ajustes.
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { UserSettingsSchema } from '@/data/schemas/people';
import { t } from '@/i18n/es-MX';

// La pantalla trae muchos campos y userEvent tarda más que los 5 segundos por defecto
vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const open = () => renderApp(`${SCREENS.settings.path}?seccion=study`);

describe('ajustes de carga diaria en Configuración', () => {
  it('el temporizador viene apagado, no muestra sus opciones y se enciende con sus segundos', async () => {
    const typing = userEvent.setup();
    app = await open();
    const toggle = await screen.findByRole(
      'checkbox',
      { name: t.settings.cardTimerEnabled },
      { timeout: 10_000 },
    );
    expect(toggle).not.toBeChecked();
    expect(screen.queryByLabelText(t.settings.cardTimerSeconds)).not.toBeInTheDocument();

    await typing.click(toggle);
    await typing.selectOptions(
      screen.getByRole('combobox', { name: t.settings.cardTimerSeconds }),
      '45',
    );
    await typing.click(screen.getByRole('checkbox', { name: t.settings.cardTimerAutoReveal }));
    await typing.click(screen.getByRole('button', { name: t.settings.saveChanges }));

    expect(await screen.findByText(t.settings.saved)).toBeInTheDocument();
    const saved = await app.api.repos.users.get(app.user.id);
    expect(saved?.settings.cardTimer).toEqual({ enabled: true, seconds: 45, autoReveal: true });
  });

  it('los días fáciles empiezan todos normales y se guardan por día de la semana', async () => {
    const typing = userEvent.setup();
    app = await open();
    await typing.click(
      await screen.findByText(
        t.settings.easyDaysTitle,
        { selector: 'summary span' },
        { timeout: 10_000 },
      ),
    );
    const fields = screen.getByRole('group', { name: t.settings.easyDaysTitle });
    const sunday = within(fields).getByRole('combobox', { name: t.settings.weekdays.sun });
    expect(within(fields).getAllByRole('combobox')).toHaveLength(7);
    for (const select of within(fields).getAllByRole('combobox')) {
      expect(select).toHaveValue('normal');
    }
    expect(screen.getByText(t.settings.easyDaysSummary(0))).toBeInTheDocument();

    await typing.selectOptions(sunday, 'minimum');
    await typing.selectOptions(
      within(fields).getByRole('combobox', { name: t.settings.weekdays.sat }),
      'reduced',
    );
    expect(screen.getByText(t.settings.easyDaysSummary(2))).toBeInTheDocument();
    await typing.click(screen.getByRole('button', { name: t.settings.saveChanges }));

    expect(await screen.findByText(t.settings.saved)).toBeInTheDocument();
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
    const field = await screen.findByRole(
      'spinbutton',
      { name: t.settings.newCardsPerDay },
      { timeout: 10_000 },
    );
    expect(field).toBeEnabled();
    // El aviso de la avalancha está escrito junto a la opción, antes de encenderla
    expect(screen.getByText(t.settings.unlimitedNewCardsHint)).toBeInTheDocument();
    await typing.click(screen.getByRole('checkbox', { name: t.settings.unlimitedNewCards }));
    expect(field).toBeDisabled();
    await typing.click(screen.getByRole('button', { name: t.settings.saveChanges }));
    expect(await screen.findByText(t.settings.saved)).toBeInTheDocument();
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
    const toggle = await screen.findByRole(
      'checkbox',
      { name: t.settings.cardTimerEnabled },
      { timeout: 10_000 },
    );
    await typing.click(toggle);
    expect(toggle).toBeChecked();
    await typing.click(screen.getByRole('button', { name: t.settings.discard }));
    expect(toggle).not.toBeChecked();
  });

  it('un intervalo máximo del perfil guía que no está en la lista se muestra tal cual', async () => {
    app = await renderApp(`${SCREENS.settings.path}?seccion=study`, {
      user: { settings: UserSettingsSchema.parse({ maxIntervalDays: 287 }) },
    });
    const typing = userEvent.setup();
    await typing.click(
      await screen.findByText(
        t.settings.advanced,
        { selector: 'summary span' },
        { timeout: 10_000 },
      ),
    );
    expect(screen.getByRole('combobox', { name: t.settings.maxInterval })).toHaveValue('287');
  });
});
