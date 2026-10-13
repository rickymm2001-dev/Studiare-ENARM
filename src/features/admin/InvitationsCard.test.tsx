// @vitest-environment jsdom
// Invitaciones del registro y conteos de cómo nos conocieron en Usuarios (B9)
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n/es-MX';
import { InvitationsCard } from './InvitationsCard';
import { SignupSourcesCard } from './SignupSourcesCard';

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const text = t.accounts.admin.invitations;

/** Una nube con invitaciones en memoria y el interruptor del registro */
function fakeServer(options: { open?: boolean; insertError?: { code: string } } = {}) {
  const state = {
    open: options.open ?? false,
    invitations: [{ email: 'ana@x.mx', invited_at: '2026-10-13T09:00:00Z', registered: true }],
    calls: [] as unknown[][],
  };
  holder.cloud = {
    rpc: (name: string) => {
      state.calls.push(['rpc', name]);
      if (name === 'admin_list_invitations') {
        return Promise.resolve({ data: state.invitations, error: null });
      }
      if (name === 'admin_signup_source_counts') {
        return Promise.resolve({
          data: [
            { channel: 'instagram', total: 4 },
            { channel: 'friend', total: 1 },
          ],
          error: null,
        });
      }
      if (name === 'admin_influencer_code_counts') {
        return Promise.resolve({ data: [{ code: 'ANA_2026', total: 3 }], error: null });
      }
      return Promise.resolve({ data: null, error: { code: 'PGRST202' } });
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { value: state.open }, error: null }),
        }),
      }),
      upsert: (row: { value: boolean }) => {
        state.calls.push([table, 'upsert', row]);
        state.open = row.value;
        return Promise.resolve({ error: null });
      },
      insert: (row: { email: string }) => {
        state.calls.push([table, 'insert', row]);
        if (options.insertError) return Promise.resolve({ error: options.insertError });
        state.invitations = [
          { email: row.email, invited_at: '2026-10-13T10:00:00Z', registered: false },
          ...state.invitations,
        ];
        return Promise.resolve({ error: null });
      },
      delete: () => ({
        eq: (_column: string, email: string) => {
          state.calls.push([table, 'delete', email]);
          state.invitations = state.invitations.filter((item) => item.email !== email);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };
  return state;
}

afterEach(() => {
  cleanup();
  holder.cloud = null;
});

describe('invitaciones', () => {
  it('lista quién ya creó su cuenta, invita un correo limpio y quita una invitación', async () => {
    const typing = userEvent.setup();
    const server = fakeServer();
    render(<InvitationsCard />);
    const ana = (await screen.findByText('ana@x.mx')).closest('li') as HTMLElement;
    expect(within(ana).getByText(text.registered)).toBeVisible();
    expect(screen.getByText(text.registration.closed)).toBeVisible();

    await typing.type(screen.getByLabelText(text.email), '  Nuevo@X.MX ');
    await typing.click(screen.getByRole('button', { name: text.invite }));
    expect(await screen.findByText(text.invited('nuevo@x.mx'))).toBeVisible();
    expect(server.calls).toContainEqual(['signup_invitations', 'insert', { email: 'nuevo@x.mx' }]);
    const nuevo = (await screen.findByText('nuevo@x.mx')).closest('li') as HTMLElement;
    expect(within(nuevo).getByText(text.pending)).toBeVisible();

    await typing.click(within(nuevo).getByRole('button', { name: text.revokeLabel('nuevo@x.mx') }));
    expect(await screen.findByText(text.revoked('nuevo@x.mx'))).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByText('nuevo@x.mx')).toBeNull();
    });
  });

  it('un correo inválido o repetido lo dice sin llamar o con el rechazo de la base', async () => {
    const typing = userEvent.setup();
    const server = fakeServer({ insertError: { code: '23505' } });
    render(<InvitationsCard />);
    await screen.findByText('ana@x.mx');
    await typing.type(screen.getByLabelText(text.email), 'sin-arroba');
    await typing.click(screen.getByRole('button', { name: text.invite }));
    expect(await screen.findByText(text.errors.invalid)).toBeVisible();
    expect(server.calls.some((call) => call[1] === 'insert')).toBe(false);
    await typing.clear(screen.getByLabelText(text.email));
    await typing.type(screen.getByLabelText(text.email), 'ana@x.mx');
    await typing.click(screen.getByRole('button', { name: text.invite }));
    expect(await screen.findByText(text.errors.duplicate)).toBeVisible();
  });

  it('abrir el registro pide confirmarlo y cerrarlo no', async () => {
    const typing = userEvent.setup();
    const server = fakeServer();
    render(<InvitationsCard />);
    await typing.click(await screen.findByRole('button', { name: text.registration.openAction }));
    expect(server.calls.some((call) => call[1] === 'upsert')).toBe(false);
    await typing.click(screen.getByRole('button', { name: text.registration.confirm }));
    expect(await screen.findByText(text.registration.open)).toBeVisible();
    expect(server.calls).toContainEqual([
      'platform_settings',
      'upsert',
      expect.objectContaining({ key: 'registration_open', value: true }),
    ]);
    await typing.click(screen.getByRole('button', { name: text.registration.closeAction }));
    expect(await screen.findByText(text.registration.closed)).toBeVisible();
  });
});

describe('cómo nos conocieron', () => {
  it('muestra solo conteos por canal y por código', async () => {
    fakeServer();
    render(<SignupSourcesCard />);
    const sources = t.accounts.admin.sources;
    const channels = await screen.findByRole('table', { name: sources.channelsTitle });
    expect(within(channels).getByRole('row', { name: /Instagram/ })).toHaveTextContent(
      sources.people(4),
    );
    expect(within(channels).getByRole('row', { name: /Un amigo/ })).toHaveTextContent(
      sources.people(1),
    );
    const codes = screen.getByRole('table', { name: sources.codesTitle });
    expect(within(codes).getByRole('row', { name: /ANA_2026/ })).toHaveTextContent(
      sources.people(3),
    );
  });
});
