import 'fake-indexeddb/auto';
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import { ZodError } from 'zod';
import { ImmutableEventError, type EnarmDb } from '../../db/database';
import type { AppEvent } from '../../schemas/events';
import { fixedClock, freshDb, makeEvent, newId } from '../../testing/fixtures';
import type { EventRepo } from '../types';
import { createDexieEventRepo } from './eventRepo';
import eventRepoSource from './eventRepo.ts?raw';

const openDbs: EnarmDb[] = [];
function setup(pageSize?: number) {
  const db = freshDb();
  openDbs.push(db);
  return { db, repo: createDexieEventRepo(db, pageSize === undefined ? undefined : { pageSize }) };
}

afterEach(async () => {
  await Promise.all(openDbs.splice(0).map((db) => db.delete()));
});

function xpEvent(userId: string, clock = fixedClock(), amount = 10) {
  return makeEvent(
    'xp_awarded',
    { amount, reason: 'card_review', sourceEventId: null },
    { userId, clock },
  );
}

describe('eventRepo, bitácora de solo agregar (4.7)', () => {
  it('la interfaz solo expone append, query y stream', () => {
    const { repo } = setup();
    expect(Object.keys(repo).sort()).toEqual(['append', 'query', 'stream']);
    expectTypeOf<keyof EventRepo>().toEqualTypeOf<'append' | 'query' | 'stream'>();
  });

  it('la implementación no llama a métodos que editan o borran', () => {
    const forbidden = [
      '.put(',
      '.update(',
      '.delete(',
      '.clear(',
      '.modify(',
      '.bulkPut(',
      '.bulkDelete(',
      '.bulkUpdate(',
    ];
    for (const call of forbidden) {
      expect(eventRepoSource, `eventRepo.ts no debe usar ${call}`).not.toContain(call);
    }
  });

  it('agrega y consulta un evento válido', async () => {
    const { repo } = setup();
    const userId = newId();
    const event = xpEvent(userId);
    await repo.append(event);
    expect(await repo.query({ userId })).toEqual([event]);
  });

  it('rechaza un evento con payload inválido y no guarda nada', async () => {
    const { db, repo } = setup();
    const userId = newId();
    const valid = xpEvent(userId);
    const invalid = { ...valid, payload: { ...valid.payload, amount: -5 } } as AppEvent;
    await expect(repo.append(invalid)).rejects.toBeInstanceOf(ZodError);
    expect(await db.events.count()).toBe(0);
  });

  it('rechaza agregar un evento con un ID que ya existe y conserva el original', async () => {
    const { db, repo } = setup();
    const userId = newId();
    const event = xpEvent(userId, fixedClock(), 10);
    await repo.append(event);
    const duplicate = { ...event, payload: { ...event.payload, amount: 999 } } as AppEvent;
    await expect(repo.append(duplicate)).rejects.toThrow();
    expect(await db.events.get(event.id)).toEqual(event);
  });

  it('la base rechaza editar o borrar eventos por cualquier camino de Dexie', async () => {
    const { db, repo } = setup();
    const userId = newId();
    const event = xpEvent(userId);
    await repo.append(event);
    const changed = { ...event, payload: { ...event.payload, amount: 999 } } as AppEvent;

    const attempts: [string, () => Promise<unknown>][] = [
      ['put', () => db.events.put(changed)],
      ['bulkPut', () => db.events.bulkPut([changed])],
      ['update', () => db.events.update(event.id, { tz: 'UTC' })],
      ['modify', () => db.events.where('id').equals(event.id).modify({ tz: 'UTC' })],
      ['delete', () => db.events.delete(event.id)],
      ['bulkDelete', () => db.events.bulkDelete([event.id])],
      ['clear', () => db.events.clear()],
      ['collection.delete', () => db.events.where('userId').equals(userId).delete()],
    ];
    for (const [name, attempt] of attempts) {
      await expect(attempt(), name).rejects.toBeInstanceOf(ImmutableEventError);
    }
    expect(await db.events.toArray()).toEqual([event]);
  });

  it('Borrar mis datos elimina la base completa, que es la única excepción (4.5)', async () => {
    const { db, repo } = setup();
    await repo.append(xpEvent(newId()));
    await db.delete();
    await db.open();
    expect(await db.events.count()).toBe(0);
  });

  it('filtra por tipo, sesión y rango de tiempo, en orden de tiempo', async () => {
    const { repo } = setup();
    const userId = newId();
    const otherUser = newId();
    const sessionId = newId();
    const clock = fixedClock('2026-10-01T10:00:00.000Z');
    const first = xpEvent(userId, clock, 1);
    clock.advance(60_000);
    const shown = makeEvent(
      'visibility_changed',
      { hidden: true, awayMs: null },
      { userId, clock, sessionId },
    );
    clock.advance(60_000);
    const third = xpEvent(userId, clock, 3);
    const foreign = xpEvent(otherUser, clock, 50);
    for (const event of [third, foreign, shown, first]) await repo.append(event);

    expect(await repo.query({ userId })).toEqual([first, shown, third]);
    expect(await repo.query({ userId, types: ['xp_awarded'] })).toEqual([first, third]);
    expect(await repo.query({ userId, sessionId })).toEqual([shown]);
    expect(await repo.query({ userId, from: shown.at })).toEqual([shown, third]);
    expect(await repo.query({ userId, to: shown.at })).toEqual([first, shown]);
    expect(await repo.query({ userId, limit: 1 })).toEqual([first]);
  });

  it('stream recorre todo en orden por páginas, con eventos del mismo milisegundo', async () => {
    const { repo } = setup(3);
    const userId = newId();
    const clock = fixedClock();
    const appended: AppEvent[] = [];
    for (let index = 0; index < 11; index += 1) {
      // Grupos de eventos en el mismo milisegundo para probar el desempate por ID
      if (index % 4 === 0) clock.advance(1000);
      const event = xpEvent(userId, clock, index);
      appended.push(event);
      await repo.append(event);
    }
    const streamed: AppEvent[] = [];
    for await (const event of repo.stream({ userId })) streamed.push(event);
    expect(streamed.map((event) => event.id)).toEqual(appended.map((event) => event.id));

    const limited: AppEvent[] = [];
    for await (const event of repo.stream({ userId, limit: 5 })) limited.push(event);
    expect(limited).toHaveLength(5);
  });
});
