import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createEvent } from '../events/createEvent';
import { makeUser, testApi } from '../testing/fixtures';
import { recordEventOnce } from './recordEvent';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

function setup() {
  const api = testApi('real');
  disposers.push(api.dispose);
  const user = makeUser();
  const ctx = {
    userId: user.id,
    tz: user.timeZone,
    clock: { now: () => new Date(1_700_000_000_000) },
  };
  return { api, user, ctx };
}

describe('registrar un evento una sola vez', () => {
  it('con un ID nuevo lo agrega', async () => {
    const { api, user, ctx } = setup();
    const event = createEvent('session_started', { kind: 'practice', config: {} }, ctx);
    expect(await recordEventOnce(api, event)).toEqual(event);
    expect(await api.repos.events.query({ userId: user.id })).toEqual([event]);
  });

  it('con un ID que ya estaba devuelve el guardado y no agrega otro', async () => {
    const { api, user, ctx } = setup();
    const first = createEvent('session_started', { kind: 'practice', config: {} }, ctx);
    await api.recordEvent(first);
    // Mismo ID, otro contenido, como un reintento que recalcula distinto
    const retry = { ...first, payload: { kind: 'exam' as const, config: { count: 3 } } };
    const stored = await recordEventOnce(api, retry);
    expect(stored).toEqual(first);
    expect(await api.repos.events.query({ userId: user.id })).toEqual([first]);
  });

  it('otros errores se propagan', async () => {
    const { api, ctx } = setup();
    const event = createEvent('session_started', { kind: 'practice', config: {} }, ctx);
    const broken = {
      repos: api.repos,
      recordEvent: () => Promise.reject(new Error('red')),
    };
    await expect(recordEventOnce(broken, event)).rejects.toThrow('red');
  });

  it('si la base dice que el ID existe y no se encuentra, propaga el error', async () => {
    const { api, ctx } = setup();
    const event = createEvent('session_started', { kind: 'practice', config: {} }, ctx);
    const conflict = Object.assign(new Error('ya existe'), { name: 'ConstraintError' });
    const broken = { repos: api.repos, recordEvent: () => Promise.reject(conflict) };
    await expect(recordEventOnce(broken, event)).rejects.toBe(conflict);
  });
});
