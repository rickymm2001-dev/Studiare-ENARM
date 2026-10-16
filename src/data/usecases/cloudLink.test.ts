import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRole, readCloudSignup, toCloudAccount } from '../cloud/account';
import type { PendingSignup } from '../cloud/pendingSignup';
import { dataUrlToBlob, photoHash } from '../cloud/avatars';
import { readCloudConfig } from '../cloud/client';
import { jwtRole } from '../cloud/keyRole';
import type { EnarmDb } from '../db/database';
import { createDexieRepositories } from '../repos/dexie/createRepositories';
import type { Account } from '../schemas/people';
import { makeFakeCloud, type FakeCloud } from '../testing/fakeCloud';
import { freshDb } from '../testing/fixtures';
import { EMPTY_DETAILS, findAccountByEmail, registerAccount, updateAccount } from './account';
import {
  PLACEHOLDER_ALIAS,
  aliasFor,
  hasLocalSignup,
  linkCloudIdentity,
  pushLocalAccount,
  resolveCloudSignup,
} from './cloudLink';
import { acceptedNoticeVersion, currentConsents } from './profile';

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
    const cloud = toCloudAccount({
      avatar: {
        avatar: { kind: 'photo', path: `${identity.authId}/avatar.jpg`, hash: 'deadbeef' },
        avatar_changed_at: '2026-10-02T00:00:00.000Z',
      },
      details: { birth_year: 1998, details_changed_at: '2026-10-02T00:00:00.000Z' },
    });
    expect(cloud.birth_year).toBe(1998);
    expect(cloud.avatar).toEqual({
      kind: 'photo',
      path: `${identity.authId}/avatar.jpg`,
      hash: 'deadbeef',
    });
    expect(JSON.stringify(cloud)).not.toContain('rick@example.com');
    expect(JSON.stringify(cloud)).not.toContain('base64');
  });

  it('el alias sale de la nube y nunca del correo, que suele llevar el nombre real (B9)', () => {
    expect(aliasFor({ alias: 'Rick' })).toBe('Rick');
    expect(aliasFor({ alias: 'Alumno' })).toBe(PLACEHOLDER_ALIAS);
    expect(aliasFor({ alias: null })).toBe(PLACEHOLDER_ALIAS);
    expect(aliasFor({ alias: '  ' })).toBe(PLACEHOLDER_ALIAS);
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

  it('un perfil que nace sin formulario no acepta el aviso por la persona ni confirma su edad (B9)', async () => {
    const { api } = setup();
    const linked = await linkCloudIdentity(api, { ...identity, alias: 'Alumno' });
    expect((await api.repos.users.get(linked.userId))?.alias).toBe(PLACEHOLDER_ALIAS);
    // Sin ninguna decisión bajo ninguna versión del aviso, así el puente no registra una aceptación
    expect(await acceptedNoticeVersion(api, linked.userId)).toBeNull();
    expect(await api.repos.consents.list()).toEqual([]);
    expect((await findAccountByEmail(api, identity.email))?.adultConfirmedAt).toBeUndefined();
    expect(await hasLocalSignup(api, linked.userId)).toBe(false);
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
    // Tampoco los datos opcionales, porque no se sabe cuáles son los más recientes (H29)
    expect('birth_year' in row).toBe(false);
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

describe('los datos opcionales entre dispositivos (H29, B9)', () => {
  const EARLY = '2026-10-12T09:00:00.000Z';
  const LATE = '2026-10-13T09:00:00.000Z';
  type Api = ReturnType<typeof setup>['api'];

  /** La fila de la nube con datos que guardó otro dispositivo */
  const cloudWithDetails = (changedAt: string | null) => {
    const fake = makeFakeCloud();
    fake.remoteAccount = {
      avatar: { kind: 'initials' },
      avatar_changed_at: null,
      birth_year: 1996,
      sex: 'female',
      state: 'YUC',
      situation: 'graduated',
      attempt: 2,
      target_specialty: 'pediatrics',
      details_changed_at: changedAt,
    };
    return fake;
  };

  const localAccount = async (api: Api) => {
    const account = await findAccountByEmail(api, identity.email);
    if (!account) throw new Error('falta la cuenta');
    return account;
  };

  const sync = async (api: Api, fake: FakeCloud) => {
    const linked = await linkCloudIdentity(api, identity);
    expect(await pushLocalAccount(api, fake.cloud, identity.authId, linked.userId)).toBe(true);
    return linked;
  };

  it('un dispositivo nuevo no borra en la nube el año de nacimiento ni lo demás, y lo baja', async () => {
    for (const changedAt of [EARLY, null]) {
      const { api } = setup();
      const fake = cloudWithDetails(changedAt);
      await sync(api, fake);
      // Nada de los datos viaja de un dispositivo que nunca los guardó
      for (const row of fake.accountUpdates) {
        for (const column of [
          'birth_year',
          'sex',
          'state',
          'situation',
          'attempt',
          'target_specialty',
        ]) {
          expect(column in row, column).toBe(false);
        }
      }
      expect(fake.remoteAccount?.birth_year).toBe(1996);
      const account = await localAccount(api);
      expect(account).toMatchObject({
        birthYear: 1996,
        sex: 'female',
        state: 'YUC',
        situation: 'graduated',
        attempt: 2,
        targetSpecialty: 'pediatrics',
      });
      // Con fecha en la nube se copia la fecha. Sin fecha el dispositivo sigue sin ella
      expect(account.detailsChangedAt).toBe(changedAt ?? undefined);
    }
  });

  it('lo que el alumno guardó después en este dispositivo sube completo, incluso un dato que borró', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(LATE));
    const { api } = setup();
    const fake = cloudWithDetails(EARLY);
    const linked = await sync(api, fake);
    const account = await localAccount(api);
    vi.setSystemTime(new Date('2026-10-13T10:00:00.000Z'));
    await updateAccount(api, account, { birthYear: null, targetSpecialty: 'psychiatry' });
    await pushLocalAccount(api, fake.cloud, identity.authId, linked.userId);
    expect(fake.remoteAccount).toMatchObject({
      birth_year: null,
      target_specialty: 'psychiatry',
      sex: 'female',
      details_changed_at: '2026-10-13T10:00:00.000Z',
    });
  });

  it('guardar sin cambiar nada no mueve la fecha y no pisa lo más reciente de otro dispositivo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(EARLY));
    const { api } = setup();
    const created = await registerAccount(api, {
      alias: 'Rick',
      email: identity.email,
      dailyGoal: { metric: 'cards', value: 20 },
      details: EMPTY_DETAILS,
    });
    if (!created.ok) throw new Error('no se creó');
    // La fecha solo la pone Tus datos
    const before = await updateAccount(api, await localAccount(api), { birthYear: 1990 });
    expect(before.detailsChangedAt).toBe(EARLY);
    vi.setSystemTime(new Date(LATE));
    // Solo cambia la foto. Los datos y su fecha se quedan
    const after = await updateAccount(api, before, {
      birthYear: 1990,
      avatar: { kind: 'initials' },
    });
    expect(after.detailsChangedAt).toBe(EARLY);
    // Otro dispositivo guardó después y su versión gana aquí
    const fake = cloudWithDetails(LATE);
    await sync(api, fake);
    expect((await localAccount(api)).birthYear).toBe(1996);
    expect(fake.accountUpdates.every((row) => !('birth_year' in row))).toBe(true);
  });

  it('una cuenta de antes sin fechas junta los datos campo por campo y en un choque gana la nube', async () => {
    const { api } = setup();
    const created = await registerAccount(api, {
      alias: 'Rick',
      email: identity.email,
      dailyGoal: { metric: 'cards', value: 20 },
      details: EMPTY_DETAILS,
    });
    if (!created.ok) throw new Error('no se creó');
    // Datos guardados antes de B9, sin fecha
    await api.repos.accounts.put({
      ...(await localAccount(api)),
      sex: 'male',
      attempt: 3,
    });
    const fake = makeFakeCloud();
    fake.remoteAccount = {
      sex: 'female',
      attempt: null,
      birth_year: 1996,
      details_changed_at: null,
    };
    await sync(api, fake);
    const account = await localAccount(api);
    expect(account).toMatchObject({ sex: 'female', attempt: 3, birthYear: 1996 });
    expect(fake.remoteAccount).toMatchObject({ sex: 'female', attempt: 3, birth_year: 1996 });
    // Solo sube lo que la nube no tenía
    const last = fake.accountUpdates.at(-1) ?? {};
    expect(Object.keys(last).sort()).toEqual(['attempt', 'updated_at']);
    expect(last.attempt).toBe(3);
  });

  it('registrarse en un dispositivo nuevo con una cuenta que ya existe no borra los datos de la nube', async () => {
    const DETAIL_COLUMNS = [
      'birth_year',
      'sex',
      'state',
      'situation',
      'attempt',
      'target_specialty',
    ] as const;
    /** Crear cuenta en este dispositivo, con solo la especialidad */
    const signUpWithSpecialty = async (api: Api) => {
      const created = await registerAccount(api, {
        alias: 'Rick',
        email: identity.email,
        dailyGoal: { metric: 'cards', value: 20 },
        details: { ...EMPTY_DETAILS, targetSpecialty: 'psychiatry' },
      });
      if (!created.ok) throw new Error('no se creó');
      const account = await localAccount(api);
      // Lo del registro no lleva fecha. Queda marcado para entrar campo por campo
      expect(account.detailsChangedAt).toBeUndefined();
      expect(account.detailsFromSignup).toBe(true);
    };

    for (const changedAt of [EARLY, null]) {
      // La nube ya tiene datos de otro dispositivo, sin especialidad. La del registro llena el hueco
      const { api } = setup();
      await signUpWithSpecialty(api);
      const fake = cloudWithDetails(changedAt);
      fake.remoteAccount = { ...fake.remoteAccount, target_specialty: null };
      await sync(api, fake);
      for (const row of fake.accountUpdates) {
        for (const column of DETAIL_COLUMNS) {
          if (column !== 'target_specialty') expect(column in row, column).toBe(false);
        }
        // Nunca viaja un vacío ni una fecha nueva desde lo del registro
        expect(Object.values(row)).not.toContain(null);
        expect('details_changed_at' in row).toBe(false);
      }
      expect(fake.remoteAccount).toMatchObject({
        birth_year: 1996,
        sex: 'female',
        state: 'YUC',
        situation: 'graduated',
        attempt: 2,
        target_specialty: 'psychiatry',
        details_changed_at: changedAt,
      });
      const account = await localAccount(api);
      expect(account).toMatchObject({
        birthYear: 1996,
        sex: 'female',
        state: 'YUC',
        situation: 'graduated',
        attempt: 2,
        targetSpecialty: 'psychiatry',
      });
      // Ya se juntó. Toma la fecha de la nube si la había y pierde la marca del registro
      expect(account.detailsChangedAt).toBe(changedAt ?? undefined);
      expect(account.detailsFromSignup).toBeUndefined();
    }

    for (const changedAt of [EARLY, null]) {
      // Si la nube ya tiene otra especialidad, gana la nube y nada de los datos sube
      const { api } = setup();
      await signUpWithSpecialty(api);
      const fake = cloudWithDetails(changedAt);
      await sync(api, fake);
      for (const row of fake.accountUpdates) {
        for (const column of DETAIL_COLUMNS) expect(column in row, column).toBe(false);
      }
      expect(fake.remoteAccount?.target_specialty).toBe('pediatrics');
      expect(fake.remoteAccount?.birth_year).toBe(1996);
      expect((await localAccount(api)).targetSpecialty).toBe('pediatrics');
    }
  });

  it('lo que guarda Tus datos después del registro lleva fecha y vuelve a ganar completo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(LATE));
    const { api } = setup();
    const created = await registerAccount(api, {
      alias: 'Rick',
      email: identity.email,
      dailyGoal: { metric: 'cards', value: 20 },
      details: { ...EMPTY_DETAILS, targetSpecialty: 'psychiatry' },
    });
    if (!created.ok) throw new Error('no se creó');
    const saved = await updateAccount(api, await localAccount(api), { birthYear: 1999 });
    expect(saved.detailsChangedAt).toBe(LATE);
    expect(saved.detailsFromSignup).toBeUndefined();
    const fake = cloudWithDetails(EARLY);
    await sync(api, fake);
    expect(fake.remoteAccount).toMatchObject({
      birth_year: 1999,
      target_specialty: 'psychiatry',
      sex: null,
      details_changed_at: LATE,
    });
  });
});

describe('el registro con Google y lo que pide el registro (B9)', () => {
  const pending: PendingSignup = {
    alias: 'Ricky',
    dailyGoal: { metric: 'questions', value: 15 },
    details: { ...EMPTY_DETAILS, targetSpecialty: 'pediatrics' },
    adultConfirmedAt: '2026-10-13T09:00:00.000Z',
    heardFrom: { channel: 'influencer', influencerCode: 'ANA_2026' },
    consents: { party: true },
    savedAt: '2026-10-13T09:00:00.000Z',
  };
  const google = { ...identity, alias: 'Alumno', provider: 'google' };

  it('el perfil nuevo nace con lo que llenó antes de ir a Google', async () => {
    const { api } = setup();
    const linked = await linkCloudIdentity(api, google, pending);
    expect(linked.created).toBe(true);
    const user = await api.repos.users.get(linked.userId);
    expect(user?.alias).toBe('Ricky');
    expect(user?.settings.dailyGoal).toEqual({ metric: 'questions', value: 15 });
    const account = await findAccountByEmail(api, identity.email);
    expect(account).toMatchObject({
      targetSpecialty: 'pediatrics',
      adultConfirmedAt: '2026-10-13T09:00:00.000Z',
      heardFrom: { channel: 'influencer', influencerCode: 'ANA_2026' },
    });
    // Solo el permiso que marcó se prende. Los demás siguen apagados (4.27)
    expect(await currentConsents(api, linked.userId)).toEqual({
      party: true,
      ai_analysis: false,
      anonymized_improvement: false,
    });
    // Si el perfil ya existía, lo pendiente no lo cambia
    const again = await linkCloudIdentity(api, google, { ...pending, alias: 'Otro' });
    expect(again).toEqual({ userId: linked.userId, created: false });
    expect((await api.repos.users.get(linked.userId))?.alias).toBe('Ricky');
  });

  it('la confirmación de edad sube una vez y cómo nos conoció viaja a su función privada', async () => {
    const { api } = setup();
    const linked = await linkCloudIdentity(api, google, pending);
    const fake = makeFakeCloud();
    fake.remoteAccount = { adult_confirmed_at: null };
    fake.rpcReplies.record_signup_source = { data: true, error: null };
    await pushLocalAccount(api, fake.cloud, identity.authId, linked.userId);
    expect(fake.accountUpdates.at(-1)?.adult_confirmed_at).toBe('2026-10-13T09:00:00.000Z');
    expect(fake.rpcCalls.filter((name) => name === 'record_signup_source')).toHaveLength(1);
    const account = await findAccountByEmail(api, identity.email);
    expect(account?.heardFrom?.recordedAt).toBeDefined();
    // La siguiente sincronización ya no la manda ni vuelve a subir la confirmación
    await pushLocalAccount(api, fake.cloud, identity.authId, linked.userId);
    expect(fake.rpcCalls.filter((name) => name === 'record_signup_source')).toHaveLength(1);
    expect('adult_confirmed_at' in (fake.accountUpdates.at(-1) ?? {})).toBe(false);
  });

  it('si la respuesta no llegó a la nube se vuelve a intentar después', async () => {
    const { api } = setup();
    const linked = await linkCloudIdentity(api, google, pending);
    const fake = makeFakeCloud();
    fake.rpcReplies.record_signup_source = { error: { code: 'PGRST202', message: 'no existe' } };
    await pushLocalAccount(api, fake.cloud, identity.authId, linked.userId);
    expect((await findAccountByEmail(api, identity.email))?.heardFrom?.recordedAt).toBeUndefined();
    fake.rpcReplies.record_signup_source = { data: false, error: null };
    await pushLocalAccount(api, fake.cloud, identity.authId, linked.userId);
    expect((await findAccountByEmail(api, identity.email))?.heardFrom?.recordedAt).toBeDefined();
  });

  it('el registro del formulario cuenta como registro en este dispositivo', async () => {
    const { api } = setup();
    // Crear cuenta con el correo, con el aviso a la vista
    const created = await registerAccount(api, {
      alias: 'Rick',
      email: identity.email,
      dailyGoal: { metric: 'cards', value: 20 },
      details: EMPTY_DETAILS,
      signup: { adultConfirmedAt: '2026-10-13T09:00:00.000Z' },
    });
    if (!created.ok) throw new Error('no se creó');
    expect(await hasLocalSignup(api, created.user.id)).toBe(true);
    // Lo que llenó antes de ir a Google, en otro navegador
    const other = setup();
    const google = await linkCloudIdentity(other.api, { ...identity, provider: 'google' }, pending);
    expect(await hasLocalSignup(other.api, google.userId)).toBe(true);
  });
});

describe('Completa tu registro se decide por datos y no por proveedor (B9)', () => {
  const NOTICE = '2026-10-02';
  type Api = ReturnType<typeof setup>['api'];

  /** Un perfil que nació sin formulario, al entrar por primera vez con esa cuenta */
  const bornWithoutForm = async (api: Api, provider: 'email' | 'google') => {
    const linked = await linkCloudIdentity(api, { ...identity, alias: 'Alumno', provider });
    expect(linked.created).toBe(true);
    expect(await hasLocalSignup(api, linked.userId)).toBe(false);
    return linked.userId;
  };

  it('con el correo o con Google, una cuenta sin registro en la nube debe completarlo', async () => {
    for (const provider of ['email', 'google'] as const) {
      const { api } = setup();
      const userId = await bornWithoutForm(api, provider);
      const fake = makeFakeCloud();
      fake.remoteAccount = { adult_confirmed_at: null };
      expect(await resolveCloudSignup(api, fake.cloud, identity.authId, userId)).toBe('required');
      // Nada se copia ni se acepta por la persona
      expect(await acceptedNoticeVersion(api, userId)).toBeNull();
      expect(await hasLocalSignup(api, userId)).toBe(false);
      // Sin fila en la nube tampoco
      fake.remoteAccount = null;
      expect(await resolveCloudSignup(api, fake.cloud, identity.authId, userId)).toBe('required');
    }
  });

  it('si la nube no se puede leer no deja pasar', async () => {
    const { api } = setup();
    const userId = await bornWithoutForm(api, 'email');
    const fake = makeFakeCloud();
    fake.failAccountRead = 'error';
    expect(await resolveCloudSignup(api, fake.cloud, identity.authId, userId)).toBe('unknown');
    fake.failAccountRead = 'throw';
    expect(await resolveCloudSignup(api, fake.cloud, identity.authId, userId)).toBe('unknown');
    fake.failAccountRead = 'none';
    fake.failAcceptanceRead = 'error';
    expect(await resolveCloudSignup(api, fake.cloud, identity.authId, userId)).toBe('unknown');
    expect(await hasLocalSignup(api, userId)).toBe(false);
  });

  it('si la nube tarda demasiado tampoco deja pasar', async () => {
    const { api } = setup();
    const userId = await bornWithoutForm(api, 'google');
    const hanging = {
      from: () => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => new Promise(() => undefined),
          maybeSingle: () => new Promise(() => undefined),
        };
        return chain;
      },
    } as unknown as FakeCloud['cloud'];
    const started = Date.now();
    expect(await readCloudSignup(hanging, identity.authId, 30)).toEqual({ status: 'failed' });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(await hasLocalSignup(api, userId)).toBe(false);
  });

  it('si otro dispositivo ya completó el registro, copia la edad y el aviso aceptado y no lo pide', async () => {
    const { api } = setup();
    const userId = await bornWithoutForm(api, 'email');
    const fake = makeFakeCloud();
    fake.remoteAccount = { adult_confirmed_at: '2026-10-12T09:00:00.000Z' };
    fake.acceptances = ['2026-09-01', NOTICE];
    expect(await resolveCloudSignup(api, fake.cloud, identity.authId, userId)).toBe('complete');
    expect((await findAccountByEmail(api, identity.email))?.adultConfirmedAt).toBe(
      '2026-10-12T09:00:00.000Z',
    );
    // Cada finalidad apagada bajo la versión que la cuenta aceptó, la más reciente
    expect(await acceptedNoticeVersion(api, userId)).toBe(NOTICE);
    expect(await currentConsents(api, userId)).toEqual({
      party: false,
      ai_analysis: false,
      anonymized_improvement: false,
    });
    // No son decisiones del alumno, así que no dejan evento. Si lo dejaran, valdrían más que lo que ya
    // decidió en otro dispositivo y lo apagarían en todos (B14, 2.2)
    expect(await api.repos.events.query({ userId })).toEqual([]);
    expect(await hasLocalSignup(api, userId)).toBe(true);
  });

  it('una cuenta de antes de B9, con el aviso aceptado y sin la edad, no cambia', async () => {
    const { api } = setup();
    const userId = await bornWithoutForm(api, 'email');
    const fake = makeFakeCloud();
    fake.remoteAccount = { adult_confirmed_at: null };
    fake.acceptances = [NOTICE];
    expect(await resolveCloudSignup(api, fake.cloud, identity.authId, userId)).toBe('complete');
    expect((await findAccountByEmail(api, identity.email))?.adultConfirmedAt).toBeUndefined();
    expect(await acceptedNoticeVersion(api, userId)).toBe(NOTICE);
    expect(await hasLocalSignup(api, userId)).toBe(true);
  });
});
