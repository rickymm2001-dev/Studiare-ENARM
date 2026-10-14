import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { EnarmDb } from '../db/database';
import { createDexieRepositories } from '../repos/dexie/createRepositories';
import { freshDb } from '../testing/fixtures';
import {
  addAccountToProfile,
  completeSignup,
  EMPTY_DETAILS,
  findAccountByEmail,
  registerAccount,
  sameAvatarChoice,
  updateAccount,
} from './account';
import { createProfile, currentConsents } from './profile';

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

describe('fecha de los datos opcionales y lo que pide el registro (H29, B9)', () => {
  const register = (api: ReturnType<typeof setup>['api'], details = EMPTY_DETAILS) =>
    registerAccount(api, {
      alias: 'Rick',
      email: 'rick@example.com',
      dailyGoal: { metric: 'cards', value: 20 },
      details,
      signup: {
        adultConfirmedAt: '2026-10-13T09:00:00.000Z',
        heardFrom: { channel: 'university', influencerCode: null },
        consents: { ai_analysis: true, party: false },
      },
    });

  it('el registro nunca pone fecha a los datos. Con algún dato queda marcado para juntarse campo por campo', async () => {
    const empty = setup();
    const created = await register(empty.api);
    if (!created.ok) throw new Error('no se creó');
    const account = await empty.api.repos.accounts.get(created.user.id);
    expect(account?.detailsChangedAt).toBeUndefined();
    expect(account?.detailsFromSignup).toBeUndefined();
    expect(account?.adultConfirmedAt).toBe('2026-10-13T09:00:00.000Z');
    expect(account?.heardFrom).toMatchObject({ channel: 'university', influencerCode: null });
    expect(account?.heardFrom?.recordedAt).toBeUndefined();

    const withData = setup();
    const filled = await register(withData.api, { ...EMPTY_DETAILS, targetSpecialty: 'urology' });
    if (!filled.ok) throw new Error('no se creó');
    const marked = await withData.api.repos.accounts.get(filled.user.id);
    expect(marked?.detailsChangedAt).toBeUndefined();
    expect(marked?.detailsFromSignup).toBe(true);

    // Agregar el correo a un perfil viejo tampoco pone fecha
    const old = setup();
    const profile = await createProfile(old.api, {
      alias: 'Ana',
      dailyGoal: { metric: 'cards', value: 20 },
    });
    const added = await addAccountToProfile(old.api, {
      userId: profile.id,
      email: 'ana@example.com',
      details: { ...EMPTY_DETAILS, birthYear: 1995 },
    });
    expect(added.detailsChangedAt).toBeUndefined();
    expect(added.detailsFromSignup).toBe(true);
  });

  it('guardar en Tus datos pone la fecha y quita la marca del registro', async () => {
    const { api } = setup();
    const created = await register(api, { ...EMPTY_DETAILS, targetSpecialty: 'urology' });
    if (!created.ok) throw new Error('no se creó');
    const account = await api.repos.accounts.get(created.user.id);
    if (!account) throw new Error('falta la cuenta');
    // Solo la foto no toca los datos ni su marca
    const photoOnly = await updateAccount(api, account, { avatar: { kind: 'initials' } });
    expect(photoOnly.detailsFromSignup).toBe(true);
    const saved = await updateAccount(api, photoOnly, { attempt: 2 });
    expect(saved.detailsChangedAt).toBeDefined();
    expect(saved.detailsFromSignup).toBeUndefined();
  });

  it('solo los permisos que marcó en el registro quedan prendidos (4.27)', async () => {
    const { api } = setup();
    const created = await register(api);
    if (!created.ok) throw new Error('no se creó');
    expect(await currentConsents(api, created.user.id)).toEqual({
      party: false,
      ai_analysis: true,
      anonymized_improvement: false,
    });
  });

  it('guardar un dato distinto cambia la fecha y guardar lo mismo no', async () => {
    const { api } = setup();
    const created = await register(api);
    if (!created.ok) throw new Error('no se creó');
    const account = await api.repos.accounts.get(created.user.id);
    if (!account) throw new Error('falta la cuenta');
    const same = await updateAccount(api, account, { birthYear: null, sex: null });
    expect(same.detailsChangedAt).toBeUndefined();
    const changed = await updateAccount(api, account, { birthYear: 1990 });
    expect(changed.detailsChangedAt).toBeDefined();
    // Borrar un dato también es una elección que gana en los otros dispositivos
    const cleared = await updateAccount(api, changed, { birthYear: null });
    expect(cleared.detailsChangedAt).toBeDefined();
  });

  it('completar el registro guarda la edad y la respuesta, y no cambia una fecha ya puesta', async () => {
    const { api } = setup();
    await createProfile(api, { alias: 'Gugle', dailyGoal: { metric: 'cards', value: 20 } });
    const user = (await api.repos.users.list())[0];
    if (!user) throw new Error('falta el perfil');
    const account = await addAccountToProfile(api, {
      userId: user.id,
      email: 'gugle@example.com',
      details: EMPTY_DETAILS,
    });
    expect(account.detailsChangedAt).toBeUndefined();
    const completed = await completeSignup(api, account, {
      adultConfirmedAt: '2026-10-13T10:00:00.000Z',
      heardFrom: { channel: 'google', influencerCode: 'GUGLE' },
    });
    expect(completed).toMatchObject({
      adultConfirmedAt: '2026-10-13T10:00:00.000Z',
      heardFrom: { channel: 'google', influencerCode: 'GUGLE' },
    });
    const again = await completeSignup(api, completed, {
      adultConfirmedAt: '2027-01-01T00:00:00.000Z',
      heardFrom: { channel: 'tiktok', influencerCode: null },
    });
    expect(again.adultConfirmedAt).toBe('2026-10-13T10:00:00.000Z');
    expect(again.heardFrom?.channel).toBe('google');
  });

  it('la especialidad de Completa tu registro entra como la del registro, sin fecha', async () => {
    const { api } = setup();
    const profile = await createProfile(api, {
      alias: 'Gugle',
      dailyGoal: { metric: 'cards', value: 20 },
      noticeSeen: false,
    });
    const account = await addAccountToProfile(api, {
      userId: profile.id,
      email: 'gugle@example.com',
      details: EMPTY_DETAILS,
    });
    const completed = await completeSignup(api, account, {
      adultConfirmedAt: '2026-10-13T10:00:00.000Z',
      heardFrom: null,
      targetSpecialty: 'geriatrics',
    });
    expect(completed.targetSpecialty).toBe('geriatrics');
    expect(completed.detailsChangedAt).toBeUndefined();
    expect(completed.detailsFromSignup).toBe(true);
    // Si la cuenta ya tenía sus datos con fecha, cambiarla aquí la fecha como en Tus datos
    const dated = await updateAccount(api, completed, { birthYear: 1990 });
    const changed = await completeSignup(api, dated, {
      adultConfirmedAt: '2026-10-13T10:00:00.000Z',
      targetSpecialty: 'urology',
    });
    expect(changed.targetSpecialty).toBe('urology');
    expect(changed.detailsFromSignup).toBeUndefined();
    expect(changed.detailsChangedAt).toBeDefined();
  });

  it('un perfil que nace sin ver el aviso no guarda decisiones bajo ninguna versión', async () => {
    const { api } = setup();
    const profile = await createProfile(api, {
      alias: 'Alumno',
      dailyGoal: { metric: 'cards', value: 20 },
      noticeSeen: false,
    });
    expect(await api.repos.consents.list()).toEqual([]);
    expect(await api.repos.events.query({ userId: profile.id })).toEqual([]);
    const seen = await createProfile(api, {
      alias: 'Ana',
      dailyGoal: { metric: 'cards', value: 20 },
    });
    const decided = (await api.repos.consents.list()).filter((item) => item.userId === seen.id);
    expect(decided).toHaveLength(3);
    expect(profile.id).not.toBe(seen.id);
  });
});
