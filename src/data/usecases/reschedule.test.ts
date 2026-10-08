import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { latestCardStates } from '../../features/review/study';
import { lastUndoableAction } from '../../engines/rescheduleLog';
import { event, minute, state } from '../../features/tutor/testing/fixtures';
import { makeUser, newId, testApi } from '../testing/fixtures';
import { recordReschedule, undoReschedule } from './reschedule';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

function setup() {
  const api = testApi('real');
  disposers.push(api.dispose);
  const user = makeUser();
  return { api, user, actor: { id: user.id, timeZone: user.timeZone } };
}

const NOW = new Date('2026-10-08T12:00:00.000Z');

/** Tarjetas ya repasadas que venden el 2026-10-01, para moverlas */
async function seedReviews(api: ReturnType<typeof setup>['api'], userId: string, count: number) {
  const ids = Array.from({ length: count }, () => newId());
  for (const cardId of ids) {
    await api.recordEvent({
      ...event(
        'card_reviewed',
        {
          cardId,
          deckId: newId(),
          source: 'card',
          rating: 'good',
          confidence: null,
          msToReveal: 1000,
          msToRate: 1000,
          stateBefore: null,
          stateAfter: state({ due: '2026-10-01T10:00:00.000Z' }),
        },
        minute(1),
      ),
      userId,
    });
  }
  return ids;
}

describe('cambios de fecha de repaso', () => {
  it('guarda una acción grande en lotes de 500 con la misma hora y no toca lo anterior', async () => {
    const { api, user, actor } = setup();
    const ids = await seedReviews(api, user.id, 3);
    const before = JSON.stringify(await api.repos.events.query({ userId: user.id }));
    const assignments = Array.from({ length: 1100 }, (_, index) => ({
      cardId: ids[index % 3] as string,
      from: '2026-10-01T10:00:00.000Z',
      to: '2026-10-12T04:00:00.000Z',
    }));
    // Mil cien asignaciones en un cambio exceden un lote, así que se parten en tres
    const moved = await recordReschedule(api, actor, { kind: 'spread', assignments, days: 4 }, NOW);
    expect(moved).toBe(1100);
    const events = await api.repos.events.query({ userId: user.id });
    const resched = events.filter((entry) => entry.type === 'cards_rescheduled');
    expect(resched.map((entry) => entry.payload.cards.length)).toEqual([500, 500, 100]);
    expect(new Set(resched.map((entry) => entry.at)).size).toBe(1);
    // Solo se agregó. Los eventos anteriores quedaron idénticos
    expect(JSON.stringify(events.slice(0, 3))).toBe(before);
  });

  it('el estado de las tarjetas se reconstruye igual desde cero y solo mueve la fecha', async () => {
    const { api, user, actor } = setup();
    const [first, second] = await seedReviews(api, user.id, 2);
    const original = latestCardStates(await api.repos.events.query({ userId: user.id }));
    await recordReschedule(
      api,
      actor,
      {
        kind: 'postpone',
        assignments: [
          {
            cardId: first as string,
            from: '2026-10-01T10:00:00.000Z',
            to: '2026-10-15T04:00:00.000Z',
          },
        ],
        days: 7,
      },
      NOW,
    );
    const events = await api.repos.events.query({ userId: user.id });
    const rebuilt = latestCardStates(events);
    expect(rebuilt.get(first as string)).toEqual({
      ...original.get(first as string),
      due: '2026-10-15T04:00:00.000Z',
    });
    expect(rebuilt.get(second as string)).toEqual(original.get(second as string));
    // Rehacerlo da lo mismo
    expect(latestCardStates(events)).toEqual(rebuilt);
  });

  it('deshacer regresa solo las tarjetas que siguen en la fecha del cambio', async () => {
    const { api, user, actor } = setup();
    const [first, second] = await seedReviews(api, user.id, 2);
    const from = '2026-10-01T10:00:00.000Z';
    const to = '2026-10-15T04:00:00.000Z';
    await recordReschedule(
      api,
      actor,
      {
        kind: 'postpone',
        assignments: [
          { cardId: first as string, from, to },
          { cardId: second as string, from, to },
        ],
        days: 7,
      },
      NOW,
    );
    // La segunda se repasó después y ya tiene otra fecha
    await api.recordEvent({
      ...event(
        'card_reviewed',
        {
          cardId: second as string,
          deckId: newId(),
          source: 'card',
          rating: 'good',
          confidence: null,
          msToReveal: 1000,
          msToRate: 1000,
          stateBefore: null,
          stateAfter: state({ due: '2026-11-20T10:00:00.000Z' }),
        },
        minute(60 * 24 * 12),
      ),
      userId: user.id,
    });
    const events = await api.repos.events.query({ userId: user.id });
    const states = latestCardStates(events);
    const currentDue = (cardId: string) => states.get(cardId)?.due ?? null;
    const action = lastUndoableAction(events, currentDue);
    expect(action?.kind).toBe('postpone');
    if (!action) throw new Error('Debía haber una acción para deshacer');
    const restored = await undoReschedule(
      api,
      actor,
      action,
      currentDue,
      new Date(NOW.getTime() + 1000),
    );
    expect(restored).toBe(1);
    const after = latestCardStates(await api.repos.events.query({ userId: user.id }));
    expect(after.get(first as string)?.due).toBe(from);
    expect(after.get(second as string)?.due).toBe('2026-11-20T10:00:00.000Z');
    // Ya no queda nada de esa acción por deshacer
    const finalEvents = await api.repos.events.query({ userId: user.id });
    expect(lastUndoableAction(finalEvents, (cardId) => after.get(cardId)?.due ?? null)).toBeNull();
  });
});
