import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { Account } from '../schemas/people';
import { makeFakeCloud } from '../testing/fakeCloud';
import { EMPTY_DETAILS } from '../usecases/account';
import { readCloudAvatar, saveCloudAccount, toCloudAccount } from './account';
import { dataUrlToBlob, photoHash } from './avatars';

const AUTH_ID = '6f1c0f1e-6b4a-4d2a-9d55-6f2f3f6a1b10';
const PATH = `${AUTH_ID}/avatar.jpg`;
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const OTHER_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgAB';

function account(avatar: Account['avatar']): Account {
  return {
    userId: 'u1',
    email: 'rick@example.com',
    ...EMPTY_DETAILS,
    birthYear: 1998,
    avatar,
    updatedAt: '2026-10-12T00:00:00.000Z',
  };
}

// restoreMocks de vitest.config.ts restaura los spies antes de cada prueba, así que el de la consola
// se crea en cada una
let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('guardar la cuenta en la nube con su foto (B2)', () => {
  it('con foto la sube a la carpeta del alumno y en la fila queda solo la ruta y la huella', async () => {
    const fake = makeFakeCloud();
    expect(
      await saveCloudAccount(
        fake.cloud,
        AUTH_ID,
        account({ kind: 'photo', dataUrl: JPEG }),
        'Rick',
      ),
    ).toBe(true);
    expect(fake.storageCalls).toEqual([`upload:avatars/${PATH}`]);
    expect(fake.objects.get(`avatars/${PATH}`)?.size).toBe(10);
    const row = fake.accountUpdates[0];
    expect(row?.avatar).toEqual({ kind: 'photo', path: PATH, hash: photoHash(JPEG) });
    expect(row?.birth_year).toBe(1998);
    const sent = JSON.stringify(row);
    expect(sent).not.toContain('base64');
    expect(sent).not.toContain('rick@example.com');
    expect(warn).not.toHaveBeenCalled();
  });

  it('la misma foto no se vuelve a subir en cada sincronización', async () => {
    const fake = makeFakeCloud();
    const remote = { kind: 'photo' as const, path: PATH, hash: photoHash(JPEG) };
    await saveCloudAccount(
      fake.cloud,
      AUTH_ID,
      account({ kind: 'photo', dataUrl: JPEG }),
      'Rick',
      remote,
    );
    expect(fake.storageCalls).toEqual([]);
    expect(fake.accountUpdates[0]?.avatar).toEqual(remote);
  });

  it('una foto distinta reemplaza a la que había', async () => {
    const fake = makeFakeCloud();
    fake.objects.set(`avatars/${PATH}`, dataUrlToBlob(JPEG));
    const remote = { kind: 'photo' as const, path: PATH, hash: photoHash(JPEG) };
    await saveCloudAccount(
      fake.cloud,
      AUTH_ID,
      account({ kind: 'photo', dataUrl: OTHER_JPEG }),
      'Rick',
      remote,
    );
    expect(fake.storageCalls).toEqual([`upload:avatars/${PATH}`]);
    expect(fake.objects.get(`avatars/${PATH}`)?.size).toBe(12);
    expect(fake.accountUpdates[0]?.avatar).toEqual({
      kind: 'photo',
      path: PATH,
      hash: photoHash(OTHER_JPEG),
    });
  });

  it('con Storage caído la cuenta se guarda igual, con iniciales, y el motivo queda en consola', async () => {
    const fake = makeFakeCloud();
    fake.failStorage = 'error';
    expect(
      await saveCloudAccount(
        fake.cloud,
        AUTH_ID,
        account({ kind: 'photo', dataUrl: JPEG }),
        'Rick',
      ),
    ).toBe(true);
    expect(fake.accountUpdates[0]?.avatar).toEqual({ kind: 'initials' });
    expect(fake.accountUpdates[0]?.birth_year).toBe(1998);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('subir');
    expect(message).not.toContain('rick@example.com');
    expect(message).not.toContain(AUTH_ID);
  });

  it('si Storage lanza una excepción tampoco se bloquea nada', async () => {
    const fake = makeFakeCloud();
    fake.failStorage = 'throw';
    expect(
      await saveCloudAccount(
        fake.cloud,
        AUTH_ID,
        account({ kind: 'photo', dataUrl: JPEG }),
        'Rick',
      ),
    ).toBe(true);
    expect(fake.accountUpdates[0]?.avatar).toEqual({ kind: 'initials' });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('si Storage falla pero la nube ya tenía una foto, la conserva para reintentar después', async () => {
    const fake = makeFakeCloud();
    fake.failStorage = 'error';
    const remote = { kind: 'photo' as const, path: PATH, hash: photoHash(OTHER_JPEG) };
    await saveCloudAccount(
      fake.cloud,
      AUTH_ID,
      account({ kind: 'photo', dataUrl: JPEG }),
      'Rick',
      remote,
    );
    expect(fake.accountUpdates[0]?.avatar).toEqual(remote);
  });

  it('al pasar a iniciales quita la foto del bucket', async () => {
    const fake = makeFakeCloud();
    fake.objects.set(`avatars/${PATH}`, dataUrlToBlob(JPEG));
    const remote = { kind: 'photo' as const, path: PATH, hash: photoHash(JPEG) };
    await saveCloudAccount(fake.cloud, AUTH_ID, account({ kind: 'initials' }), 'Rick', remote);
    expect(fake.storageCalls).toEqual([`remove:avatars/${PATH}`]);
    expect(fake.objects.size).toBe(0);
    expect(fake.accountUpdates[0]?.avatar).toEqual({ kind: 'initials' });
  });

  it('si no se pudo quitar la foto, la fila la conserva para intentarlo después', async () => {
    const fake = makeFakeCloud();
    fake.failStorage = 'error';
    const remote = { kind: 'photo' as const, path: PATH, hash: photoHash(JPEG) };
    await saveCloudAccount(fake.cloud, AUTH_ID, account({ kind: 'initials' }), 'Rick', remote);
    expect(fake.accountUpdates[0]?.avatar).toEqual(remote);
    expect(String(warn.mock.calls[0]?.[0])).toContain('quitar');
  });

  it('sin foto ni nada que quitar, Storage ni se toca', async () => {
    const fake = makeFakeCloud();
    await saveCloudAccount(
      fake.cloud,
      AUTH_ID,
      account({ kind: 'generated', seed: 'studiare-2' }),
      'Rick',
    );
    expect(fake.storageCalls).toEqual([]);
    expect(fake.accountUpdates[0]?.avatar).toEqual({ kind: 'initials' });
  });

  it('la fila lleva los nombres de la tabla y nunca el correo', () => {
    const row = toCloudAccount(account({ kind: 'photo', dataUrl: JPEG }), { kind: 'initials' });
    expect(row.birth_year).toBe(1998);
    expect(row.avatar).toEqual({ kind: 'initials' });
    expect(JSON.stringify(row)).not.toContain('rick@example.com');
    expect(JSON.stringify(row)).not.toContain('base64');
  });
});

describe('leer lo que la nube guarda como foto', () => {
  it('devuelve el valor de la fila cuando se reconoce', async () => {
    const fake = makeFakeCloud();
    fake.remoteAccount = { avatar: { kind: 'photo', path: PATH, hash: photoHash(JPEG) } };
    expect(await readCloudAvatar(fake.cloud, AUTH_ID)).toEqual({
      kind: 'photo',
      path: PATH,
      hash: photoHash(JPEG),
    });
  });

  it('sin fila o con un valor extraño responde null', async () => {
    const fake = makeFakeCloud();
    expect(await readCloudAvatar(fake.cloud, AUTH_ID)).toBeNull();
    fake.remoteAccount = { avatar: { kind: 'photo', path: 'otra/avatar.jpg' } };
    expect(await readCloudAvatar(fake.cloud, AUTH_ID)).toBeNull();
  });
});
