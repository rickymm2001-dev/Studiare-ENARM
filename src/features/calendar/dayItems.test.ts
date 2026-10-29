// Las piezas de cada día del Calendario (D-150). Qué entra, en qué orden y a dónde lleva Empezar ahora.
import { describe, expect, it } from 'vitest';
import type { SessionDone, StudyWeek } from '@/engines/studyCalendar';
import { t } from '@/i18n/es-MX';
import { itemsForDay, startTarget, type DayContext } from './dayItems';

const text = t.calendar;

const week: StudyWeek = {
  start: '2026-10-19',
  end: '2026-10-25',
  branch: 'pediatrics',
  simulatorSunday: '2026-10-25',
  simulatorNumber: 3,
  examWeek: false,
};

const session = (kind: SessionDone['kind'], items: number): SessionDone => ({
  day: '2026-10-24',
  kind,
  items,
  correct: 10,
  durationMs: 24 * 60_000,
  reason: 'completed',
});

const context: DayContext = {
  today: '2026-10-24',
  forecast: new Map([
    ['2026-10-24', { day: '2026-10-24', reviews: 38, newCards: 5 }],
    ['2026-10-27', { day: '2026-10-27', reviews: 44, newCards: 0 }],
    ['2026-10-20', { day: '2026-10-20', reviews: 9, newCards: 0 }],
  ]),
  activity: { '2026-10-24': { cards: 12 }, '2026-10-20': { cards: 7 }, '2026-10-30': { cards: 3 } },
  sessions: new Map([
    ['2026-10-24', [session('practice', 20), session('review', 12), session('exam', 0)]],
  ]),
  weeks: [week],
  examDate: '2027-09-13',
  challenges: new Map([['2026-10-25', [{ title: 'Cien preguntas' }]]]),
};

describe('itemsForDay', () => {
  it('hoy junta lo hecho, lo programado y las sesiones, sin las de repaso ni las vacías', () => {
    const items = itemsForDay('2026-10-24', context);
    expect(items.map((item) => item.kind)).toEqual(['done', 'reviews', 'newCards', 'session']);
    expect(items[0]).toMatchObject({ short: text.done(12), title: text.doneLong(12) });
    expect(items[1]).toMatchObject({
      short: text.pills.reviews(38),
      long: text.forecastLong(38),
      hint: text.todayPlan.reviewsHint,
    });
    expect(items[3]).toMatchObject({
      short: 'Simulador 20',
      long: text.pills.sessionLong('practice', 20),
      hint: text.todayPlan.sessionHint(24),
    });
  });

  it('un día pasado no muestra proyección y uno futuro no muestra tarjetas hechas', () => {
    expect(itemsForDay('2026-10-20', context).map((item) => item.kind)).toEqual(['done']);
    expect(itemsForDay('2026-10-30', context).map((item) => item.kind)).toEqual([]);
    expect(itemsForDay('2026-10-27', context).map((item) => item.kind)).toEqual(['reviews']);
  });

  it('el domingo de simulador del plan, el examen y el reto de Party entran con su texto', () => {
    const sunday = itemsForDay('2026-10-25', context);
    expect(sunday.map((item) => item.kind)).toEqual(['planSimulator', 'party']);
    expect(sunday[0]).toMatchObject({ short: text.pills.planSimulator, long: text.simulatorLong });
    expect(sunday[1]).toMatchObject({
      short: text.pills.party,
      long: text.pills.partyLong('Cien preguntas'),
      title: 'Cien preguntas',
    });
    expect(itemsForDay('2027-09-13', context)).toEqual([
      {
        kind: 'exam',
        short: text.examShort,
        long: text.examLong,
        title: text.examLong,
        hint: null,
      },
    ]);
  });
});

describe('startTarget', () => {
  it('hoy con repasos lleva a Repasar, sin repasos al simulador y otro día no lleva a nada', () => {
    const today = itemsForDay('2026-10-24', context);
    expect(startTarget('2026-10-24', '2026-10-24', today)).toBe('review');
    expect(startTarget('2026-10-24', '2026-10-24', [])).toBe('simulatorSetup');
    expect(startTarget('2026-10-27', '2026-10-24', itemsForDay('2026-10-27', context))).toBeNull();
  });
});
