import { describe, expect, it } from 'vitest';
import { newId } from '@/data/testing/fixtures';
import { newCardsStudiedToday } from '@/engines/dailyPlan';
import { reviewedToday } from '../review/study';
import { event, state } from '../tutor/testing/fixtures';

// Las nuevas del plan de hoy cuentan también lo estudiado por tema, y el cupo de la cola no
const TODAY = '2026-10-08';
const at = new Date('2026-10-08T15:00:00.000Z').getTime();
const deck = newId();

const reviewed = (cardId: string, stateBefore: ReturnType<typeof state> | null, extra?: boolean) =>
  event(
    'card_reviewed',
    {
      cardId,
      deckId: deck,
      source: 'card',
      rating: 'good',
      confidence: null,
      msToReveal: 1000,
      msToRate: 1000,
      stateBefore,
      stateAfter: state(),
      ...(extra === undefined ? {} : { extra }),
    },
    at,
  );

describe('newCardsStudiedToday', () => {
  const [c1, c2, c3] = [newId(), newId(), newId()] as const;

  it('cuenta las nuevas de una sesión por tema, que reviewedToday deja fuera', () => {
    const events = [
      reviewed(c1, null),
      reviewed(c2, state(), false),
      reviewed(c3, null, true),
      reviewed(c3, state(), true),
    ];
    // El plan ve las dos nuevas, la de la cola y la de la sesión por tema
    expect(newCardsStudiedToday(events, TODAY)).toBe(2);
    // El cupo de la cola sigue contando una sola
    expect(reviewedToday(events, TODAY, new Map()).newCount).toBe(1);
  });

  it('solo cuenta las de hoy y las que no tenían estado o estaban en new', () => {
    const yesterday = new Date('2026-10-07T15:00:00.000Z').getTime();
    const events = [
      reviewed(c1, { ...state(), state: 'new' }),
      reviewed(c2, state()),
      event(
        'card_reviewed',
        {
          cardId: c3,
          deckId: deck,
          source: 'card',
          rating: 'good',
          confidence: null,
          msToReveal: 1000,
          msToRate: 1000,
          stateBefore: null,
          stateAfter: state(),
        },
        yesterday,
      ),
    ];
    expect(newCardsStudiedToday(events, TODAY)).toBe(1);
  });
});
