import { describe, expect, it } from 'vitest';
import { newId, makeUser } from '@/data/testing/fixtures';
import type { AppEvent } from '@/data/schemas/events';
import { event, minute, state } from '../tutor/testing/fixtures';
import { buildSnapshot } from './snapshot';

const user = makeUser({ timeZone: 'America/Merida' });
const NOW = new Date(minute(120));

/** Un repaso cuya siguiente fecha ya llegó, para que la tarjeta cuente como por repasar */
function reviewed(cardId: string): AppEvent {
  return event(
    'card_reviewed',
    {
      cardId,
      deckId: newId(),
      source: 'card',
      rating: 'good',
      confidence: null,
      msToReveal: 2000,
      msToRate: 1500,
      stateBefore: null,
      stateAfter: state({ due: new Date(minute(60)).toISOString() }),
    },
    minute(10),
  );
}

const snapshotOf = (events: AppEvent[], activeCardIds?: ReadonlySet<string>) =>
  buildSnapshot({
    events,
    user,
    settings: user.settings,
    now: NOW,
    ...(activeCardIds ? { activeCardIds } : {}),
  });

describe('tarjetas por repasar en Inicio', () => {
  const a = newId();
  const b = newId();

  it('cuenta las vencidas de todas las tarjetas con repasos', () => {
    expect(snapshotOf([reviewed(a), reviewed(b)]).dueCards).toBe(2);
  });

  it('una tarjeta suspendida no cuenta y al reanudarla vuelve a contar', () => {
    const suspend = event('cards_suspended', { cardIds: [a], reason: 'manual' }, minute(20));
    const resume = event('cards_unsuspended', { cardIds: [a] }, minute(30));
    expect(snapshotOf([reviewed(a), reviewed(b), suspend]).dueCards).toBe(1);
    expect(snapshotOf([reviewed(a), reviewed(b), suspend, resume]).dueCards).toBe(2);
  });

  it('con las tarjetas activas solo cuentan las de los mazos que se siguen y no están borradas', () => {
    const events = [reviewed(a), reviewed(b)];
    expect(snapshotOf(events, new Set([a])).dueCards).toBe(1);
    expect(snapshotOf(events, new Set()).dueCards).toBe(0);
  });

  it('un repaso pospuesto deja de contar hoy y uno adelantado empieza a contar', () => {
    const late = new Date(minute(60 * 24 * 5)).toISOString();
    const soon = new Date(minute(1)).toISOString();
    const moved = (cardId: string, from: string, to: string, at: number) =>
      event(
        'cards_rescheduled',
        { kind: 'postpone', cards: [{ cardId, from, to }], days: 5, undoes: null },
        at,
      );
    const due = new Date(minute(60)).toISOString();
    // a vence hoy y se pospone. b estaba lejos y se adelanta
    const far = (cardId: string): AppEvent =>
      event(
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
          stateAfter: state({ due: late }),
        },
        minute(10),
      );
    const events = [
      reviewed(a),
      far(b),
      moved(a, due, late, minute(20)),
      moved(b, late, soon, minute(21)),
    ];
    expect(snapshotOf(events).dueCards).toBe(1);
    expect(snapshotOf([reviewed(a), far(b)]).dueCards).toBe(1);
  });
});
