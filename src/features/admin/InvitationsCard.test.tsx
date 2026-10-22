// @vitest-environment jsdom
// Invitaciones del registro y conteos de cómo nos conocieron en Usuarios (B9)
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n/es-MX';
import { surveyAdminTexts } from '@/i18n/survey';
import { appAddress } from './appAddress';
import { InvitationsCard } from './InvitationsCard';
import { SignupSourcesCard } from './SignupSourcesCard';

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const text = t.accounts.admin.invitations;
const invitation = surveyAdminTexts.invitation;

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

describe('el mensaje de invitación (B18, 4 del diseño)', () => {
  it('cada correo pendiente tiene Copiar mensaje de invitación y el que ya tiene cuenta no', async () => {
    const typing = userEvent.setup();
    fakeServer();
    render(<InvitationsCard />);
    const ana = (await screen.findByText('ana@x.mx')).closest('li') as HTMLElement;
    expect(within(ana).queryByRole('button', { name: /Copiar mensaje de invitación/ })).toBeNull();
    await typing.type(screen.getByLabelText(text.email), 'nuevo@x.mx');
    await typing.click(screen.getByRole('button', { name: text.invite }));
    const nuevo = (await screen.findByText('nuevo@x.mx')).closest('li') as HTMLElement;
    const copy = within(nuevo).getByRole('button', { name: invitation.copyLabel('nuevo@x.mx') });
    // El nombre accesible empieza con el texto visible, como pide la regla de etiqueta en el nombre
    expect(copy.textContent).toContain(invitation.copy);
    expect(copy.getAttribute('aria-label')).toContain(invitation.copy);
  });

  it('copia el mensaje con la dirección de la app, el correo exacto y los dos caminos de entrada', async () => {
    const typing = userEvent.setup();
    fakeServer();
    render(<InvitationsCard />);
    await typing.type(screen.getByLabelText(text.email), '  Nuevo@X.MX ');
    await typing.click(screen.getByRole('button', { name: text.invite }));
    await typing.click(
      await screen.findByRole('button', { name: invitation.copyLabel('nuevo@x.mx') }),
    );
    expect(await screen.findByText(invitation.copied('nuevo@x.mx'))).toBeVisible();
    const copied = await navigator.clipboard.readText();
    expect(copied).toBe(invitation.message(appAddress(), 'nuevo@x.mx'));
    expect(copied).toContain(appAddress());
    expect(copied).toContain('nuevo@x.mx');
    expect(copied).toMatch(/código/);
    expect(copied).toMatch(/Google/);
    expect(copied).toMatch(/un dispositivo a la vez/);
  });

  it('la dirección es la del dominio donde corre la app, con la carpeta si la hay', () => {
    expect(appAddress()).toBe(new URL(import.meta.env.BASE_URL, window.location.origin).href);
    expect(appAddress().startsWith(window.location.origin)).toBe(true);
  });

  it('avisa siempre que cada persona entre con el mismo correo que se invitó', async () => {
    fakeServer();
    render(<InvitationsCard />);
    expect(await screen.findByText(invitation.sameEmail)).toBeVisible();
    expect(invitation.sameEmail).toMatch(/mismo correo/);
    expect(invitation.sameEmail).toMatch(/Google/);
  });

  it('si el navegador no deja copiar lo dice y muestra el mensaje para copiarlo a mano', async () => {
    const typing = userEvent.setup();
    fakeServer();
    render(<InvitationsCard />);
    await screen.findByText('ana@x.mx');
    await typing.type(screen.getByLabelText(text.email), 'nuevo@x.mx');
    await typing.click(screen.getByRole('button', { name: text.invite }));
    const button = await screen.findByRole('button', { name: invitation.copyLabel('nuevo@x.mx') });
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('bloqueado'));
    await typing.click(button);
    expect(await screen.findByText(invitation.copyFailed)).toBeVisible();
    const manual = screen.getByRole('textbox', { name: invitation.copy });
    expect(manual).toHaveValue(invitation.message(appAddress(), 'nuevo@x.mx'));
    expect(manual).toHaveAttribute('readonly');
  });
});
