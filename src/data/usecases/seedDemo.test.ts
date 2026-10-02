import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDemoBank } from '@/demo/content/bank';
import { topicTaxonomy } from '@/demo/content';
import { buildDemoSeed } from '@/demo/generator/seed';
import type { EnarmDb } from '../db/database';
import { freshDb } from '../testing/fixtures';
import { DemoOnlyError, isDemoSeeded, resetDemoDatabase, seedDemoDatabase } from './seedDemo';

const openDbs: EnarmDb[] = [];
afterEach(async () => {
  await Promise.all(openDbs.splice(0).map((db) => db.delete()));
});

const seed = buildDemoSeed(buildDemoBank(), topicTaxonomy, {
  seed: 'prueba-siembra',
  endDay: '2026-10-01',
  examDate: '2027-09-01',
  cohortSize: 4,
  cohortDays: 20,
  demoDays: 12,
});

describe('siembra de la demo (11.2, 11.3)', () => {
  it('escribe contenido, alumnos, SimTruth y la bitácora del alumno de la demo', async () => {
    const db = freshDb('demo');
    openDbs.push(db);
    expect(await isDemoSeeded(db, seed.demoUserId)).toBe(false);
    const summary = await seedDemoDatabase(db, seed);
    expect(summary).toEqual({
      questions: seed.questions.length,
      users: 5,
      events: seed.events.length,
      cards: 200,
    });
    expect(await isDemoSeeded(db, seed.demoUserId)).toBe(true);
    expect(await db.questions.count()).toBe(seed.questions.length);
    expect(await db.options.count()).toBe(seed.questions.length * 10);
    expect(await db.simTruth.count()).toBe(5);
    expect(
      await db.events
        .where('[userId+at]')
        .between([seed.demoUserId, ''], [seed.demoUserId, '￿'])
        .count(),
    ).toBe(seed.events.length);
    const deck = await db.decks.get(seed.deck.id);
    expect(deck?.isDemo).toBe(true);
    // La caché de XP se reconstruye desde la bitácora
    const xp = await db.xpCache.get(seed.demoUserId);
    const expected = seed.events.reduce(
      (sum, event) => sum + (event.type === 'xp_awarded' ? event.payload.amount : 0),
      0,
    );
    expect(xp?.totalXp).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('no siembra datos simulados en la base real', async () => {
    const db = freshDb('real');
    openDbs.push(db);
    await expect(seedDemoDatabase(db, seed)).rejects.toThrow(DemoOnlyError);
    await expect(resetDemoDatabase(db, seed)).rejects.toThrow(DemoOnlyError);
  });

  it('regenerar borra todo y vuelve a sembrar igual', async () => {
    const db = freshDb('demo');
    openDbs.push(db);
    await seedDemoDatabase(db, seed);
    const summary = await resetDemoDatabase(db, seed);
    expect(summary.events).toBe(seed.events.length);
    expect(await db.events.count()).toBe(seed.events.length);
    expect(await db.users.count()).toBe(5);
  });

  it('sembrar dos veces sin regenerar falla porque la bitácora no acepta eventos repetidos', async () => {
    const db = freshDb('demo');
    openDbs.push(db);
    await seedDemoDatabase(db, seed);
    await expect(seedDemoDatabase(db, seed)).rejects.toThrow();
  }, 30_000);
});
