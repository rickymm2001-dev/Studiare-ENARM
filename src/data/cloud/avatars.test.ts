import { describe, expect, it } from 'vitest';
import { makeFakeCloud } from '../testing/fakeCloud';
import {
  AVATAR_PATH,
  avatarPath,
  blobToDataUrl,
  dataUrlToBlob,
  downloadAvatar,
  parseRemoteAvatar,
  photoHash,
  removeAvatar,
  uploadAvatar,
} from './avatars';

const AUTH_ID = '6f1c0f1e-6b4a-4d2a-9d55-6f2f3f6a1b10';
const PATH = `${AUTH_ID}/avatar.jpg`;
// Los primeros 10 bytes de un JPEG con cabecera JFIF
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

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

  it('quita la foto del bucket y avisa si no pudo', async () => {
    const fake = makeFakeCloud();
    fake.objects.set(`avatars/${PATH}`, dataUrlToBlob(JPEG));
    await removeAvatar(fake.cloud, PATH);
    expect(fake.objects.size).toBe(0);
    expect(fake.storageCalls).toEqual([`remove:avatars/${PATH}`]);
    fake.failStorage = 'error';
    await expect(removeAvatar(fake.cloud, PATH)).rejects.toThrow();
  });
});
