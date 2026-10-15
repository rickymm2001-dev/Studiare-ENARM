// @vitest-environment jsdom
// Sección Banco de Plataforma (pantalla 25, 4.3 del plan de B11). Sin la nube no se cambia nada. Con la
// nube lee los ajustes con los de fábrica donde faltan, guarda el freno y la tarifa por revisión, y no
// guarda nada fuera de rango.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { DEFAULT_BANK_LIMITS } from '@/data/cloud/bankAdmin';
import { bankAdminText } from '@/i18n/bankAdmin';
import { BankSettingsForm } from './BankSettingsForm';

vi.setConfig({ testTimeout: 30_000 });

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const text = bankAdminText.platform;

function fakeCloud(): { upserts: { key: string; value: unknown }[] } {
  const state = { upserts: [] as { key: string; value: unknown }[] };
  const settings: Record<string, unknown> = {
    bank_limits: { perMinute: 120 },
    bank_sync: { enabled: false },
    physician_pay: { perReviewMxn: null },
    bank_goal: { approvedToOpen: 300 },
  };
  holder.cloud = {
    from: () => {
      let key = '';
      const query = {
        select: () => query,
        eq: (_column: string, value: string) => {
          key = value;
          return query;
        },
        maybeSingle: () => Promise.resolve({ data: { value: settings[key] }, error: null }),
        upsert: (row: { key: string; value: unknown }) => {
          state.upserts.push({ key: row.key, value: row.value });
          return Promise.resolve({ error: null });
        },
      };
      return query;
    },
  };
  return state;
}

beforeEach(() => {
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: 'yo', email: 'yo@ejemplo.mx', role: 'admin', alias: null },
    },
  });
});
afterEach(() => {
  cleanup();
  holder.cloud = null;
  useCloud.setState({ state: { status: 'off' } });
});

describe('Ajustes del banco', () => {
  it('sin la nube explica que viven en el servidor', () => {
    useCloud.setState({ state: { status: 'off' } });
    render(<BankSettingsForm />);
    expect(screen.getByText(text.needsCloud)).toBeVisible();
    expect(screen.queryByRole('button', { name: text.save })).not.toBeInTheDocument();
  });

  it('guarda el freno con los de fábrica donde faltaban y la tarifa por revisión', async () => {
    const state = fakeCloud();
    const typing = userEvent.setup();
    render(<BankSettingsForm />);
    const perMinute = await screen.findByLabelText(text.fields.perMinute);
    expect(perMinute).toHaveValue(120);
    expect(screen.getByLabelText(text.fields.perHour)).toHaveValue(DEFAULT_BANK_LIMITS.perHour);
    await typing.type(screen.getByLabelText(text.fields.perReviewMxn), '45');
    await typing.click(screen.getByRole('button', { name: text.save }));
    expect(await screen.findByText(text.saved)).toBeVisible();
    expect(state.upserts).toEqual([
      { key: 'bank_limits', value: { ...DEFAULT_BANK_LIMITS, perMinute: 120 } },
      { key: 'physician_pay', value: { perReviewMxn: 45 } },
    ]);
  });

  it('no guarda una parte del banco fuera de rango', async () => {
    const state = fakeCloud();
    const typing = userEvent.setup();
    render(<BankSettingsForm />);
    const share = await screen.findByLabelText(text.fields.alertWeekShare);
    await typing.clear(share);
    await typing.type(share, '2');
    await typing.click(screen.getByRole('button', { name: text.save }));
    expect(await screen.findByText(text.invalid)).toBeVisible();
    await waitFor(() => {
      expect(state.upserts).toEqual([]);
    });
  });
});
