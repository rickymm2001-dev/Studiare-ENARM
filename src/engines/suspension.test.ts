import { describe, expect, it } from 'vitest';
import type { AppEvent } from '@/data/schemas/events';
import { SUSPEND_BATCH, inBatches, suspendedCardIds } from './suspension';

let counter = 0;
function event(type: 'cards_suspended' | 'cards_unsuspended', cardIds: string[]): AppEvent {
  counter += 1;
  const id = `01JAA6S${String(counter).padStart(19, '0')}`;
  const base = { id, userId: id, at: '2026-10-08T12:00:00.000Z', tz: 'America/Merida' } as const;
  return type === 'cards_suspended'
    ? {
        ...base,
        schemaVersion: 1,
        sessionId: null,
        type,
        payload: { cardIds, reason: 'manual' },
      }
    : { ...base, schemaVersion: 1, sessionId: null, type, payload: { cardIds } };
}

describe('tarjetas suspendidas', () => {
  it('suspender y reanudar siguen al último evento de cada tarjeta', () => {
    const events = [
      event('cards_suspended', ['a', 'b', 'c']),
      event('cards_unsuspended', ['b']),
      event('cards_suspended', ['b', 'd']),
      event('cards_unsuspended', ['a']),
    ];
    expect([...suspendedCardIds(events)].sort()).toEqual(['b', 'c', 'd']);
  });

  it('reanudar una tarjeta que no estaba suspendida no hace nada y sin eventos no hay ninguna', () => {
    expect(suspendedCardIds([event('cards_unsuspended', ['x'])]).size).toBe(0);
    expect(suspendedCardIds([]).size).toBe(0);
  });

  it('ignora los eventos de otro tipo', () => {
    const other = {
      ...event('cards_suspended', ['a']),
      type: 'party_left',
      payload: { groupId: 'g' },
    };
    expect(suspendedCardIds([other as unknown as AppEvent]).size).toBe(0);
  });

  it('parte las listas largas en lotes del tamaño de un evento', () => {
    const items = Array.from({ length: SUSPEND_BATCH * 2 + 3 }, (_, index) => index);
    const batches = inBatches(items);
    expect(batches.map((batch) => batch.length)).toEqual([SUSPEND_BATCH, SUSPEND_BATCH, 3]);
    expect(batches.flat()).toEqual(items);
    expect(inBatches([])).toEqual([]);
  });
});
