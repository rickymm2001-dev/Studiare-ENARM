// @vitest-environment jsdom
// Recordatorios por correo en Ajustes del repaso (B15, 3.2 y 3.7). La nube es un doble que guarda lo que se le
// manda, como la base de verdad, y los permisos de medición son los de siempre
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApp } from '@/app/testing/renderApp';
import { useCloud } from '@/app/cloudState';
import {
  resetAnalytics,
  setAnalyticsConsent,
  setAnalyticsSink,
  type AnalyticsRecord,
} from '@/data/analytics/catalog';
import { frequencyOf, type ReminderPrefs } from '@/data/cloud/engagementContracts';
import { DataProvider } from '@/data/DataProvider';
import { useDataApi, type DataApi } from '@/data/context';
import { makeUser } from '@/data/testing/fixtures';
import { seedOverdueCards } from '@/data/testing/seedCards';
import { engagementTexts, hourLabel } from '@/i18n/engagement';
import { t } from '@/i18n/es-MX';
import { ReminderSettingsSection } from './ReminderSettingsSection';

vi.setConfig({ testTimeout: 30_000 });
const WAIT = { timeout: 10_000 };
const text = engagementTexts.reminders;
const EMAIL = 'ana.garcia@correo.mx';

const OFF: ReminderPrefs = {
  available: true,
  enabled: false,
  hour: 20,
  days: [0, 1, 2, 3, 4, 5, 6],
  frequency: 'daily',
  onlyWhenDue: true,
  timeZone: 'America/Merida',
  unsubscribed: false,
};

/** La nube falsa. Guarda lo que se le manda y cuenta cada llamada */
const server = {
  prefs: OFF,
  calls: [] as { name: string; args: unknown }[],
  loadFails: 0,
  saveError: null as null | { code: string },
};
const cloud = {
  rpc: vi.fn((name: string, args?: Record<string, unknown>) => {
    server.calls.push({ name, args });
    if (name === 'my_reminder_prefs') {
      if (server.loadFails > 0) {
        server.loadFails -= 1;
        return Promise.resolve({ data: null, error: { message: 'sin red' } });
      }
      return Promise.resolve({ data: server.prefs, error: null });
    }
    if (name === 'set_reminder_prefs') {
      if (server.saveError) return Promise.resolve({ data: null, error: server.saveError });
      const days = args?.p_days as number[];
      server.prefs = {
        available: true,
        enabled: args?.p_enabled as boolean,
        hour: args?.p_hour as number,
        days,
        frequency: frequencyOf(days),
        onlyWhenDue: args?.p_only_when_due as boolean,
        timeZone: args?.p_time_zone as string,
        unsubscribed: false,
      };
      return Promise.resolve({ data: server.prefs, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }),
};
vi.mock('@/data/cloud/client', () => ({
  cloudConfigured: () => true,
  getCloud: () => cloud,
  loadCloud: () => Promise.resolve(cloud),
}));

let captured: DataApi | undefined;
function Capture() {
  const value = useDataApi();
  useEffect(() => {
    captured = value;
  }, [value]);
  return null;
}

const USER = makeUser();
const dirtyStates: boolean[] = [];

beforeEach(() => {
  server.prefs = OFF;
  server.calls = [];
  server.loadFails = 0;
  server.saveError = null;
  dirtyStates.length = 0;
  cloud.rpc.mockClear();
  useCloud.getState().set({
    status: 'linked',
    identity: { authId: 'auth-1', email: EMAIL, role: 'student', alias: null },
  });
});
afterEach(async () => {
  cleanup();
  useCloud.getState().set({ status: 'checking' });
  resetAnalytics();
  await resetApp(captured);
  captured = undefined;
});

async function mount(options: { cards?: boolean } = {}) {
  render(
    <DataProvider kind="real">
      <Capture />
      <ReminderSettingsSection
        userId={USER.id}
        onDirtyChange={(dirty) => {
          dirtyStates.push(dirty);
        }}
      />
    </DataProvider>,
  );
  await waitFor(() => {
    expect(captured).toBeDefined();
  }, WAIT);
  await captured?.repos.users.put(USER);
  if (options.cards) await seedOverdueCards(captured as DataApi, USER, { overdue: 3, unseen: 1 });
}

const switchBox = () => screen.findByRole('checkbox', { name: text.enable }, WAIT);
const saveButton = () => screen.findByRole('button', { name: t.settings.saveChanges }, WAIT);
const calls = (name: string) => server.calls.filter((call) => call.name === name);

describe('ReminderSettingsSection', () => {
  it('sin cuenta en la nube dice que la necesita y no pregunta ni guarda nada', async () => {
    useCloud.getState().set({ status: 'off' });
    await mount();
    expect(screen.getByText(text.needsCloud)).toBeVisible();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(server.calls).toEqual([]);
  });

  it('empieza apagado y solo muestra el interruptor', async () => {
    await mount();
    const toggle = await switchBox();
    expect(toggle).not.toBeChecked();
    expect(screen.queryByLabelText(text.hour)).toBeNull();
    expect(screen.queryByRole('button', { name: t.settings.saveChanges })).toBeNull();
    expect(calls('my_reminder_prefs')).toHaveLength(1);
  });

  it('al prenderlo muestra hora, frecuencia y solo con pendientes, y el correo va enmascarado', async () => {
    const typing = userEvent.setup();
    await mount();
    await typing.click(await switchBox());
    expect(screen.getByLabelText(text.hour)).toHaveValue('20');
    expect(screen.getByRole('button', { name: text.frequencies.daily })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('checkbox', { name: text.onlyWhenDue })).toBeChecked();
    expect(screen.getByText(text.sentTo('a***@correo.mx'))).toBeVisible();
    // El correo completo nunca se pinta
    expect(document.body.textContent).not.toContain(EMAIL);
    expect(await saveButton()).toBeVisible();
  });

  it('guarda a las 8 de la noche de lunes a viernes con los nombres de la base, y manda la foto de conteos', async () => {
    const typing = userEvent.setup();
    await mount({ cards: true });
    await typing.click(await switchBox());
    await typing.click(screen.getByRole('button', { name: text.frequencies.weekdays }));
    await typing.click(await saveButton());
    expect(await screen.findByText(text.saved, {}, WAIT)).toBeInTheDocument();
    const [save] = calls('set_reminder_prefs');
    expect(save?.args).toMatchObject({
      p_enabled: true,
      p_hour: 20,
      p_days: [1, 2, 3, 4, 5],
      p_only_when_due: true,
    });
    expect(typeof (save?.args as { p_time_zone: string }).p_time_zone).toBe('string');
    // Con los recordatorios prendidos, la foto sube ya, sin esperar a la sincronización
    await waitFor(() => {
      expect(calls('put_due_snapshot')).toHaveLength(1);
    }, WAIT);
    const snapshot = (calls('put_due_snapshot')[0]?.args as { p_snapshot: { days: unknown[] } })
      .p_snapshot;
    expect(snapshot.days).toHaveLength(14);
    expect(JSON.stringify(snapshot)).not.toContain(EMAIL);
    // Y el interruptor sigue prendido con lo que guardó
    expect(screen.getByRole('checkbox', { name: text.enable })).toBeChecked();
    expect(screen.getByRole('button', { name: text.frequencies.weekdays })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('con Días que elijas pide al menos un día y guarda los que se marcan', async () => {
    const typing = userEvent.setup();
    await mount();
    await typing.click(await switchBox());
    await typing.click(screen.getByRole('button', { name: text.frequencies.custom }));
    const group = screen.getByRole('group', { name: text.days });
    // Empiezan los siete marcados. Se quitan todos y no deja guardar
    for (const box of within(group).getAllByRole('checkbox')) await typing.click(box);
    await typing.click(await saveButton());
    expect(await screen.findByText(text.needsDay)).toBeVisible();
    expect(calls('set_reminder_prefs')).toHaveLength(0);

    await typing.click(within(group).getByRole('checkbox', { name: 'Domingo' }));
    await typing.click(within(group).getByRole('checkbox', { name: 'Miércoles' }));
    await typing.click(await saveButton());
    await screen.findByText(text.saved, {}, WAIT);
    expect(calls('set_reminder_prefs')[0]?.args).toMatchObject({ p_days: [0, 3] });
    expect(server.prefs.frequency).toBe('custom');
  });

  it('la hora se elige de las 5 de la mañana a las 11 de la noche', async () => {
    const typing = userEvent.setup();
    await mount();
    await typing.click(await switchBox());
    const select = screen.getByLabelText(text.hour);
    const options = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options[0]).toBe(hourLabel(5));
    expect(options.at(-1)).toBe(hourLabel(23));
    expect(options).toHaveLength(19);
    await typing.selectOptions(select, '8');
    await typing.click(await saveButton());
    await screen.findByText(text.saved, {}, WAIT);
    expect(calls('set_reminder_prefs')[0]?.args).toMatchObject({ p_hour: 8 });
  });

  it('muestra lo guardado y avisa al panel de los cambios sin guardar', async () => {
    const typing = userEvent.setup();
    server.prefs = {
      ...OFF,
      enabled: true,
      hour: 7,
      days: [1, 3],
      frequency: 'custom',
      onlyWhenDue: false,
    };
    await mount();
    expect(await switchBox()).toBeChecked();
    expect(screen.getByLabelText(text.hour)).toHaveValue('7');
    expect(screen.getByRole('checkbox', { name: text.onlyWhenDue })).not.toBeChecked();
    expect(dirtyStates.at(-1)).toBe(false);
    await typing.click(screen.getByRole('checkbox', { name: text.onlyWhenDue }));
    await waitFor(() => {
      expect(dirtyStates.at(-1)).toBe(true);
    });
    // Descartar regresa a lo guardado
    await typing.click(screen.getByRole('button', { name: t.settings.discard }));
    expect(screen.getByRole('checkbox', { name: text.onlyWhenDue })).not.toBeChecked();
    await waitFor(() => {
      expect(dirtyStates.at(-1)).toBe(false);
    });
  });

  it('quien se dio de baja desde un correo ve el aviso y el interruptor apagado', async () => {
    server.prefs = { ...OFF, enabled: false, unsubscribed: true };
    await mount();
    expect(await switchBox()).not.toBeChecked();
    expect(screen.getByText(text.unsubscribed)).toBeVisible();
  });

  it('si no puede leer lo guardado lo dice y deja reintentar', async () => {
    const typing = userEvent.setup();
    server.loadFails = 1;
    await mount();
    expect(await screen.findByText(text.loadFailed, {}, WAIT)).toBeVisible();
    await typing.click(screen.getByRole('button', { name: text.retry }));
    expect(await switchBox()).toBeVisible();
    expect(calls('my_reminder_prefs')).toHaveLength(2);
  });

  it('si el servidor no deja guardar lo dice y conserva lo que se editó', async () => {
    const typing = userEvent.setup();
    server.saveError = { code: '42501' };
    await mount();
    await typing.click(await switchBox());
    await typing.click(await saveButton());
    expect(await screen.findByText(text.notActiveDevice)).toBeVisible();
    expect(screen.getByRole('checkbox', { name: text.enable })).toBeChecked();
    server.saveError = { code: 'XX000' };
    await typing.click(await saveButton());
    expect(await screen.findByText(text.saveFailed)).toBeVisible();
    expect(calls('put_due_snapshot')).toHaveLength(0);
  });

  it('apagarlos guarda y no sube ninguna foto', async () => {
    const typing = userEvent.setup();
    server.prefs = { ...OFF, enabled: true };
    await mount();
    await typing.click(await switchBox());
    await typing.click(await saveButton());
    await screen.findByText(text.saved, {}, WAIT);
    expect(calls('set_reminder_prefs')[0]?.args).toMatchObject({ p_enabled: false });
    expect(calls('put_due_snapshot')).toHaveLength(0);
  });
});

describe('medición al guardar los recordatorios', () => {
  function watch(consent: boolean | null) {
    const seen: AnalyticsRecord[] = [];
    setAnalyticsSink((record) => seen.push(record));
    setAnalyticsConsent(consent);
    return seen;
  }

  it('con el permiso manda solo si quedó prendido, la frecuencia y la parte del día', async () => {
    const seen = watch(true);
    const typing = userEvent.setup();
    await mount();
    await typing.click(await switchBox());
    await typing.click(screen.getByRole('button', { name: text.frequencies.weekdays }));
    await typing.click(await saveButton());
    await screen.findByText(text.saved, {}, WAIT);
    expect(seen.map((record) => [record.event, record.properties])).toEqual([
      ['reminder_prefs_saved', { enabled: true, frequency: 'weekdays', hour_band: 'night' }],
    ]);
    // Nunca la hora exacta, los días, la zona ni el correo. Se revisan solo las propiedades, porque la marca de
    // tiempo del registro (at) es un número que puede traer cualquier par de dígitos
    expect(JSON.stringify(seen.map((record) => record.properties))).not.toMatch(
      /@|America|"hour"|20/,
    );
  });

  it('sin el permiso guarda igual y no mide nada', async () => {
    const seen = watch(false);
    const typing = userEvent.setup();
    await mount();
    await typing.click(await switchBox());
    await typing.click(await saveButton());
    await screen.findByText(text.saved, {}, WAIT);
    expect(seen).toEqual([]);
  });
});
