import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { makeFakeCloud } from '../testing/fakeCloud';
import {
  AVATAR_PATH,
  AvatarStorageError,
  avatarPath,
  blobToDataUrl,
  dataUrlToBlob,
  downloadAvatar,
  parseRemoteAvatar,
  photoHash,
  planAvatarSync,
  pushAvatar,
  removeAvatar,
  sameAvatar,
  uploadAvatar,
  type LocalAvatar,
  type RemoteAvatarState,
} from './avatars';

const AUTH_ID = '6f1c0f1e-6b4a-4d2a-9d55-6f2f3f6a1b10';
const PATH = `${AUTH_ID}/avatar.jpg`;
// Los primeros 10 bytes de un JPEG con cabecera JFIF
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const OTHER_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgAB';
const EARLY = '2026-10-12T09:00:00.000Z';
const LATE = '2026-10-13T09:00:00.000Z';

// restoreMocks de vitest.config.ts restaura los spies antes de cada prueba, así que el de la consola
// se crea en cada una
let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('la foto como bytes y como dataUrl', () => {
  it('va y vuelve sin cambios', async () => {
    const blob = dataUrlToBlob(JPEG);
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBe(10);
    expect(await blobToDataUrl(blob)).toBe(JPEG);
  });

  it('solo acepta un JPEG en base64', () => {
    expect(() => dataUrlToBlob('data:image/png;base64,iVBORw0KGgo=')).toThrow();
  });

  it('la huella es corta, estable y distinta para fotos distintas', () => {
    expect(photoHash(JPEG)).toMatch(/^[0-9a-f]{8}$/);
    expect(photoHash(JPEG)).toBe(photoHash(JPEG));
    expect(photoHash(JPEG)).not.toBe(photoHash(`${JPEG}AA`));
  });
});

describe('lo que la fila remota dice de la foto', () => {
  it('acepta iniciales, la foto con su ruta y las filas viejas con avatar generado', () => {
    expect(parseRemoteAvatar({ kind: 'initials' })).toEqual({ kind: 'initials' });
    expect(parseRemoteAvatar({ kind: 'photo', path: PATH, hash: 'deadbeef' })).toEqual({
      kind: 'photo',
      path: PATH,
      hash: 'deadbeef',
    });
    expect(parseRemoteAvatar({ kind: 'generated', seed: 'studiare-1' })).toEqual({
      kind: 'generated',
    });
  });

  it('rechaza rutas fuera de la carpeta del alumno y valores que no se reconocen', () => {
    expect(parseRemoteAvatar({ kind: 'photo', path: 'otra/avatar.jpg' })).toBeNull();
    expect(parseRemoteAvatar({ kind: 'photo', path: `${AUTH_ID}/otra.jpg` })).toBeNull();
    expect(parseRemoteAvatar({ kind: 'photo', dataUrl: JPEG })).toBeNull();
    expect(parseRemoteAvatar(null)).toBeNull();
    expect(parseRemoteAvatar('initials')).toBeNull();
  });

  it('la ruta es la carpeta del alumno y un solo archivo', () => {
    expect(avatarPath(AUTH_ID)).toBe(PATH);
    expect(AVATAR_PATH.test(PATH)).toBe(true);
    expect(AVATAR_PATH.test(`${AUTH_ID}/../otro/avatar.jpg`)).toBe(false);
  });
});

describe('subir, bajar y quitar la foto en Storage', () => {
  it('sube el JPEG a la carpeta del alumno, reemplazando el anterior, y devuelve la ruta', async () => {
    const fake = makeFakeCloud();
    expect(await uploadAvatar(fake.cloud, AUTH_ID, JPEG)).toBe(PATH);
    expect(fake.storageCalls).toEqual([`upload:avatars/${PATH}`]);
    const stored = fake.objects.get(`avatars/${PATH}`);
    expect(stored?.size).toBe(10);
    expect(stored?.type).toBe('image/jpeg');
  });

  it('si Storage responde con error o se cae, subir falla y quien llama decide', async () => {
    const fake = makeFakeCloud();
    fake.failStorage = 'error';
    await expect(uploadAvatar(fake.cloud, AUTH_ID, JPEG)).rejects.toThrow('Failed to fetch');
    fake.failStorage = 'throw';
    await expect(uploadAvatar(fake.cloud, AUTH_ID, JPEG)).rejects.toThrow();
    expect(fake.objects.size).toBe(0);
  });

  it('distingue una falla de red de una respuesta de error del servidor', async () => {
    const fake = makeFakeCloud();
    const failure = async () => {
      try {
        await removeAvatar(fake.cloud, AUTH_ID);
      } catch (error) {
        return error;
      }
      return null;
    };
    fake.failStorage = 'error';
    expect(await failure()).toMatchObject({ name: 'AvatarStorageError', network: true });
    fake.failStorage = 'throw';
    expect(await failure()).toMatchObject({ name: 'AvatarStorageError', network: true });
    fake.failStorage = 'server';
    const server = await failure();
    expect(server).toBeInstanceOf(AvatarStorageError);
    expect(server).toMatchObject({ network: false, message: 'Internal Server Error' });
  });

  it('baja la foto como el dataUrl que guarda la cuenta', async () => {
    const fake = makeFakeCloud();
    fake.objects.set(`avatars/${PATH}`, dataUrlToBlob(JPEG));
    expect(await downloadAvatar(fake.cloud, PATH)).toBe(JPEG);
    expect(fake.storageCalls).toEqual([`download:avatars/${PATH}`]);
  });

  it('sin foto, con una ruta rara, con error o con un archivo enorme no baja nada', async () => {
    const fake = makeFakeCloud();
    expect(await downloadAvatar(fake.cloud, PATH)).toBeNull();
    expect(await downloadAvatar(fake.cloud, '../otra/avatar.jpg')).toBeNull();
    fake.objects.set(
      `avatars/${PATH}`,
      new Blob([new Uint8Array(310_000)], { type: 'image/jpeg' }),
    );
    expect(await downloadAvatar(fake.cloud, PATH)).toBeNull();
    fake.objects.set(`avatars/${PATH}`, dataUrlToBlob(JPEG));
    fake.failStorage = 'error';
    expect(await downloadAvatar(fake.cloud, PATH)).toBeNull();
  });

  it('quita la foto de la ruta fija del alumno, aunque ya no exista, y avisa si no pudo', async () => {
    const fake = makeFakeCloud();
    fake.objects.set(`avatars/${PATH}`, dataUrlToBlob(JPEG));
    await removeAvatar(fake.cloud, AUTH_ID);
    expect(fake.objects.size).toBe(0);
    // Repetirlo no falla
    await removeAvatar(fake.cloud, AUTH_ID);
    expect(fake.storageCalls).toEqual([`remove:avatars/${PATH}`, `remove:avatars/${PATH}`]);
    fake.failStorage = 'error';
    await expect(removeAvatar(fake.cloud, AUTH_ID)).rejects.toThrow();
  });
});

describe('quién manda con la foto entre dispositivos (B2)', () => {
  const photo = (dataUrl = JPEG) => ({ kind: 'photo' as const, dataUrl });
  const remotePhoto = (dataUrl = JPEG) => ({
    kind: 'photo' as const,
    path: PATH,
    hash: photoHash(dataUrl),
  });
  const local = (avatar: LocalAvatar['avatar'], changedAt: string | null = null): LocalAvatar => ({
    avatar,
    changedAt,
  });
  const remote = (
    avatar: RemoteAvatarState['avatar'],
    changedAt: string | null = null,
  ): RemoteAvatarState => ({ avatar, changedAt });
  const initials = { kind: 'initials' as const };

  it('gana la elección más reciente, sea foto o iniciales', () => {
    expect(planAvatarSync(local(initials, LATE), remote(remotePhoto(), EARLY))).toBe('push');
    expect(planAvatarSync(local(photo(), LATE), remote(initials, EARLY))).toBe('push');
    expect(planAvatarSync(local(initials, EARLY), remote(remotePhoto(), LATE))).toBe('pull');
    expect(planAvatarSync(local(photo(), EARLY), remote(initials, LATE))).toBe('pull');
  });

  it('una fecha conocida gana a una cuenta que nunca eligió', () => {
    // Un dispositivo nuevo, o uno con la cuenta de antes, toma la elección de la nube
    expect(planAvatarSync(local(initials), remote(remotePhoto(), EARLY))).toBe('pull');
    expect(planAvatarSync(local(photo()), remote(initials, EARLY))).toBe('pull');
    // La primera elección de este navegador sube aunque la nube tenga otra sin fecha
    expect(planAvatarSync(local(initials, EARLY), remote(remotePhoto()))).toBe('push');
    // Sin fila o sin poder entenderla, también
    expect(planAvatarSync(local(photo(), EARLY), remote(null))).toBe('push');
  });

  it('con la misma fecha y la misma elección no hace nada', () => {
    expect(planAvatarSync(local(photo(), LATE), remote(remotePhoto(), LATE))).toBe('none');
    expect(planAvatarSync(local(initials, LATE), remote(initials, LATE))).toBe('none');
    expect(planAvatarSync(local({ kind: 'generated', seed: 's' }), remote(initials))).toBe('none');
    // La fecha de la base puede venir con otro formato y es la misma
    expect(
      planAvatarSync(local(photo(), LATE), remote(remotePhoto(), '2026-10-13T09:00:00+00:00')),
    ).toBe('none');
  });

  it('con la misma fecha y otra foto repara la nube desde este dispositivo', () => {
    expect(planAvatarSync(local(photo(OTHER_JPEG), LATE), remote(remotePhoto(), LATE))).toBe(
      'push',
    );
  });

  it('sin fecha en ningún lado una foto gana a las iniciales y la de la nube a otra foto', () => {
    expect(planAvatarSync(local(initials), remote(remotePhoto()))).toBe('pull');
    expect(planAvatarSync(local(photo()), remote(initials))).toBe('push');
    expect(planAvatarSync(local(photo()), remote(null))).toBe('push');
    expect(planAvatarSync(local(photo(OTHER_JPEG)), remote(remotePhoto()))).toBe('pull');
    expect(planAvatarSync(local(initials), remote(null))).toBe('none');
  });

  it('una fila más reciente que no se reconoce no se copia a este navegador', () => {
    expect(planAvatarSync(local(photo(), EARLY), remote(null, LATE))).toBe('none');
  });

  it('compara la foto local con la de la nube por su huella', () => {
    expect(sameAvatar(photo(), remotePhoto())).toBe(true);
    expect(sameAvatar(photo(OTHER_JPEG), remotePhoto())).toBe(false);
    expect(sameAvatar(photo(), { kind: 'photo', path: PATH })).toBe(false);
    expect(sameAvatar(initials, { kind: 'generated' })).toBe(true);
    expect(sameAvatar(initials, remotePhoto())).toBe(false);
  });
});

describe('llevar la elección de este navegador a la nube (B2)', () => {
  it('sube una foto nueva y devuelve su ruta, su huella y la fecha local', async () => {
    const fake = makeFakeCloud();
    const columns = await pushAvatar(
      fake.cloud,
      AUTH_ID,
      { avatar: { kind: 'photo', dataUrl: JPEG }, changedAt: LATE },
      { kind: 'initials' },
    );
    expect(columns).toEqual({
      avatar: { kind: 'photo', path: PATH, hash: photoHash(JPEG) },
      avatar_changed_at: LATE,
    });
    expect(fake.storageCalls).toEqual([`upload:avatars/${PATH}`]);
    expect(fake.objects.get(`avatars/${PATH}`)?.size).toBe(10);
    expect(JSON.stringify(columns)).not.toContain('base64');
  });

  it('si la nube ya tiene la misma foto no la vuelve a subir, solo cambia la fecha', async () => {
    const fake = makeFakeCloud();
    const columns = await pushAvatar(
      fake.cloud,
      AUTH_ID,
      { avatar: { kind: 'photo', dataUrl: JPEG }, changedAt: LATE },
      { kind: 'photo', path: PATH, hash: photoHash(JPEG) },
    );
    expect(fake.storageCalls).toEqual([]);
    expect(columns?.avatar_changed_at).toBe(LATE);
  });

  it('con iniciales quita la foto de su ruta fija aunque la fila no diga que hay una', async () => {
    const fake = makeFakeCloud();
    // Una foto que quedó en el bucket aunque la fila ya dijera iniciales
    fake.objects.set(`avatars/${PATH}`, dataUrlToBlob(JPEG));
    const columns = await pushAvatar(
      fake.cloud,
      AUTH_ID,
      { avatar: { kind: 'initials' }, changedAt: LATE },
      { kind: 'initials' },
    );
    expect(columns).toEqual({ avatar: { kind: 'initials' }, avatar_changed_at: LATE });
    expect(fake.storageCalls).toEqual([`remove:avatars/${PATH}`]);
    expect(fake.objects.size).toBe(0);
  });

  it('si Storage falla no devuelve columnas, para no tocar la fila, y el motivo va a consola', async () => {
    const fake = makeFakeCloud();
    fake.failStorage = 'error';
    expect(
      await pushAvatar(
        fake.cloud,
        AUTH_ID,
        { avatar: { kind: 'photo', dataUrl: JPEG }, changedAt: LATE },
        null,
      ),
    ).toBeNull();
    fake.failStorage = 'throw';
    expect(
      await pushAvatar(
        fake.cloud,
        AUTH_ID,
        { avatar: { kind: 'initials' }, changedAt: LATE },
        null,
      ),
    ).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0]?.[0])).toContain('subir');
    expect(String(warn.mock.calls[1]?.[0])).toContain('quitar');
    for (const [message] of warn.mock.calls) {
      expect(String(message)).not.toContain(AUTH_ID);
      expect(String(message)).not.toContain('@');
    }
  });
});
