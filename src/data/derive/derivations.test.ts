import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { EnarmDb } from '../db/database';
import { createDexieRepositories } from '../repos/dexie/createRepositories';
import { fixedClock, freshDb, makeEvent, newId } from '../testing/fixtures';
import { recordEvent } from '../usecases/recordEvent';
import { rebuildDerivedState } from './derivations';
import { emptyXpCache, reduceXp } from './xp';

const openDbs: EnarmDb[] = [];
afterEach(async () => {
  await Promise.all(openDbs.splice(0).map((db) => db.delete()));
});

function setup() {
  const db = freshDb();
  openDbs.push(db);
  return { db, repos: createDexieRepositories(db) };
}

describe('derivación de estado desde la bitácora', () => {
  it('reduceXp es puro y solo cuenta xp_awarded del mismo alumno', () => {
    const userId = newId();
    const clock = fixedClock();
    const award = makeEvent(
      'xp_awarded',
      { amount: 15, reason: 'mcq_correct', sourceEventId: null },
      { userId, clock },
    );
    const other = makeEvent(
      'xp_awarded',
      { amount: 99, reason: 'mcq_correct', sourceEventId: null },
      { userId: newId(), clock },
    );
    const visibility = makeEvent(
      'visibility_changed',
      { hidden: false, awayMs: 1200 },
      { userId, clock },
    );
    const start = emptyXpCache(userId);
    const after = [award, other, visibility].reduce(reduceXp, start);
    expect(after).toEqual({
      userId,
      totalXp: 15,
      awards: 1,
      lastEventId: award.id,
      lastEventAt: award.at,
    });
    expect(start.totalXp).toBe(0);
  });

  it('la caché incremental es igual a la reconstruida desde cero', async () => {
    const { db, repos } = setup();
    const clock = fixedClock();
    const users = [newId(), newId()];
    for (let index = 0; index < 20; index += 1) {
      clock.advance(30_000);
      const userId = users[index % 2] ?? '';
      const event =
        index % 3 === 0
          ? makeEvent('visibility_changed', { hidden: true, awayMs: null }, { userId, clock })
          : makeEvent(
              'xp_awarded',
              { amount: index, reason: 'card_review', sourceEventId: null },
              { userId, clock },
            );
      await recordEvent(db, repos.events, event);
    }
    const incremental = await repos.caches.xp.list();
    await rebuildDerivedState(db);
    const rebuilt = await repos.caches.xp.list();
    expect(rebuilt).toEqual(incremental);
    expect(rebuilt).toHaveLength(2);
  });

  it('una caché corrupta se repara al reconstruir', async () => {
    const { db, repos } = setup();
    const userId = newId();
    const clock = fixedClock();
    for (const amount of [5, 7, 11]) {
      clock.advance(1000);
      await recordEvent(
        db,
        repos.events,
        makeEvent(
          'xp_awarded',
          { amount, reason: 'card_review', sourceEventId: null },
          { userId, clock },
        ),
      );
    }
    await db.xpCache.put({
      userId,
      totalXp: 9999,
      awards: 1,
      lastEventId: null,
      lastEventAt: null,
    });
    await rebuildDerivedState(db);
    expect((await repos.caches.xp.get(userId))?.totalXp).toBe(23);
  });

  it('si el evento es inválido no se guarda ni cambia la caché', async () => {
    const { db, repos } = setup();
    const userId = newId();
    const valid = makeEvent(
      'xp_awarded',
      { amount: 5, reason: 'card_review', sourceEventId: null },
      { userId },
    );
    const invalid = { ...valid, payload: { ...valid.payload, amount: 1.5 } };
    await expect(recordEvent(db, repos.events, invalid)).rejects.toThrow();
    expect(await db.events.count()).toBe(0);
    expect(await repos.caches.xp.get(userId)).toBeUndefined();
  });
});
