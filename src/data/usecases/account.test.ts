import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { EnarmDb } from '../db/database';
import { createDexieRepositories } from '../repos/dexie/createRepositories';
import { freshDb } from '../testing/fixtures';
import { EMPTY_DETAILS, findAccountByEmail, registerAccount, updateAccount } from './account';

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
