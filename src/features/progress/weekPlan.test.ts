import { describe, expect, it } from 'vitest';
import { createEvent } from '@/data/events/createEvent';
import type { Card, Deck } from '@/data/schemas/decks';
import type { AppEvent, EventPayload, EventType } from '@/data/schemas/events';
import { UserSettingsSchema, type User } from '@/data/schemas/people';
import { makeUser, newId } from '@/data/testing/fixtures';
import { scheduleReview } from '@/engines/fsrs';
import { addDays } from '@/engines/studyDay';
import { schedulerConfig } from '../review/schedulerConfig';
import { buildWeekPlan } from './weekPlan';

// Martes 6 de octubre a las 9 de la mañana en Mérida, ya dentro del día de estudio
const NOW = new Date('2026-10-06T15:00:00.000Z');
const TODAY = '2026-10-06';
const CREATED = '2026-10-01T15:00:00.000Z';

const sessionOf = (user: User) => ({ user, settings: user.settings, isDemo: false });

function deckOf(ownerId: string): Deck {
  return {
    id: newId(),
    name: 'Mazo',
    description: '',
    ownerId,
    origin: 'manual',
    visibility: 'private',
    isDemo: false,
    createdAt: CREATED,
  };
}

const cardsOf = (deck: Deck, count: number): Card[] =>
  Array.from({ length: count }, () => ({
    id: newId(),
    noteId: newId(),
    deckId: deck.id,
    ordinal: 0,
    createdAt: CREATED,
  }));

function eventOf<T extends EventType>(
  user: User,
  type: T,
  payload: EventPayload<T>,
  at: Date,
): AppEvent {
  return createEvent(type, payload, {
    userId: user.id,
    tz: user.timeZone,
    clock: { now: () => at },
  });
}

/** Una tarjeta nueva que el alumno vio por primera vez en el momento dado */
function firstReview(user: User, card: Card, at: Date): AppEvent {
  return eventOf(
    user,
    'card_reviewed',
    {
      cardId: card.id,
      deckId: card.deckId,
      source: 'card',
      rating: 'good',
      confidence: null,
      msToReveal: 2000,
      msToRate: 1000,
      stateBefore: null,
      stateAfter: scheduleReview(null, 'good', at, schedulerConfig(sessionOf(user)), card.id).state,
    },
    at,
  );
}

const answered = (user: User, at: Date) =>
  eventOf(
    user,
    'question_answered',
    {
      questionVersionId: newId(),
      optionVersionId: newId(),
      correct: true,
      confidence: null,
      msToAnswer: 30_000,
      changeCount: 0,
      highlightEnabled: false,
    },
    at,
  );

const studied = (user: User, minutes: number, at: Date) =>
  eventOf(
    user,
    'session_ended',
    {
      kind: 'review',
      reason: 'completed',
      items: 2,
      correct: null,
      durationMs: minutes * 60_000,
      xp: 0,
    },
    at,
  );

const plan = (user: User, input: Partial<Parameters<typeof buildWeekPlan>[0]> = {}) =>
  buildWeekPlan({
    now: NOW,
    session: sessionOf(user),
    events: [],
    decks: [],
    cards: [],
    subscription: null,
    reservedQuestions: 0,
    ...input,
  });

const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

describe('semana de Progreso', () => {
  it('arma los 7 días del plan desde hoy, con lo hecho de hoy y nada en los que vienen', () => {
    const user = makeUser({ dailyMinutes: 60 });
    const deck = deckOf(user.id);
    const cards = cardsOf(deck, 6);
    const [first, second] = cards as [Card, Card];
    const events = [
      firstReview(user, first, minutesAgo(30)),
      firstReview(user, second, minutesAgo(29)),
      answered(user, minutesAgo(20)),
      studied(user, 20, minutesAgo(10)),
    ];
    const week = plan(user, { events, decks: [deck], cards });

    expect(week.today).toBe(TODAY);
    expect(week.days.map((day) => day.plan.day)).toEqual(
      Array.from({ length: 7 }, (_, index) => addDays(TODAY, index)),
    );
    expect(week.days.map((day) => day.isToday)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    // Lo hecho hoy sale de la bitácora con las cuentas de Inicio
    expect(week.days[0]?.done).toEqual({ cards: 2, questions: 1, minutes: 20 });
    for (const day of week.days.slice(1)) {
      expect(day.done).toEqual({ cards: 0, questions: 0, minutes: 0 });
    }
    // Lo planeado de hoy ya descuenta lo hecho. Quedan 4 nuevas y 40 de los 60 minutos
    expect(week.days[0]?.plan).toMatchObject({
      newCards: 4,
      minutesUsed: 20,
      minutesAvailable: 60,
    });
    expect(week.days[0]?.plan.minutesPlanned).toBeLessThanOrEqual(40);
    expect(week.view.cardCount).toBe(6);
  });

  it('deja fuera las tarjetas suspendidas y las de mazos que no sigue', () => {
    const user = makeUser({ dailyMinutes: 60 });
    const own = deckOf(user.id);
    const other = deckOf(newId());
    const mine = cardsOf(own, 3);
    const events = [
      eventOf(
        user,
        'cards_suspended',
        { cardIds: [mine[0]?.id ?? ''], reason: 'manual' },
        minutesAgo(5),
      ),
    ];
    const week = plan(user, {
      events,
      decks: [own, other],
      cards: [...mine, ...cardsOf(other, 4)],
    });
    expect(week.view.cardCount).toBe(2);
    expect(week.days[0]?.plan.newCards).toBe(2);
  });

  it('con el plan Gratis recorta la práctica a su límite y un examen abierto aparta las de hoy', () => {
    const user = makeUser({ dailyMinutes: 240 });
    const free = plan(user);
    expect(free.questionLimit).toBe(20);
    expect(free.days[0]?.plan).toMatchObject({ simulatorQuestions: 20, simulatorCapped: true });

    const examOpen = plan(user, { reservedQuestions: 20 });
    expect(examOpen.days[0]?.plan).toMatchObject({ simulatorQuestions: 0, simulatorCapped: true });
    expect(examOpen.days[1]?.plan.simulatorQuestions).toBe(20);

    const paid = plan(user, { subscription: { plan: 'monthly', status: 'active' } });
    expect(paid.questionLimit).toBeNull();
    expect(paid.days.some((day) => day.plan.simulatorCapped)).toBe(false);
  });

  it('sin límite de nuevas la propuesta de bajarlas parte del número guardado', () => {
    const settings = UserSettingsSchema.parse({ unlimitedNewCards: true, newCardsPerDay: 30 });
    const user = makeUser({ dailyMinutes: 5, settings });
    const deck = deckOf(user.id);
    const week = plan(user, { decks: [deck], cards: cardsOf(deck, 200) });
    const reduce = week.view.plan.warnings[0]?.options.find(
      (option) => option.action === 'reduce_new',
    );
    expect(reduce?.value).toBe(15);

    // Si no tenía un número guardado, parte de 20
    const none = makeUser({
      dailyMinutes: 5,
      settings: UserSettingsSchema.parse({ unlimitedNewCards: true, newCardsPerDay: 0 }),
    });
    const noneDeck = deckOf(none.id);
    const fallback = plan(none, { decks: [noneDeck], cards: cardsOf(noneDeck, 200) });
    expect(
      fallback.view.plan.warnings[0]?.options.find((option) => option.action === 'reduce_new')
        ?.value,
    ).toBe(10);
  });
});
