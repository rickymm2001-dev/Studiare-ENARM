import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { makeFakeCloud, type FakeRpcReply } from '../testing/fakeCloud';
import { dataUrlToBlob, photoHash } from './avatars';
import { deleteCloudAccount, eraseCloudData, failureOf } from './privacy';

const AUTH_ID = '6f1c0f1e-6b4a-4d2a-9d55-6f2f3f6a1b10';
const OBJECT = `avatars/${AUTH_ID}/avatar.jpg`;
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

const cloud = (reply: unknown) =>
  ({ rpc: vi.fn().mockImplementation(() => Promise.resolve(reply)) }) as never;

/** La nube falsa con Storage en memoria y la respuesta que da delete_my_account */
function accountCloud(reply: FakeRpcReply = { error: null }) {
  const fake = makeFakeCloud();
  fake.rpcReplies.delete_my_account = reply;
  fake.remoteAccount = { avatar: { kind: 'initials' }, avatar_changed_at: null };
  return fake;
}

/** Una cuenta con foto, en la fila y en Storage */
function withPhoto(fake: ReturnType<typeof accountCloud>) {
  fake.remoteAccount = {
    avatar: { kind: 'photo', path: `${AUTH_ID}/avatar.jpg`, hash: photoHash(JPEG) },
    avatar_changed_at: '2026-10-13T10:00:00.000Z',
  };
  fake.objects.set(OBJECT, dataUrlToBlob(JPEG));
  return fake;
}

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('borrar la copia en la nube', () => {
  it('llama a la función del servidor que toca y devuelve ok', async () => {
    const data = cloud({ data: null, error: null });
    expect(await eraseCloudData(data)).toEqual({ ok: true });
    expect((data as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith('delete_my_data');
    const account = accountCloud();
    expect(await deleteCloudAccount(account.cloud, AUTH_ID)).toEqual({ ok: true });
    expect(account.rpcCalls).toEqual(['delete_my_account']);
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
        accountCloud({
          error: { code: '42501', message: 'El dueño no puede borrar su propia cuenta' },
        }).cloud,
        AUTH_ID,
      ),
    ).toEqual({ ok: false, reason: 'owner' });
    expect(
      await deleteCloudAccount(
        accountCloud({
          error: { code: 'FR002', message: 'Cancela tu suscripción antes de eliminar tu cuenta' },
        }).cloud,
        AUTH_ID,
      ),
    ).toEqual({ ok: false, reason: 'active_subscription' });
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
    expect(await deleteCloudAccount(accountCloud('throw').cloud, AUTH_ID)).toEqual({
      ok: false,
      reason: 'network',
    });
  });
});

describe('la foto de perfil al eliminar la cuenta (B2)', () => {
  it('quita la foto de Storage con la sesión del alumno antes de eliminar la cuenta', async () => {
    const fake = withPhoto(accountCloud());
    const order: string[] = [];
    const rpc = fake.cloud.rpc.bind(fake.cloud);
    vi.spyOn(fake.cloud, 'rpc').mockImplementation(((name: string) => {
      order.push(`rpc:${name}, foto en Storage ${String(fake.objects.has(OBJECT))}`);
      return rpc(name as never);
    }) as never);
    expect(await deleteCloudAccount(fake.cloud, AUTH_ID)).toEqual({ ok: true });
    expect(order).toEqual(['rpc:delete_my_account, foto en Storage false']);
    // Se quita de su ruta fija, sin preguntar a la fila
    expect(fake.storageCalls).toContain(`remove:${OBJECT}`);
    expect(fake.objects.size).toBe(0);
  });

  it('sin foto también elimina la cuenta, porque quitar lo que no existe no falla', async () => {
    const fake = accountCloud();
    expect(await deleteCloudAccount(fake.cloud, AUTH_ID)).toEqual({ ok: true });
    // Sin foto en la fila no hay nada que guardar para devolver, así que no se baja nada
    expect(fake.storageCalls).toEqual([`remove:${OBJECT}`]);
    expect(fake.rpcCalls).toEqual(['delete_my_account']);
  });

  it('quita también una foto que quedó en Storage aunque la fila diga iniciales', async () => {
    const fake = accountCloud();
    fake.objects.set(OBJECT, dataUrlToBlob(JPEG));
    expect(await deleteCloudAccount(fake.cloud, AUTH_ID)).toEqual({ ok: true });
    expect(fake.objects.size).toBe(0);
  });

  it('si Storage no pudo quitar la foto no elimina nada y dice por qué', async () => {
    const offline = withPhoto(accountCloud());
    offline.failStorage = 'error';
    offline.failStorageOnly = 'remove';
    expect(await deleteCloudAccount(offline.cloud, AUTH_ID)).toEqual({
      ok: false,
      reason: 'network',
    });
    expect(offline.rpcCalls).toEqual([]);
    expect(offline.objects.has(OBJECT)).toBe(true);

    const refused = accountCloud();
    refused.failStorage = 'server';
    refused.failStorageOnly = 'remove';
    expect(await deleteCloudAccount(refused.cloud, AUTH_ID)).toEqual({
      ok: false,
      reason: 'unknown',
    });
    expect(refused.rpcCalls).toEqual([]);

    const thrown = accountCloud();
    thrown.failStorage = 'throw';
    expect(await deleteCloudAccount(thrown.cloud, AUTH_ID)).toEqual({
      ok: false,
      reason: 'network',
    });
    expect(thrown.rpcCalls).toEqual([]);
  });

  it('si la base no deja eliminar la cuenta, la foto vuelve a su lugar', async () => {
    const fake = withPhoto(
      accountCloud({ error: { code: 'FR002', message: 'Cancela tu suscripción' } }),
    );
    expect(await deleteCloudAccount(fake.cloud, AUTH_ID)).toEqual({
      ok: false,
      reason: 'active_subscription',
    });
    expect(fake.storageCalls).toEqual([
      `download:${OBJECT}`,
      `remove:${OBJECT}`,
      `upload:${OBJECT}`,
    ]);
    expect(fake.objects.get(OBJECT)?.size).toBe(10);
  });

  it('un médico con revisiones registradas para pagos no se elimina solo y la foto vuelve (B11, 8.33)', async () => {
    expect(failureOf({ code: '23503', message: 'violates foreign key constraint' })).toBe(
      'physician_reviews',
    );
    const fake = withPhoto(
      accountCloud({ error: { code: '23503', message: 'review_decisions_physician_id_fkey' } }),
    );
    expect(await deleteCloudAccount(fake.cloud, AUTH_ID)).toEqual({
      ok: false,
      reason: 'physician_reviews',
    });
    expect(fake.objects.get(OBJECT)?.size).toBe(10);
  });

  it('si la foto no se pudo devolver, el motivo queda en consola y la pantalla dice el de la base', async () => {
    const fake = withPhoto(
      accountCloud({ error: { code: 'FR002', message: 'Cancela tu suscripción' } }),
    );
    fake.failStorage = 'error';
    fake.failStorageOnly = 'upload';
    expect(await deleteCloudAccount(fake.cloud, AUTH_ID)).toEqual({
      ok: false,
      reason: 'active_subscription',
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).not.toContain(AUTH_ID);
  });

  it('sin foto que devolver no sube nada si la base no deja eliminar la cuenta', async () => {
    const fake = accountCloud({ error: { code: '42501', message: 'El dueño no puede' } });
    await deleteCloudAccount(fake.cloud, AUTH_ID);
    expect(fake.storageCalls.filter((call) => call.startsWith('upload:'))).toEqual([]);
    // Ni si no se pudo leer la fila, porque no se sabe si la foto es la vigente
    const unread = withPhoto(
      accountCloud({ error: { code: '42501', message: 'El dueño no puede' } }),
    );
    unread.failAccountRead = 'error';
    await deleteCloudAccount(unread.cloud, AUTH_ID);
    expect(unread.storageCalls).toEqual([`remove:${OBJECT}`]);
  });
});
