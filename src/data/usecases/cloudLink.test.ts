import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { parseRole, toCloudAccount } from '../cloud/account';
import { readCloudConfig } from '../cloud/client';
import { jwtRole } from '../cloud/keyRole';
import type { EnarmDb } from '../db/database';
import { createDexieRepositories } from '../repos/dexie/createRepositories';
import { freshDb } from '../testing/fixtures';
import { EMPTY_DETAILS, findAccountByEmail, registerAccount } from './account';
import { aliasFor, linkCloudIdentity } from './cloudLink';

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

  it('la foto propia no se sube y los nombres van como en la tabla', () => {
    const cloud = toCloudAccount({
      userId: 'u1',
      email: 'rick@example.com',
      ...EMPTY_DETAILS,
      birthYear: 1998,
      avatar: { kind: 'photo', dataUrl: 'data:image/jpeg;base64,AAAA' },
      updatedAt: '2026-10-02T00:00:00.000Z',
    });
    expect(cloud.birth_year).toBe(1998);
    expect(cloud.avatar).toEqual({ kind: 'initials' });
    expect(JSON.stringify(cloud)).not.toContain('rick@example.com');
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
    expect(await linkCloudIdentity(api, identity)).toBe(created.user.id);
  });

  it('en un dispositivo nuevo crea el perfil con el alias de la nube', async () => {
    const { api } = setup();
    const userId = await linkCloudIdentity(api, identity);
    expect((await api.repos.users.get(userId))?.alias).toBe('Rick');
    expect((await findAccountByEmail(api, 'rick@example.com'))?.userId).toBe(userId);
    // La segunda vez no duplica
    expect(await linkCloudIdentity(api, identity)).toBe(userId);
  });
});
