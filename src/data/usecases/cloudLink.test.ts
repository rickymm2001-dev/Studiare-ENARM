import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRole, toCloudAccount } from '../cloud/account';
import { dataUrlToBlob, photoHash } from '../cloud/avatars';
import { readCloudConfig } from '../cloud/client';
import { jwtRole } from '../cloud/keyRole';
import type { EnarmDb } from '../db/database';
import { createDexieRepositories } from '../repos/dexie/createRepositories';
import type { Account } from '../schemas/people';
import { makeFakeCloud, type FakeCloud } from '../testing/fakeCloud';
import { freshDb } from '../testing/fixtures';
import { EMPTY_DETAILS, findAccountByEmail, registerAccount, updateAccount } from './account';
import { aliasFor, linkCloudIdentity, pushLocalAccount } from './cloudLink';

const openDbs: EnarmDb[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(openDbs.splice(0).map((db) => db.delete()));
});

function setup() {
  const db = freshDb('real');
  openDbs.push(db);
  const repos = createDexieRepositories(db);
  const api = {
    repos,
    recordEvent: (event: Parameters<typeof repos.events.append>[0]) => repos.events.append(event),
  };
  return { api };
}

const identity = {
  authId: '6f1c0f1e-6b4a-4d2a-9d55-6f2f3f6a1b10',
  email: 'rick@example.com',
  role: 'student' as const,
  alias: 'Rick',
};

describe('configuración de la nube (D-075)', () => {
  const url = 'https://bkjbcdwglyllizupokqm.supabase.co';
  it('acepta la URL del proyecto y la llave pública', () => {
    expect(
      readCloudConfig({
        VITE_SUPABASE_URL: url,
        VITE_SUPABASE_ANON_KEY: 'sb_publishable_abcdefghijklmnop',
      }),
    ).toEqual({ url, publicKey: 'sb_publishable_abcdefghijklmnop' });
  });

  it('sin variables, con URL extraña o con llave secreta no hay nube', () => {
    expect(readCloudConfig({})).toBeNull();
    expect(
      readCloudConfig({
        VITE_SUPABASE_URL: 'http://evil.test',
        VITE_SUPABASE_ANON_KEY: 'x'.repeat(30),
      }),
    ).toBeNull();
    expect(
      readCloudConfig({
        VITE_SUPABASE_URL: url,
        VITE_SUPABASE_ANON_KEY: 'sb_secret_abcdefghijklmnopqrst',
      }),
    ).toBeNull();
  });
});

describe('llaves de servicio en el navegador (D-075)', () => {
  const url = 'https://bkjbcdwglyllizupokqm.supabase.co';
  const base64url = (text: string) =>
    btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = (role: string) =>
    [
      base64url('{"alg":"HS256","typ":"JWT"}'),
      base64url(JSON.stringify({ iss: 'supabase', role })),
      'firma-de-prueba-0123456789',
    ].join('.');

  it('la llave pública anterior, un JWT con rol anon, sigue funcionando', () => {
    const publicKey = jwt('anon');
    expect(readCloudConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: publicKey })).toEqual({
      url,
      publicKey,
    });
  });

  it('la llave anterior de servicio, un JWT con rol service_role, no pasa', () => {
    for (const role of ['service_role', 'supabase_admin', 'authenticated']) {
      expect(
        readCloudConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: jwt(role) }),
      ).toBeNull();
    }
  });

  it('un texto que no es JWT o que no se puede leer no cambia lo que ya se aceptaba', () => {
    expect(jwtRole('sb_publishable_abcdefghijklmnop')).toBeNull();
    expect(jwtRole('a.b.c')).toBeNull();
    expect(jwtRole('')).toBeNull();
    expect(jwtRole(`${jwt('anon').split('.')[0]}.%%%.firma`)).toBeNull();
  });
});

describe('rol y datos que viajan a la nube', () => {
  it('un rol desconocido o ausente es alumno', () => {
    expect(parseRole('owner')).toBe('owner');
    expect(parseRole('superuser')).toBe('student');
    expect(parseRole(undefined)).toBe('student');
  });

  it('la foto va a Storage y en la fila solo queda su ruta, con los nombres de la tabla', () => {
    const cloud = toCloudAccount(
      {
        userId: 'u1',
        email: 'rick@example.com',
        ...EMPTY_DETAILS,
        birthYear: 1998,
        avatar: { kind: 'photo', dataUrl: 'data:image/jpeg;base64,AAAA' },
        updatedAt: '2026-10-02T00:00:00.000Z',
      },
      {
        avatar: { kind: 'photo', path: `${identity.authId}/avatar.jpg`, hash: 'deadbeef' },
        avatar_changed_at: '2026-10-02T00:00:00.000Z',
      },
    );
    expect(cloud.birth_year).toBe(1998);
    expect(cloud.avatar).toEqual({
      kind: 'photo',
      path: `${identity.authId}/avatar.jpg`,
      hash: 'deadbeef',
    });
    expect(JSON.stringify(cloud)).not.toContain('rick@example.com');
    expect(JSON.stringify(cloud)).not.toContain('base64');
  });

  it('el alias sale de la nube o del correo', () => {
    expect(aliasFor({ alias: 'Rick', email: 'a@b.com' })).toBe('Rick');
    expect(aliasFor({ alias: 'Alumno', email: 'ricardo.m@b.com' })).toBe('ricardo.m');
    expect(aliasFor({ alias: null, email: 'x@b.com' })).toBe('x');
  });
});

describe('unir la cuenta de la nube con el perfil local', () => {
  it('usa el perfil que ya existe con ese correo', async () => {
    const { api } = setup();
    const created = await registerAccount(api, {
      alias: 'Rick',
      email: 'Rick@Example.com',
      dailyGoal: { metric: 'cards', value: 20 },
      details: EMPTY_DETAILS,
    });
    if (!created.ok) throw new Error('no se creó');
    expect(await linkCloudIdentity(api, identity)).toEqual({
      userId: created.user.id,
      created: false,
    });
  });

  it('en un dispositivo nuevo crea el perfil con el alias de la nube', async () => {
    const { api } = setup();
    const linked = await linkCloudIdentity(api, identity);
    expect(linked.created).toBe(true);
    expect((await api.repos.users.get(linked.userId))?.alias).toBe('Rick');
    expect((await findAccountByEmail(api, 'rick@example.com'))?.userId).toBe(linked.userId);
    // La segunda vez no duplica
    expect(await linkCloudIdentity(api, identity)).toEqual({
      userId: linked.userId,
      created: false,
    });
  });
});

describe('la foto de perfil entre dispositivos (B2)', () => {
  const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const OTHER_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgAB';
  const PATH = `${identity.authId}/avatar.jpg`;
  const OBJECT = `avatars/${PATH}`;
  const EARLY = '2026-10-12T09:00:00.000Z';
  const LATE = '2026-10-13T09:00:00.000Z';
  type Api = ReturnType<typeof setup>['api'];

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  /** La nube con una foto subida desde otro dispositivo en la fecha dada */
  const cloudWithPhoto = (changedAt: string | null = EARLY, dataUrl = JPEG) => {
    const fake = makeFakeCloud();
    fake.remoteAccount = {
      avatar: { kind: 'photo', path: PATH, hash: photoHash(dataUrl) },
      avatar_changed_at: changedAt,
    };
    fake.objects.set(OBJECT, dataUrlToBlob(dataUrl));
    return fake;
  };

  /** Un perfil que ya existía en este navegador, con su foto y la fecha en que la eligió */
  const existingProfile = async (api: Api, avatar: Account['avatar'], changedAt?: string) => {
    const created = await registerAccount(api, {
      alias: 'Rick',
      email: identity.email,
      dailyGoal: { metric: 'cards', value: 20 },
      details: EMPTY_DETAILS,
    });
    if (!created.ok) throw new Error('no se creó');
    const account = await api.repos.accounts.get(created.user.id);
    if (!account) throw new Error('falta la cuenta');
    await api.repos.accounts.put({
      ...account,
      avatar,
      ...(changedAt ? { avatarChangedAt: changedAt } : {}),
    });
    return created.user.id;
  };

  const sync = async (api: Api, fake: FakeCloud) => {
    const linked = await linkCloudIdentity(api, identity);
    expect(await pushLocalAccount(api, fake.cloud, identity.authId, linked.userId)).toBe(true);
    return linked;
  };

  const localAccount = async (api: Api) => {
    const account = await findAccountByEmail(api, identity.email);
    if (!account) throw new Error('falta la cuenta');
    return account;
  };

  /** La última fila que se mandó a private_accounts */
  const lastRow = (fake: FakeCloud) => fake.accountUpdates.at(-1) ?? {};

  it('en un dispositivo nuevo baja la foto de la nube con su fecha y no la vuelve a subir', async () => {
    const { api } = setup();
    const fake = cloudWithPhoto();
    const linked = await sync(api, fake);
    expect(linked.created).toBe(true);
    const account = await localAccount(api);
    expect(account.avatar).toEqual({ kind: 'photo', dataUrl: JPEG });
    expect(account.avatarChangedAt).toBe(EARLY);
    expect(fake.storageCalls).toEqual([`download:${OBJECT}`]);
    // La fila conserva la foto y su fecha. Solo cambian los demás datos de la cuenta
    expect('avatar' in lastRow(fake)).toBe(false);
    expect(fake.remoteAccount?.avatar_changed_at).toBe(EARLY);
  });

  it('un dispositivo que ya tenía perfil con iniciales y nunca eligió baja la foto en lugar de borrarla', async () => {
    const { api } = setup();
    await existingProfile(api, { kind: 'initials' });
    const fake = cloudWithPhoto();
    const linked = await sync(api, fake);
    expect(linked.created).toBe(false);
    expect((await localAccount(api)).avatar).toEqual({ kind: 'photo', dataUrl: JPEG });
    expect(fake.storageCalls).toEqual([`download:${OBJECT}`]);
    expect(fake.objects.has(OBJECT)).toBe(true);
    expect(fake.remoteAccount?.avatar).toEqual({
      kind: 'photo',
      path: PATH,
      hash: photoHash(JPEG),
    });
  });

  it('si el alumno eligió iniciales aquí después de subir la foto en otro dispositivo, la quita de la nube', async () => {
    const { api } = setup();
    await existingProfile(api, { kind: 'initials' }, LATE);
    const fake = cloudWithPhoto(EARLY);
    await sync(api, fake);
    expect(fake.storageCalls).toEqual([`remove:${OBJECT}`]);
    expect(fake.objects.size).toBe(0);
    expect(lastRow(fake)).toMatchObject({
      avatar: { kind: 'initials' },
      avatar_changed_at: LATE,
    });
    expect((await localAccount(api)).avatar).toEqual({ kind: 'initials' });
  });

  it('un primer ingreso que se cortó antes de subir la cuenta no borra la foto en el siguiente', async () => {
    const { api } = setup();
    const fake = cloudWithPhoto();
    // El primer intento creó el perfil y se cortó, por ejemplo por el límite de dispositivos o la red
    expect((await linkCloudIdentity(api, identity)).created).toBe(true);
    // En el siguiente el perfil ya existe, y aun así baja la foto
    const again = await sync(api, fake);
    expect(again.created).toBe(false);
    expect((await localAccount(api)).avatar).toEqual({ kind: 'photo', dataUrl: JPEG });
    expect(fake.storageCalls).toEqual([`download:${OBJECT}`]);
    expect(fake.objects.has(OBJECT)).toBe(true);
  });

  it('si no se pudo leer la nube no toca la foto, ni la fila ni Storage', async () => {
    const { api } = setup();
    // Aunque este navegador tenga la elección más reciente
    await existingProfile(api, { kind: 'initials' }, LATE);
    const fake = cloudWithPhoto(EARLY);
    fake.failAccountRead = 'error';
    await sync(api, fake);
    expect(fake.storageCalls).toEqual([]);
    expect(fake.objects.has(OBJECT)).toBe(true);
    const row = lastRow(fake);
    expect('avatar' in row).toBe(false);
    expect('avatar_changed_at' in row).toBe(false);
    expect(row.birth_year).toBeNull();
    expect((await localAccount(api)).avatar).toEqual({ kind: 'initials' });
  });

  it('una foto quitada en otro dispositivo no vuelve cuando se activa uno con la copia vieja', async () => {
    for (const changedAt of [EARLY, undefined]) {
      const { api } = setup();
      // Este navegador tiene la foto, elegida antes o en una cuenta de antes sin fecha
      await existingProfile(api, { kind: 'photo', dataUrl: JPEG }, changedAt);
      const fake = makeFakeCloud();
      fake.remoteAccount = { avatar: { kind: 'initials' }, avatar_changed_at: LATE };
      await sync(api, fake);
      const account = await localAccount(api);
      expect(account.avatar).toEqual({ kind: 'initials' });
      expect(account.avatarChangedAt).toBe(LATE);
      expect(fake.storageCalls).toEqual([]);
      expect(fake.objects.size).toBe(0);
      expect(fake.remoteAccount.avatar).toEqual({ kind: 'initials' });
    }
  });

  it('la elección más reciente de este navegador sube, y la misma foto no se vuelve a subir', async () => {
    const same = setup();
    await existingProfile(same.api, { kind: 'photo', dataUrl: JPEG }, LATE);
    const sameCloud = cloudWithPhoto(EARLY, JPEG);
    await sync(same.api, sameCloud);
    expect(sameCloud.storageCalls).toEqual([]);
    expect(lastRow(sameCloud).avatar_changed_at).toBe(LATE);

    const other = setup();
    await existingProfile(other.api, { kind: 'photo', dataUrl: OTHER_JPEG }, LATE);
    const otherCloud = cloudWithPhoto(EARLY, JPEG);
    await sync(other.api, otherCloud);
    expect(otherCloud.storageCalls).toEqual([`upload:${OBJECT}`]);
    expect(otherCloud.objects.get(OBJECT)?.size).toBe(12);
    expect(lastRow(otherCloud)).toMatchObject({
      avatar: { kind: 'photo', path: PATH, hash: photoHash(OTHER_JPEG) },
      avatar_changed_at: LATE,
    });
  });

  it('si Storage falla al subir, la fila no cambia y se reintenta en la siguiente sincronización', async () => {
    const { api } = setup();
    await existingProfile(api, { kind: 'photo', dataUrl: JPEG }, LATE);
    const fake = makeFakeCloud();
    fake.remoteAccount = { avatar: { kind: 'initials' }, avatar_changed_at: EARLY };
    fake.failStorage = 'error';
    await sync(api, fake);
    expect('avatar' in lastRow(fake)).toBe(false);
    expect(fake.remoteAccount.avatar_changed_at).toBe(EARLY);

    fake.failStorage = 'none';
    await sync(api, fake);
    expect(fake.objects.has(OBJECT)).toBe(true);
    expect(lastRow(fake)).toMatchObject({ avatar_changed_at: LATE });
  });

  it('si la foto de la nube no se pudo bajar, este navegador no cambia ni toma la fecha', async () => {
    const { api } = setup();
    const fake = cloudWithPhoto();
    fake.failStorage = 'error';
    await sync(api, fake);
    const account = await localAccount(api);
    expect(account.avatar).toEqual({ kind: 'initials' });
    expect(account.avatarChangedAt).toBeUndefined();
    expect('avatar' in lastRow(fake)).toBe(false);

    fake.failStorage = 'none';
    await sync(api, fake);
    expect((await localAccount(api)).avatar).toEqual({ kind: 'photo', dataUrl: JPEG });
  });

  it('si el alumno guarda otra foto mientras baja la de la nube, gana la suya', async () => {
    const { api } = setup();
    const fake = cloudWithPhoto();
    const linked = await linkCloudIdentity(api, identity);
    const from = fake.cloud.storage.from.bind(fake.cloud.storage);
    vi.spyOn(fake.cloud.storage, 'from').mockImplementation((bucket: string) => {
      const files = from(bucket);
      const download = files.download.bind(files);
      files.download = (async (path: string) => {
        // El alumno guarda en Tus datos justo mientras se baja la foto
        const account = await api.repos.accounts.get(linked.userId);
        if (account) {
          await updateAccount(api, account, { avatar: { kind: 'photo', dataUrl: OTHER_JPEG } });
        }
        return download(path);
      }) as never;
      return files;
    });
    await pushLocalAccount(api, fake.cloud, identity.authId, linked.userId);
    expect((await localAccount(api)).avatar).toEqual({ kind: 'photo', dataUrl: OTHER_JPEG });
  });

  it('entre dos dispositivos gana siempre la última elección del alumno', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const fake = makeFakeCloud();
    // La fila que crea la base para toda cuenta nueva
    fake.remoteAccount = { avatar: { kind: 'initials' }, avatar_changed_at: null };
    const phone = setup();
    const laptop = setup();

    // En el teléfono elige una foto
    vi.setSystemTime(new Date('2026-10-13T08:00:00.000Z'));
    const phoneId = (await linkCloudIdentity(phone.api, identity)).userId;
    const phoneAccount = await localAccount(phone.api);
    await updateAccount(phone.api, phoneAccount, { avatar: { kind: 'photo', dataUrl: JPEG } });
    await pushLocalAccount(phone.api, fake.cloud, identity.authId, phoneId);
    expect(fake.objects.has(OBJECT)).toBe(true);

    // La computadora entra después y la baja
    vi.setSystemTime(new Date('2026-10-13T09:00:00.000Z'));
    await sync(laptop.api, fake);
    expect((await localAccount(laptop.api)).avatar).toEqual({ kind: 'photo', dataUrl: JPEG });

    // En la computadora pasa a iniciales
    vi.setSystemTime(new Date('2026-10-13T10:00:00.000Z'));
    await updateAccount(laptop.api, await localAccount(laptop.api), {
      avatar: { kind: 'initials' },
    });
    await sync(laptop.api, fake);
    expect(fake.objects.size).toBe(0);

    // El teléfono vuelve a ser el activo y la foto no regresa
    vi.setSystemTime(new Date('2026-10-13T11:00:00.000Z'));
    const uploadsBefore = fake.storageCalls.filter((call) => call.startsWith('upload:')).length;
    await pushLocalAccount(phone.api, fake.cloud, identity.authId, phoneId);
    expect((await localAccount(phone.api)).avatar).toEqual({ kind: 'initials' });
    expect(fake.storageCalls.filter((call) => call.startsWith('upload:'))).toHaveLength(
      uploadsBefore,
    );
    expect(fake.objects.size).toBe(0);
    expect(fake.remoteAccount.avatar).toEqual({ kind: 'initials' });
  });
});
