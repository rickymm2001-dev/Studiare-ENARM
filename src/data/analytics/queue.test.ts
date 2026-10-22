// La cola de eventos en memoria (B15, 1.4)
import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsRecord } from './catalog';
import {
  QUEUE_BATCH_SIZE,
  QUEUE_MAX_PENDING,
  QUEUE_MAX_WAIT_MS,
  createAnalyticsQueue,
  type QueueTimers,
} from './queue';

/** Relojes a mano: guarda lo agendado y lo corre cuando la prueba lo pide */
function manualTimers() {
  const scheduled: { run: () => void; ms: number; live: boolean }[] = [];
  const timers: QueueTimers = {
    schedule: (run, ms) => {
      const entry = { run, ms, live: true };
      scheduled.push(entry);
      return () => {
        entry.live = false;
      };
    },
  };
  return {
    timers,
    scheduled,
    fire: () => {
      for (const entry of scheduled.filter((item) => item.live)) entry.run();
    },
    live: () => scheduled.filter((entry) => entry.live).length,
  };
}

const record = (at: number): AnalyticsRecord => ({
  event: 'party_group_joined',
  properties: {},
  at,
});

function setup(ready = true) {
  const clock = manualTimers();
  const state = { ready };
  const batches: AnalyticsRecord[][] = [];
  const queue = createAnalyticsQueue({
    deliver: (batch) => batches.push(batch),
    ready: () => state.ready,
    timers: clock.timers,
  });
  return { clock, state, batches, queue };
}

describe('cola de analítica', () => {
  it('un evento espera 10 segundos antes de salir', () => {
    const { clock, batches, queue } = setup();
    queue.push(record(1));
    expect(batches).toEqual([]);
    expect(clock.scheduled[0]?.ms).toBe(QUEUE_MAX_WAIT_MS);
    clock.fire();
    expect(batches).toEqual([[record(1)]]);
    expect(queue.size()).toBe(0);
  });

  it('el evento número 20 saca el lote al instante, sin esperar al reloj', () => {
    const { clock, batches, queue } = setup();
    for (let i = 0; i < QUEUE_BATCH_SIZE - 1; i += 1) queue.push(record(i));
    expect(batches).toEqual([]);
    queue.push(record(99));
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(QUEUE_BATCH_SIZE);
    expect(clock.live()).toBe(0);
  });

  it('no agenda más de una espera a la vez', () => {
    const { clock, queue } = setup();
    queue.push(record(1));
    queue.push(record(2));
    queue.push(record(3));
    expect(clock.live()).toBe(1);
  });

  it('flush entrega lo que haya, como cuando la pestaña se oculta', () => {
    const { batches, queue } = setup();
    queue.push(record(1));
    queue.push(record(2));
    queue.flush();
    expect(batches).toEqual([[record(1), record(2)]]);
    queue.flush();
    expect(batches).toHaveLength(1);
  });

  it('retirar el permiso vacía la cola sin mandar y cancela la espera', () => {
    const { clock, batches, queue } = setup();
    queue.push(record(1));
    queue.push(record(2));
    queue.clear();
    expect(queue.size()).toBe(0);
    expect(clock.live()).toBe(0);
    clock.fire();
    queue.flush();
    expect(batches).toEqual([]);
  });

  it('sin poder mandar los eventos esperan, no agenda nada y al estar lista sale todo', () => {
    const { clock, state, batches, queue } = setup(false);
    queue.push(record(1));
    queue.push(record(2));
    queue.flush();
    expect(batches).toEqual([]);
    expect(clock.scheduled).toHaveLength(0);
    expect(queue.size()).toBe(2);
    state.ready = true;
    queue.wake();
    clock.fire();
    expect(batches).toEqual([[record(1), record(2)]]);
  });

  it('con más de 50 esperando se pierde el más viejo, no el nuevo', () => {
    const { state, batches, queue } = setup(false);
    for (let i = 0; i < QUEUE_MAX_PENDING + 5; i += 1) queue.push(record(i));
    expect(queue.size()).toBe(QUEUE_MAX_PENDING);
    state.ready = true;
    queue.flush();
    expect(batches[0]?.[0]?.at).toBe(5);
    expect(batches[0]?.at(-1)?.at).toBe(QUEUE_MAX_PENDING + 4);
  });

  it('si entregar lanza, la cola sigue sana y no reintenta', () => {
    const clock = manualTimers();
    const deliver = vi.fn(() => {
      throw new Error('boom');
    });
    const queue = createAnalyticsQueue({ deliver, ready: () => true, timers: clock.timers });
    queue.push(record(1));
    expect(() => {
      clock.fire();
    }).not.toThrow();
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(queue.size()).toBe(0);
  });
});
