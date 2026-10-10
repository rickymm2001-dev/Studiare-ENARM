// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { DataProvider } from '@/data/DataProvider';
import type { Role } from '@/data/schemas/common';
import { t } from '@/i18n/es-MX';
import { CloudUsers } from './CloudUsers';

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const CALLER = '11111111-1111-4111-8111-111111111111';
const text = t.admin.cloud;

const row = (id: string, alias: string, role: Role, extra: Record<string, unknown> = {}) => ({
  user_id: id,
  alias,
  email: `${alias.toLowerCase()}@ejemplo.mx`,
  role,
  plan: 'free',
  created_at: '2026-10-01T10:00:00Z',
  total: 3,
  ...extra,
});

const ROWS = [
  row(CALLER, 'Yo', 'owner'),
  row('22222222-2222-4222-8222-222222222222', 'Beto', 'student', { plan: 'monthly' }),
  row('33333333-3333-4333-8333-333333333333', 'Carla', 'admin'),
];

function setup(
  callerRole: Role,
  options: { rows?: unknown[]; listError?: object; setError?: object } = {},
) {
  const calls: { name: string; args: unknown }[] = [];
  holder.cloud = {
    rpc: (name: string, args: unknown) => {
      calls.push({ name, args });
      if (name === 'admin_list_users') {
        return Promise.resolve(
          options.listError
            ? { data: null, error: options.listError }
            : { data: options.rows ?? ROWS, error: null },
        );
      }
      return Promise.resolve(
        options.setError ? { data: null, error: options.setError } : { data: null, error: null },
      );
    },
  };
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: CALLER, email: 'yo@ejemplo.mx', role: callerRole, alias: 'Yo' },
    },
  });
  render(
    <DataProvider kind="real">
      <MemoryRouter>
        <CloudUsers />
      </MemoryRouter>
    </DataProvider>,
  );
  return calls;
}

beforeEach(() => {
  holder.cloud = null;
});
afterEach(() => {
  cleanup();
  holder.cloud = null;
  useCloud.setState({ state: { status: 'off' } });
});

describe('usuarios con la cuenta de la nube', () => {
  it('lista las cuentas reales con su correo, su plan y su rol', async () => {
    setup('owner');
    expect(await screen.findByText('Beto')).toBeVisible();
    expect(screen.getByText('beto@ejemplo.mx')).toBeVisible();
    expect(screen.getByText(/Plan Mensual/)).toBeVisible();
    expect(screen.getByText(text.count(3))).toBeVisible();
    expect(screen.getByText(text.assignmentsNote)).toBeVisible();
  });

  it('el dueño ve su propia fila sin selector, porque nadie cambia su propio rol', async () => {
    setup('owner');
    const own = (await screen.findByText('Yo')).closest('li');
    expect(own).not.toBeNull();
    expect(within(own as HTMLElement).queryByRole('combobox')).toBeNull();
    expect(within(own as HTMLElement).getByText(t.roles.names.owner)).toBeVisible();
  });

  it('un admin no puede nombrar admins ni tocar a otro admin, pero sí a un alumno', async () => {
    setup('admin');
    const beto = (await screen.findByText('Beto')).closest('li') as HTMLElement;
    const select = within(beto).getByRole('combobox', { name: text.roleOf('Beto') });
    const options = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toEqual([t.roles.names.student, t.roles.names.physician]);
    const carla = screen.getByText('Carla').closest('li') as HTMLElement;
    expect(within(carla).queryByRole('combobox')).toBeNull();
  });

  it('el dueño sí puede nombrar admins', async () => {
    setup('owner');
    const beto = (await screen.findByText('Beto')).closest('li') as HTMLElement;
    const options = within(within(beto).getByRole('combobox'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toContain(t.roles.names.admin);
  });

  it('cambiar el rol llama a set_user_role y actualiza la fila', async () => {
    const typing = userEvent.setup();
    const calls = setup('owner');
    const beto = (await screen.findByText('Beto')).closest('li') as HTMLElement;
    await typing.selectOptions(within(beto).getByRole('combobox'), 'physician');
    expect(
      await screen.findByText(t.admin.roleChanged('Beto', t.roles.names.physician)),
    ).toBeVisible();
    expect(calls.at(-1)).toEqual({
      name: 'set_user_role',
      args: { target: '22222222-2222-4222-8222-222222222222', new_role: 'physician' },
    });
    expect(within(beto).getByRole('combobox')).toHaveValue('physician');
  });

  it('si el servidor rechaza el cambio lo dice y deja el rol como estaba', async () => {
    const typing = userEvent.setup();
    setup('owner', {
      setError: { code: '42501', message: 'Solo el dueño nombra o quita administradores' },
    });
    const beto = (await screen.findByText('Beto')).closest('li') as HTMLElement;
    await typing.selectOptions(within(beto).getByRole('combobox'), 'admin');
    expect(await screen.findByText(t.admin.denied.only_owner_manages_admins)).toBeVisible();
    expect(within(beto).getByRole('combobox')).toHaveValue('student');
  });

  it('busca por alias o correo y por rol, y vuelve a la primera página', async () => {
    const typing = userEvent.setup();
    const calls = setup('owner');
    await screen.findByText('Beto');
    await typing.type(screen.getByLabelText(text.search), 'beto');
    await typing.selectOptions(screen.getByLabelText(text.roleFilter), 'physician');
    await typing.click(screen.getByRole('button', { name: text.searchAction }));
    await waitFor(() => {
      expect(calls.at(-1)).toEqual({
        name: 'admin_list_users',
        args: { p_query: 'beto', p_role: 'physician', p_limit: 25, p_offset: 0 },
      });
    });
  });

  it('con más cuentas que una página ofrece Siguiente y Anterior', async () => {
    const typing = userEvent.setup();
    const calls = setup('owner', { rows: ROWS.map((item) => ({ ...item, total: 60 })) });
    await screen.findByText('Beto');
    expect(screen.getByText(text.pageOf(1, 3))).toBeVisible();
    expect(screen.getByRole('button', { name: text.previous })).toBeDisabled();
    await typing.click(screen.getByRole('button', { name: text.next }));
    await waitFor(() => {
      expect(calls.at(-1)?.args).toMatchObject({ p_offset: 25 });
    });
    expect(await screen.findByText(text.pageOf(2, 3))).toBeVisible();
  });

  it('sin resultados lo dice', async () => {
    setup('owner', { rows: [] });
    expect(await screen.findByText(text.empty)).toBeVisible();
  });

  it('si el servidor no deja ver las cuentas explica por qué', async () => {
    setup('admin', { listError: { code: '42501', message: 'Solo un administrador' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(text.errors.not_admin);
  });

  it('si falta la migración dice qué puede ser', async () => {
    setup('owner', { listError: { code: '42883', message: 'no existe la función' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(text.errors.unknown);
  });
});
