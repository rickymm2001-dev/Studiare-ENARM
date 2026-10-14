import { describe, expect, it } from 'vitest';
import type { FsrsCardState } from '@/data/schemas/common';
import type { AppEvent } from '@/data/schemas/events';
import { addMonths, monthlyReviewLoad } from './monthlyLoad';

const TZ = 'America/Mexico_City';
const USER = '01J0000000000000000000USER';
let counter = 0;

/** Un instante a mediodía de Ciudad de México, que es el mismo día de estudio */
const noon = (day: string) => `${day}T18:00:00.000Z`;

function state(due: string): FsrsCardState {
  return {
    due,
    stability: 5,
    difficulty: 6,
    scheduledDays: 10,
    learningSteps: 0,
    reps: 4,
    lapses: 0,
    state: 'review',
    lastReview: null,
  };
}

function reviewed(cardId: string, day: string, dueDay: string): AppEvent {
  counter += 1;
  return {
    id: `01J00000000000000000000${String(counter).padStart(3, '0')}`,
    userId: USER,
    at: noon(day),
    tz: TZ,
    schemaVersion: 1,
    sessionId: null,
    type: 'card_reviewed',
    payload: {
      cardId,
      deckId: '01J000000000000000000DECK1',
      source: 'card',
      rating: 'good',
      confidence: null,
      msToReveal: 1000,
      msToRate: 1000,
      stateBefore: null,
      stateAfter: state(noon(dueDay)),
    },
  };
}

function moved(cardId: string, day: string, from: string, to: string): AppEvent {
  counter += 1;
  return {
    id: `01J00000000000000000000${String(counter).padStart(3, '0')}`,
    userId: USER,
    at: noon(day),
    tz: TZ,
    schemaVersion: 1,
    sessionId: null,
    type: 'cards_rescheduled',
    payload: {
      kind: 'postpone',
      cards: [{ cardId, from: noon(from), to: noon(to) }],
      days: 3,
      undoes: null,
    },
  };
}

const load = (events: AppEvent[], extra: { activeCardIds?: Set<string>; today?: string } = {}) =>
  monthlyReviewLoad({
    events,
    timeZone: TZ,
    today: extra.today ?? '2026-10-15',
    monthsBack: 2,
    monthsAhead: 2,
    ...(extra.activeCardIds ? { activeCardIds: extra.activeCardIds } : {}),
  });

const byMonth = (result: ReturnType<typeof load>) =>
  Object.fromEntries(result.points.map((point) => [point.month, point]));

describe('addMonths', () => {
  it('cruza el año hacia adelante y hacia atrás', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-10', 0)).toBe('2026-10');
  });
});

describe('carga de repaso por mes', () => {
  it('da cinco meses, dos antes y dos después del actual, sin realizados en el futuro', () => {
    const result = load([]);
    expect(result.points.map((point) => point.month)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
    expect(result.points.map((point) => point.done)).toEqual([0, 0, 0, null, null]);
    expect(result.hasData).toBe(false);
    expect(result.averagePerDayThisMonth).toBe(0);
  });

  it('cuenta los repasos hechos en su mes y el promedio por día del mes actual', () => {
    const events = [
      reviewed('a', '2026-09-10', '2026-09-20'),
      reviewed('a', '2026-09-20', '2026-10-05'),
      reviewed('a', '2026-10-05', '2026-11-01'),
      reviewed('b', '2026-10-06', '2026-10-30'),
    ];
    const result = byMonth(load(events));
    expect(result['2026-09']?.done).toBe(2);
    expect(result['2026-10']?.done).toBe(2);
    // Dos repasos en los 15 días que van de octubre
    expect(load(events).averagePerDayThisMonth).toBe(0);
    const many = Array.from({ length: 45 }, (_, index) =>
      reviewed(`c${String(index)}`, '2026-10-10', '2026-11-10'),
    );
    expect(load(many).averagePerDayThisMonth).toBe(3);
  });

  it('una cita cuenta como programada si llegó su día, y la última cuenta aunque no haya llegado', () => {
    const events = [
      reviewed('a', '2026-09-10', '2026-09-20'),
      // Se repasó tarde, el 25. La cita del 20 sí estaba programada en septiembre
      reviewed('a', '2026-09-25', '2026-11-02'),
    ];
    const result = byMonth(load(events));
    expect(result['2026-09']?.scheduled).toBe(1);
    expect(result['2026-11']?.scheduled).toBe(1);
    expect(result['2026-10']?.scheduled).toBe(0);
  });

  it('una cita que se adelantó o se cambió de fecha antes de llegar no cuenta, cuenta la nueva', () => {
    const early = [
      reviewed('a', '2026-10-01', '2026-10-20'),
      // Se repasó antes de tiempo, la cita del 20 ya no cuenta
      reviewed('a', '2026-10-10', '2026-12-01'),
    ];
    expect(byMonth(load(early))['2026-10']?.scheduled).toBe(0);
    expect(byMonth(load(early))['2026-12']?.scheduled).toBe(1);

    const postponed = [
      reviewed('b', '2026-10-01', '2026-10-20'),
      moved('b', '2026-10-12', '2026-10-20', '2026-11-03'),
    ];
    expect(byMonth(load(postponed))['2026-10']?.scheduled).toBe(0);
    expect(byMonth(load(postponed))['2026-11']?.scheduled).toBe(1);
  });

  it('una cita vencida que no se repasó sigue contando en su mes', () => {
    const result = byMonth(load([reviewed('a', '2026-08-01', '2026-09-03')]));
    expect(result['2026-09']?.scheduled).toBe(1);
    expect(result['2026-09']?.done).toBe(0);
  });

  it('no programa a futuro tarjetas suspendidas ni de mazos que ya no se siguen', () => {
    const events = [
      reviewed('a', '2026-10-01', '2026-11-05'),
      reviewed('b', '2026-10-01', '2026-11-05'),
    ];
    expect(byMonth(load(events))['2026-11']?.scheduled).toBe(2);
    expect(byMonth(load(events, { activeCardIds: new Set(['a']) }))['2026-11']?.scheduled).toBe(1);
    counter += 1;
    const suspend = {
      id: `01J00000000000000000000${String(counter).padStart(3, '0')}`,
      userId: USER,
      at: noon('2026-10-02'),
      tz: TZ,
      schemaVersion: 1,
      sessionId: null,
      type: 'cards_suspended',
      payload: { cardIds: ['b'], reason: 'manual' },
    } as AppEvent;
    expect(byMonth(load([...events, suspend]))['2026-11']?.scheduled).toBe(1);
  });

  it('una tarjeta reiniciada se queda sin cita, y la de antes cuenta solo si ya había llegado (B4)', () => {
    counter += 1;
    const reset = (day: string) =>
      ({
        id: `01J00000000000000000000${String(counter).padStart(3, '0')}`,
        userId: USER,
        at: noon(day),
        tz: TZ,
        schemaVersion: 1,
        sessionId: null,
        type: 'cards_reset',
        payload: { cardIds: ['a'] },
      }) as AppEvent;
    // Se reinició antes de su cita de noviembre, que ya no cuenta
    const early = [reviewed('a', '2026-10-01', '2026-11-05'), reset('2026-10-10')];
    expect(byMonth(load(early))['2026-11']?.scheduled).toBe(0);
    // Se reinició después de su cita del 3 de octubre, que sí estaba programada
    const late = [reviewed('a', '2026-09-20', '2026-10-03'), reset('2026-10-10')];
    expect(byMonth(load(late))['2026-10']?.scheduled).toBe(1);
    // Reiniciar una tarjeta que nunca se repasó no cuenta nada
    expect(load([reset('2026-10-10')]).points.every((point) => point.scheduled === 0)).toBe(true);
  });

  it('lo que cae fuera de los cinco meses no se cuenta', () => {
    const result = load([reviewed('a', '2026-03-01', '2027-06-01')]);
    expect(result.points.every((point) => point.scheduled === 0)).toBe(true);
    expect(result.points.every((point) => (point.done ?? 0) === 0)).toBe(true);
    expect(result.hasData).toBe(true);
  });

  it('usa el día de estudio, que corta a las 4 de la mañana', () => {
    // El 1 de noviembre a las 2 a. m. en Ciudad de México sigue siendo el día de estudio del 31
    const lateNight = {
      ...reviewed('a', '2026-10-31', '2026-12-15'),
      at: '2026-11-01T08:00:00.000Z',
    };
    expect(byMonth(load([lateNight] as AppEvent[]))['2026-10']?.done).toBe(1);
  });
});
