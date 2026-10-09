import { describe, expect, it, vi } from 'vitest';
import { deleteCloudAccount, eraseCloudData, failureOf } from './privacy';

const cloud = (reply: unknown) =>
  ({ rpc: vi.fn().mockImplementation(() => Promise.resolve(reply)) }) as never;

describe('borrar la copia en la nube', () => {
  it('llama a la función del servidor que toca y devuelve ok', async () => {
    const data = cloud({ data: null, error: null });
    expect(await eraseCloudData(data)).toEqual({ ok: true });
    expect((data as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith('delete_my_data');
    const account = cloud({ data: null, error: null });
    expect(await deleteCloudAccount(account)).toEqual({ ok: true });
    expect((account as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      'delete_my_account',
    );
  });

  it('traduce el motivo del servidor', async () => {
    expect(
      await eraseCloudData(
        cloud({
          error: { code: '42501', message: 'Este dispositivo no es el activo de la cuenta' },
        }),
      ),
    ).toEqual({ ok: false, reason: 'not_active_device' });
    expect(
      await deleteCloudAccount(
        cloud({ error: { code: '42501', message: 'El dueño no puede borrar su propia cuenta' } }),
      ),
    ).toEqual({ ok: false, reason: 'owner' });
    expect(
      await eraseCloudData(cloud({ error: { code: '28000', message: 'Sin sesión' } })),
    ).toEqual({
      ok: false,
      reason: 'no_session',
    });
    expect(await eraseCloudData(cloud({ error: { code: 'XX000', message: 'raro' } }))).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it('sin respuesta del servidor es un problema de red y no tira la pantalla', async () => {
    expect(failureOf({ message: 'Failed to fetch' })).toBe('network');
    const broken = { rpc: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) } as never;
    expect(await deleteCloudAccount(broken)).toEqual({ ok: false, reason: 'network' });
  });
});
