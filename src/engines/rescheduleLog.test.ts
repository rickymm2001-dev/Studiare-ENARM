import { describe, expect, it } from 'vitest';
import type { AppEvent } from '@/data/schemas/events';
import { newId } from '@/data/testing/fixtures';
import { event, minute } from '../features/tutor/testing/fixtures';
import { lastUndoableAction } from './rescheduleLog';

const a = newId();
const b = newId();
const day = (offset: number) => new Date(minute(0) + offset * 86_400_000).toISOString();

const moved = (
  kind: 'spread' | 'postpone' | 'advance' | 'undo',
  cards: { cardId: string; from: string; to: string }[],
  at: number,
  days: number | null = kind === 'advance' || kind === 'undo' ? null : 3,
): AppEvent => event('cards_rescheduled', { kind, cards, days, undoes: null }, at);

describe('última acción de cambio de fecha que se puede deshacer', () => {
  it('sin cambios no hay nada que deshacer', () => {
    expect(lastUndoableAction([], () => null)).toBeNull();
  });

  it('reúne los lotes de una acción por su hora y toma la más reciente', () => {
    const first = moved('postpone', [{ cardId: a, from: day(0), to: day(3) }], minute(10));
    const secondA = moved('spread', [{ cardId: a, from: day(3), to: day(5) }], minute(20));
    const secondB = moved('spread', [{ cardId: b, from: day(0), to: day(4) }], minute(20));
    const due = new Map([
      [a, day(5)],
      [b, day(4)],
    ]);
    const action = lastUndoableAction([first, secondA, secondB], (id) => due.get(id) ?? null);
    expect(action?.kind).toBe('spread');
    expect(action?.batches).toHaveLength(2);
    expect(action?.days).toBe(3);
  });

  it('si la última ya no tiene tarjetas con su fecha, regresa a la anterior', () => {
    const first = moved('postpone', [{ cardId: a, from: day(0), to: day(3) }], minute(10));
    const second = moved('advance', [{ cardId: b, from: day(8), to: day(0) }], minute(20));
    // b se repasó y su fecha ya no es la de la acción. a todavía la conserva
    const due = new Map([
      [a, day(3)],
      [b, day(9)],
    ]);
    expect(lastUndoableAction([first, second], (id) => due.get(id) ?? null)?.kind).toBe('postpone');
  });

  it('las acciones de deshacer no cuentan como acciones y comparar fechas es por instante', () => {
    const first = moved('postpone', [{ cardId: a, from: day(0), to: day(3) }], minute(10));
    const undo = moved('undo', [{ cardId: a, from: day(3), to: day(0) }], minute(20));
    // La tarjeta volvió a su fecha de antes, así que no queda nada que deshacer
    expect(lastUndoableAction([first, undo], () => day(0))).toBeNull();
    // Una fecha escrita distinto pero del mismo instante cuenta como la misma
    const sameInstant = day(3).replace('.000Z', 'Z');
    expect(lastUndoableAction([first], () => sameInstant)?.kind).toBe('postpone');
    // Una tarjeta sin fecha no estorba
    expect(lastUndoableAction([first], () => null)).toBeNull();
  });
});
