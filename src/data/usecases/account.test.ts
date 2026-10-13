import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { EnarmDb } from '../db/database';
import { createDexieRepositories } from '../repos/dexie/createRepositories';
import { freshDb } from '../testing/fixtures';
import {
  addAccountToProfile,
  EMPTY_DETAILS,
  findAccountByEmail,
  registerAccount,
  sameAvatarChoice,
  updateAccount,
} from './account';
import { createProfile } from './profile';

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
  return { db, api };
}

describe('cuenta con correo (D-068)', () => {
  it('registra con correo único, lo normaliza y no lo mete al perfil seudónimo', async () => {
    const { api } = setup();
    const first = await registerAccount(api, {
      alias: 'Rick',
      email: '  Rick@Example.com ',
      dailyGoal: { metric: 'cards', value: 20 },
      details: { ...EMPTY_DETAILS, birthYear: 1998, sex: 'male', state: 'YUC', attempt: 2 },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(JSON.stringify(first.user)).not.toContain('example.com');
    const account = await findAccountByEmail(api, 'rick@example.com');
    expect(account?.userId).toBe(first.user.id);
    expect(account?.state).toBe('YUC');
    const again = await registerAccount(api, {
      alias: 'Otro',
      email: 'RICK@example.com',
      dailyGoal: { metric: 'cards', value: 20 },
      details: EMPTY_DETAILS,
    });
    expect(again).toEqual({ ok: false, reason: 'email_taken' });
    if (!account) throw new Error('falta la cuenta');
    const updated = await updateAccount(api, account, { targetSpecialty: 'pediatrics' });
    expect(updated.targetSpecialty).toBe('pediatrics');
  });

  it('rechaza un correo inválido sin crear perfil', async () => {
    const { api } = setup();
    await expect(
      registerAccount(api, {
        alias: 'X',
        email: 'no-es-correo',
        dailyGoal: { metric: 'cards', value: 20 },
        details: EMPTY_DETAILS,
      }),
    ).rejects.toThrow();
    expect(await api.repos.users.list()).toHaveLength(0);
  });
});

describe('fecha de la elección de foto (B2)', () => {
  const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const OTHER_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgAB';

  const registered = async () => {
    const { api } = setup();
    const created = await registerAccount(api, {
      alias: 'Rick',
      email: 'rick@example.com',
      dailyGoal: { metric: 'cards', value: 20 },
      details: EMPTY_DETAILS,
    });
    if (!created.ok) throw new Error('no se creó');
    const account = await api.repos.accounts.get(created.user.id);
    if (!account) throw new Error('falta la cuenta');
    return { api, account };
  };

  it('una cuenta nueva con iniciales no trae fecha, porque nadie eligió nada', async () => {
    const { account } = await registered();
    expect(account.avatarChangedAt).toBeUndefined();
  });

  it('guardar otra foto o pasar a iniciales cambia la fecha', async () => {
    const { api, account } = await registered();
    const withPhoto = await updateAccount(api, account, {
      avatar: { kind: 'photo', dataUrl: JPEG },
    });
    expect(withPhoto.avatarChangedAt).toBe(withPhoto.updatedAt);
    const other = await updateAccount(api, withPhoto, {
      avatar: { kind: 'photo', dataUrl: OTHER_JPEG },
    });
    expect(other.avatarChangedAt).toBeDefined();
    const back = await updateAccount(api, other, { avatar: { kind: 'initials' } });
    expect(back.avatarChangedAt).toBe(back.updatedAt);
    expect((await api.repos.accounts.get(account.userId))?.avatarChangedAt).toBe(
      back.avatarChangedAt,
    );
  });

  it('guardar sin cambiar la foto no cambia la fecha, para no pisar otra elección más reciente', async () => {
    const { api, account } = await registered();
    const chosen = await api.repos.accounts.put({
      ...account,
      avatar: { kind: 'photo', dataUrl: JPEG },
      avatarChangedAt: '2026-10-12T09:00:00.000Z',
    });
    const same = await updateAccount(api, chosen, {
      birthYear: 1998,
      avatar: { kind: 'photo', dataUrl: JPEG },
    });
    expect(same.birthYear).toBe(1998);
    expect(same.avatarChangedAt).toBe('2026-10-12T09:00:00.000Z');
    const details = await updateAccount(api, same, { state: 'YUC' });
    expect(details.avatarChangedAt).toBe('2026-10-12T09:00:00.000Z');
  });

  it('un avatar generado de antes se ve como iniciales, así que elegir iniciales no es un cambio', async () => {
    const { api, account } = await registered();
    const old = await api.repos.accounts.put({
      ...account,
      avatar: { kind: 'generated', seed: 'studiare-2' },
    });
    const saved = await updateAccount(api, old, { avatar: { kind: 'initials' } });
    expect(saved.avatarChangedAt).toBeUndefined();
    expect(sameAvatarChoice({ kind: 'generated', seed: 'x' }, { kind: 'initials' })).toBe(true);
    expect(sameAvatarChoice({ kind: 'photo', dataUrl: JPEG }, { kind: 'initials' })).toBe(false);
  });

  it('al agregar el correo a un perfil viejo, una foto elegida lleva fecha y las iniciales no', async () => {
    const { api } = setup();
    const withPhoto = await createProfile(api, {
      alias: 'Ana',
      dailyGoal: { metric: 'cards', value: 20 },
    });
    const photo = await addAccountToProfile(api, {
      userId: withPhoto.id,
      email: 'ana@example.com',
      details: { ...EMPTY_DETAILS, avatar: { kind: 'photo', dataUrl: JPEG } },
    });
    expect(photo.avatarChangedAt).toBe(photo.updatedAt);
    const plain = await createProfile(api, {
      alias: 'Beto',
      dailyGoal: { metric: 'cards', value: 20 },
    });
    const initials = await addAccountToProfile(api, {
      userId: plain.id,
      email: 'beto@example.com',
      details: EMPTY_DETAILS,
    });
    expect(initials.avatarChangedAt).toBeUndefined();
  });
});
