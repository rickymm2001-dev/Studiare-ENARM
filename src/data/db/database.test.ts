import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { makeUser, newId } from '../testing/fixtures';
import { createEnarmDb, type EnarmDb } from './database';
import { storesFor } from './tables';

const names: string[] = [];
const open: EnarmDb[] = [];
afterEach(async () => {
  for (const db of open.splice(0)) db.close();
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

/** Una base como la dejó la versión 3, con una persona que tiene la confianza previa encendida */
async function oldDatabase(name: string, userId: string) {
  const old = new Dexie(name);
  old.version(3).stores(storesFor('real'));
  await old.open();
  const user = makeUser({ id: userId });
  await old.table('users').put({
    ...user,
    settings: { ...user.settings, cardConfidenceStep: true },
  });
  old.close();
}

describe('versión 4 de la base', () => {
  it('apaga la confianza previa una sola vez al subir de versión', async () => {
    const name = `migracion-${newId()}`;
    names.push(name);
    const userId = newId();
    await oldDatabase(name, userId);

    const db = createEnarmDb('real', { name });
    open.push(db);
    await db.open();
    expect((await db.users.get(userId))?.settings.cardConfidenceStep).toBe(false);

    // Si la persona la vuelve a encender, abrir la base de nuevo no la apaga otra vez
    const user = await db.users.get(userId);
    await db.users.put({
      ...(user as NonNullable<typeof user>),
      settings: { ...(user as NonNullable<typeof user>).settings, cardConfidenceStep: true },
    });
    db.close();
    const again = createEnarmDb('real', { name });
    open.push(again);
    await again.open();
    expect((await again.users.get(userId))?.settings.cardConfidenceStep).toBe(true);
  });

  it('una base nueva queda en la versión 4', async () => {
    const name = `nueva-${newId()}`;
    names.push(name);
    const db = createEnarmDb('real', { name });
    open.push(db);
    await db.open();
    expect(db.verno).toBe(4);
  });
});
