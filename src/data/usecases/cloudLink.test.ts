import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { parseRole, toCloudAccount } from '../cloud/account';
import { dataUrlToBlob, photoHash } from '../cloud/avatars';
import { readCloudConfig } from '../cloud/client';
import { jwtRole } from '../cloud/keyRole';
import type { EnarmDb } from '../db/database';
import { createDexieRepositories } from '../repos/dexie/createRepositories';
import { makeFakeCloud } from '../testing/fakeCloud';
import { freshDb } from '../testing/fixtures';
import { EMPTY_DETAILS, findAccountByEmail, registerAccount } from './account';
import { aliasFor, linkCloudIdentity, pushLocalAccount } from './cloudLink';

const openDbs: EnarmDb[] = [];
afterEach(async () => {
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
      { kind: 'photo', path: `${identity.authId}/avatar.jpg`, hash: 'deadbeef' },
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

describe('la foto de perfil al unir la cuenta (B2)', () => {
  const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const PATH = `${identity.authId}/avatar.jpg`;
  const cloudWithPhoto = () => {
    const fake = makeFakeCloud();
    fake.remoteAccount = { avatar: { kind: 'photo', path: PATH, hash: photoHash(JPEG) } };
    fake.objects.set(`avatars/${PATH}`, dataUrlToBlob(JPEG));
    return fake;
  };

  it('en un dispositivo nuevo baja la foto de la nube y no la vuelve a subir', async () => {
    const { api } = setup();
    const fake = cloudWithPhoto();
    const linked = await linkCloudIdentity(api, identity);
    expect(
      await pushLocalAccount(api, fake.cloud, identity.authId, linked.userId, {
        pullPhoto: linked.created,
      }),
    ).toBe(true);
    expect((await api.repos.accounts.get(linked.userId))?.avatar).toEqual({
      kind: 'photo',
      dataUrl: JPEG,
    });
    expect(fake.storageCalls).toEqual([`download:avatars/${PATH}`]);
    expect(fake.accountUpdates[0]?.avatar).toEqual({
      kind: 'photo',
      path: PATH,
      hash: photoHash(JPEG),
    });
  });

  it('si el alumno eligió iniciales en este dispositivo, no se le regresa la foto y la nube la quita', async () => {
    const { api } = setup();
    const fake = cloudWithPhoto();
    const created = await registerAccount(api, {
      alias: 'Rick',
      email: identity.email,
      dailyGoal: { metric: 'cards', value: 20 },
      details: EMPTY_DETAILS,
    });
    if (!created.ok) throw new Error('no se creó');
    const linked = await linkCloudIdentity(api, identity);
    expect(linked.created).toBe(false);
    await pushLocalAccount(api, fake.cloud, identity.authId, linked.userId, {
      pullPhoto: linked.created,
    });
    expect((await api.repos.accounts.get(linked.userId))?.avatar).toEqual({ kind: 'initials' });
    expect(fake.storageCalls).toEqual([`remove:avatars/${PATH}`]);
    expect(fake.accountUpdates[0]?.avatar).toEqual({ kind: 'initials' });
  });

  it('sin foto en la nube el perfil nuevo se queda con iniciales y Storage ni se toca', async () => {
    const { api } = setup();
    const fake = makeFakeCloud();
    const linked = await linkCloudIdentity(api, identity);
    await pushLocalAccount(api, fake.cloud, identity.authId, linked.userId, { pullPhoto: true });
    expect((await api.repos.accounts.get(linked.userId))?.avatar).toEqual({ kind: 'initials' });
    expect(fake.storageCalls).toEqual([]);
  });

  it('si la bajada falla, la cuenta se sube igual con iniciales', async () => {
    const { api } = setup();
    const fake = cloudWithPhoto();
    fake.failStorage = 'error';
    const linked = await linkCloudIdentity(api, identity);
    expect(
      await pushLocalAccount(api, fake.cloud, identity.authId, linked.userId, { pullPhoto: true }),
    ).toBe(true);
    expect((await api.repos.accounts.get(linked.userId))?.avatar).toEqual({ kind: 'initials' });
    // Sin foto local, la fila conserva la de la nube hasta que Storage vuelva y se pueda decidir
    expect(fake.accountUpdates[0]?.avatar).toEqual({
      kind: 'photo',
      path: PATH,
      hash: photoHash(JPEG),
    });
  });
});
