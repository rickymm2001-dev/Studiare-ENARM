import { describe, expect, it, vi } from 'vitest';
import { USERS_PAGE_SIZE, listCloudUsers, setCloudUserRole } from './adminUsers';

const row = (overrides: Record<string, unknown> = {}) => ({
  user_id: '3f9c1c2e-5b7a-4a52-9d1e-0a1b2c3d4e5f',
  alias: 'Ana',
  email: 'ana@ejemplo.mx',
  role: 'student',
  plan: 'free',
  created_at: '2026-10-01T10:00:00Z',
  total: 41,
  ...overrides,
});

const cloud = (reply: unknown) => {
  const rpc = vi.fn().mockImplementation(() => Promise.resolve(reply));
  return { cloud: { rpc } as never, rpc };
};

describe('listar las cuentas', () => {
  it('pide la página con el texto, el rol y el desplazamiento', async () => {
    const { cloud: client, rpc } = cloud({ data: [row()], error: null });
    const result = await listCloudUsers(client, { query: '  ana ', role: 'physician', page: 2 });
    expect(rpc).toHaveBeenCalledWith('admin_list_users', {
      p_query: 'ana',
      p_role: 'physician',
      p_limit: USERS_PAGE_SIZE,
      p_offset: 2 * USERS_PAGE_SIZE,
    });
    expect(result).toEqual({
      ok: true,
      total: 41,
      users: [
        {
          id: '3f9c1c2e-5b7a-4a52-9d1e-0a1b2c3d4e5f',
          alias: 'Ana',
          email: 'ana@ejemplo.mx',
          role: 'student',
          plan: 'free',
          createdAt: '2026-10-01T10:00:00Z',
        },
      ],
    });
  });

  it('sin texto ni rol manda nulos, y una página negativa vale cero', async () => {
    const { cloud: client, rpc } = cloud({ data: [], error: null });
    expect(await listCloudUsers(client, { query: '   ', role: null, page: -3 })).toEqual({
      ok: true,
      total: 0,
      users: [],
    });
    expect(rpc).toHaveBeenCalledWith('admin_list_users', {
      p_query: null,
      p_role: null,
      p_limit: USERS_PAGE_SIZE,
      p_offset: 0,
    });
  });

  it('el total llega como número aunque la base lo mande como texto, que es como llegan los bigint', async () => {
    const { cloud: client } = cloud({ data: [row({ total: '41' })], error: null });
    expect(await listCloudUsers(client, { query: '', role: null, page: 0 })).toMatchObject({
      total: 41,
    });
  });

  it('traduce por qué falló', async () => {
    const failing = (error: object) => cloud({ data: null, error }).cloud;
    expect(
      await listCloudUsers(failing({ code: '42501', message: 'Solo un administrador' }), {
        query: '',
        role: null,
        page: 0,
      }),
    ).toEqual({ ok: false, reason: 'not_admin' });
    expect(
      await listCloudUsers(failing({ code: '28000', message: 'Sin sesión' }), {
        query: '',
        role: null,
        page: 0,
      }),
    ).toEqual({ ok: false, reason: 'no_session' });
    expect(
      await listCloudUsers(failing({ message: 'Failed to fetch' }), {
        query: '',
        role: null,
        page: 0,
      }),
    ).toEqual({ ok: false, reason: 'network' });
    expect(
      await listCloudUsers(failing({ code: '42883', message: 'no existe la función' }), {
        query: '',
        role: null,
        page: 0,
      }),
    ).toEqual({ ok: false, reason: 'unknown' });
  });

  it('una respuesta con otra forma o una excepción no rompen la pantalla', async () => {
    expect(
      await listCloudUsers(cloud({ data: [{ alias: 'sin id' }], error: null }).cloud, {
        query: '',
        role: null,
        page: 0,
      }),
    ).toEqual({ ok: false, reason: 'unknown' });
    expect(
      await listCloudUsers(
        { rpc: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) } as never,
        { query: '', role: null, page: 0 },
      ),
    ).toEqual({ ok: false, reason: 'network' });
  });
});

describe('cambiar el rol', () => {
  it('llama a set_user_role con la cuenta y el rol nuevo', async () => {
    const { cloud: client, rpc } = cloud({ data: null, error: null });
    expect(await setCloudUserRole(client, 'abc', 'physician')).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('set_user_role', { target: 'abc', new_role: 'physician' });
  });

  it.each([
    ['Solo un administrador puede cambiar roles', 'not_admin'],
    ['Nadie cambia su propio rol', 'self'],
    ['El rol de dueño no se asigna desde la app', 'owner_not_assignable'],
    ['Nadie puede quitar al dueño', 'cannot_remove_owner'],
    ['Solo el dueño nombra o quita administradores', 'only_owner_manages_admins'],
  ])('traduce el rechazo "%s"', async (message, reason) => {
    const { cloud: client } = cloud({ data: null, error: { code: '42501', message } });
    expect(await setCloudUserRole(client, 'abc', 'admin')).toEqual({ ok: false, reason });
  });

  it('un rechazo que no se reconoce cuenta como falta de permiso, y los demás fallos se distinguen', async () => {
    expect(
      await setCloudUserRole(
        cloud({ data: null, error: { code: '42501', message: 'otra cosa' } }).cloud,
        'abc',
        'student',
      ),
    ).toEqual({ ok: false, reason: 'not_admin' });
    expect(
      await setCloudUserRole(
        cloud({ data: null, error: { code: '28000', message: 'x' } }).cloud,
        'abc',
        'student',
      ),
    ).toEqual({ ok: false, reason: 'no_session' });
    expect(
      await setCloudUserRole(
        cloud({ data: null, error: { code: 'XX000', message: 'x' } }).cloud,
        'abc',
        'student',
      ),
    ).toEqual({ ok: false, reason: 'unknown' });
    expect(
      await setCloudUserRole(
        cloud({ data: null, error: { message: 'Failed to fetch' } }).cloud,
        'abc',
        'student',
      ),
    ).toEqual({ ok: false, reason: 'network' });
    expect(
      await setCloudUserRole(
        { rpc: vi.fn().mockRejectedValue(new Error('red')) } as never,
        'abc',
        'student',
      ),
    ).toEqual({ ok: false, reason: 'network' });
  });
});
