import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { FsrsCardState } from '@/data/schemas/common';
import { FORECAST_DAYS, FORECAST_MAX_COUNT, forecastDue, type ForecastInput } from './dueForecast';
import { buildDailyQueue, type QueueCard, type SchedulerConfig } from './fsrs';
import { addDays, studyDayEnd, studyDayOf, studyDayStart } from './studyDay';

const ZONE = 'America/Merida';
// Un martes 21 de octubre de 2026 a las 10 de la mañana en Mérida (UTC-6 todo el año)
const NOW = new Date('2026-10-21T16:00:00.000Z');
const TODAY = studyDayOf(NOW, ZONE);

const configOf = (reviewsPerDay = 200, newCardsPerDay = 20): SchedulerConfig => ({
  desiredRetention: 0.9,
  examDate: null,
  timeZone: ZONE,
  thresholds: { ...DEFAULT_THRESHOLDS.fsrs, reviewsPerDay, newCardsPerDay },
});

const state = (dueAt: Date, kind: FsrsCardState['state'] = 'review'): FsrsCardState => ({
  state: kind,
  due: dueAt.toISOString(),
  stability: 5,
  difficulty: 5,
  learningSteps: 0,
  scheduledDays: 5,
  reps: 3,
  lapses: 0,
  lastReview: new Date(dueAt.getTime() - 5 * 86_400_000).toISOString(),
});

/** Una tarjeta que vence en el día de estudio que sigue a today + offset, a mediodía */
const dueOn = (offset: number): FsrsCardState =>
  state(new Date(studyDayStart(addDays(TODAY, offset), ZONE).getTime() + 8 * 3_600_000));

const card = (id: string, noteId: string, st: FsrsCardState | null): QueueCard => ({
  cardId: id,
  noteId,
  state: st,
});

const NOTHING_TODAY = { newCount: 0, reviewCount: 0, noteIds: [] as string[] };
const input = (cards: QueueCard[], extra: Partial<ForecastInput> = {}): ForecastInput => ({
  cards,
  now: NOW,
  config: configOf(),
  reviewedToday: NOTHING_TODAY,
  ...extra,
});

describe('forecastDue', () => {
  it('sin tarjetas da catorce días en cero y ninguna nueva', () => {
    const result = forecastDue(input([]));
    expect(result.days).toHaveLength(FORECAST_DAYS);
    expect(result.days.map((entry) => entry.due)).toEqual(Array(FORECAST_DAYS).fill(0));
    expect(result.days[0]?.day).toBe(TODAY);
    expect(result.days.at(-1)?.day).toBe(addDays(TODAY, 13));
    expect(result.newAvailable).toBe(0);
  });

  it('las atrasadas y las de hoy cuentan hoy, y las de después se acumulan día con día', () => {
    const cards = [
      card('a', 'n1', dueOn(-5)),
      card('b', 'n2', dueOn(0)),
      card('c', 'n3', dueOn(1)),
      card('d', 'n4', dueOn(3)),
      card('e', 'n5', dueOn(3)),
      card('f', 'n6', dueOn(20)),
    ];
    const due = forecastDue(input(cards)).days.map((entry) => entry.due);
    expect(due.slice(0, 5)).toEqual([2, 3, 3, 5, 5]);
    // La que vence en 20 días no entra en la ventana de 14
    expect(due.at(-1)).toBe(5);
  });

  it('cuenta igual que la cola de Repasar: una sola tarjeta por nota y las nuevas no cuentan como vencidas', () => {
    const cards = [
      card('a', 'n1', dueOn(0)),
      card('b', 'n1', dueOn(0)),
      card('c', 'n2', dueOn(-1)),
      card('d', 'n3', null),
      card('e', 'n4', state(NOW, 'new')),
    ];
    const result = forecastDue(input(cards));
    expect(result.days[0]?.due).toBe(2);
    expect(result.newAvailable).toBe(2);
    // Mañana la hermana ya no estorba, pero sigue siendo una nota
    expect(result.days[1]?.due).toBe(2);
  });

  it('el límite de repasos por día corta la cuenta, también en los días siguientes', () => {
    const cards = Array.from({ length: 30 }, (_, index) =>
      card(`c${String(index)}`, `n${String(index)}`, dueOn((index % 3) - 1)),
    );
    const result = forecastDue(input(cards, { config: configOf(12, 20) }));
    expect(result.days.slice(0, 4).map((entry) => entry.due)).toEqual([12, 12, 12, 12]);
  });

  it('lo que ya repasó hoy baja el límite de hoy y entierra sus notas', () => {
    const cards = [card('a', 'n1', dueOn(0)), card('b', 'n2', dueOn(0)), card('c', 'n3', dueOn(0))];
    const done = { newCount: 0, reviewCount: 1, noteIds: ['n1'] };
    const result = forecastDue(input(cards, { reviewedToday: done, config: configOf(2, 20) }));
    // Quedan dos por límite (2 - 1 = 1 repaso más), y n1 ya salió hoy
    expect(result.days[0]?.due).toBe(1);
    // Mañana vuelve a valer el límite entero y n1 vuelve a contar
    expect(result.days[1]?.due).toBe(2);
  });

  it('las nuevas disponibles siguen el tope y lo que ya introdujo hoy', () => {
    const cards = Array.from({ length: 30 }, (_, index) =>
      card(`c${String(index)}`, `n${String(index)}`, null),
    );
    expect(forecastDue(input(cards, { config: configOf(200, 10) })).newAvailable).toBe(10);
    expect(
      forecastDue(
        input(cards, {
          config: configOf(200, 10),
          reviewedToday: { newCount: 4, reviewCount: 0, noteIds: [] },
        }),
      ).newAvailable,
    ).toBe(6);
    expect(forecastDue(input(cards, { config: configOf(200, 0) })).newAvailable).toBe(0);
  });

  it('el corte de las 4 de la mañana decide a qué día pertenece una tarjeta', () => {
    // Las 3:30 de la madrugada de mañana todavía es hoy para el alumno. Las 4:30 ya es mañana
    const tomorrowStart = studyDayStart(addDays(TODAY, 1), ZONE).getTime();
    const before = card('a', 'n1', state(new Date(tomorrowStart - 30 * 60_000)));
    const after = card('b', 'n2', state(new Date(tomorrowStart + 30 * 60_000)));
    const result = forecastDue(input([before, after]));
    expect(result.days.slice(0, 3).map((entry) => entry.due)).toEqual([1, 2, 2]);
  });

  it('el día 1 empieza justo al terminar el día de estudio de hoy', () => {
    const end = studyDayEnd(TODAY, ZONE).getTime();
    const edge = card('a', 'n1', state(new Date(end)));
    const result = forecastDue(input([edge]));
    expect(result.days[0]?.due).toBe(0);
    expect(result.days[1]?.due).toBe(1);
  });

  it('con otra zona el mismo instante cae en otro día', () => {
    const tijuana = { ...configOf(), timeZone: 'America/Tijuana' };
    // 02:00 UTC del 22 son las 19:00 del 21 en Tijuana (UTC-7) y las 20:00 en Mérida
    const late = new Date('2026-10-22T02:00:00.000Z');
    const cards = [card('a', 'n1', state(late))];
    const merida = forecastDue(input(cards, { now: new Date('2026-10-21T12:00:00.000Z') }));
    const tj = forecastDue(
      input(cards, { now: new Date('2026-10-21T12:00:00.000Z'), config: tijuana }),
    );
    expect(merida.days[0]?.day).toBe('2026-10-21');
    expect(merida.days[0]?.due).toBe(1);
    expect(tj.days[0]?.due).toBe(1);
    // El primer día en que Tijuana aún no la tiene vencida es antes que en Mérida
    expect(tj.days[0]?.day).toBe('2026-10-21');
  });

  it('sin tope de nuevas ni de repasos nunca pasa del máximo que acepta el servidor', () => {
    const cards = Array.from({ length: 300 }, (_, index) =>
      card(`c${String(index)}`, `n${String(index)}`, null),
    );
    const result = forecastDue(input(cards, { config: configOf(10_000_000, 10_000_000) }));
    expect(result.newAvailable).toBeLessThanOrEqual(FORECAST_MAX_COUNT);
    expect(
      forecastDue(input([], { config: configOf(10_000_000, 20) })).days.every(
        (entry) => entry.due <= FORECAST_MAX_COUNT,
      ),
    ).toBe(true);
  });

  it('un número de días distinto cambia el largo de la lista', () => {
    expect(forecastDue(input([], { days: 3 })).days).toHaveLength(3);
    expect(forecastDue(input([], { days: 0 })).days).toHaveLength(1);
  });
});

describe('forecastDue contra la cola de Repasar', () => {
  const cardArb = fc.record({
    note: fc.integer({ min: 0, max: 25 }),
    kind: fc.constantFrom('new', 'seen'),
    // Días respecto a hoy, de muy atrasada a muy lejana, y horas del día
    offset: fc.integer({ min: -40, max: 30 }),
    hour: fc.integer({ min: 0, max: 23 }),
  });

  it('cada día coincide con la cola que armaría Repasar ese día sin haber repasado nada', () => {
    fc.assert(
      fc.property(
        fc.array(cardArb, { maxLength: 60 }),
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 0, max: 30 }),
        (specs, reviewsPerDay, newPerDay) => {
          const cards = specs.map((spec, index) =>
            card(
              `c${String(index)}`,
              `n${String(spec.note)}`,
              spec.kind === 'new'
                ? null
                : state(
                    new Date(
                      studyDayStart(addDays(TODAY, spec.offset), ZONE).getTime() +
                        spec.hour * 3_600_000,
                    ),
                  ),
            ),
          );
          const config = configOf(reviewsPerDay, newPerDay);
          const forecast = forecastDue({ cards, now: NOW, config, reviewedToday: NOTHING_TODAY });
          forecast.days.forEach((entry, offset) => {
            const queue = buildDailyQueue({
              cards,
              // Un momento a media mañana de ese día, sin repasos hechos
              now: new Date(studyDayStart(entry.day, ZONE).getTime() + 3 * 3_600_000),
              config,
              reviewedToday: NOTHING_TODAY,
            });
            expect(entry.due, `día ${String(offset)}`).toBe(queue.reviews.length);
          });
          const today = buildDailyQueue({ cards, now: NOW, config, reviewedToday: NOTHING_TODAY });
          expect(forecast.newAvailable).toBe(today.newCards.length);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('con repasos hechos hoy, hoy sigue coincidiendo con la cola', () => {
    fc.assert(
      fc.property(
        fc.array(cardArb, { maxLength: 40 }),
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 10 }),
        fc.array(fc.integer({ min: 0, max: 25 }), { maxLength: 6 }),
        (specs, doneReviews, doneNew, doneNotes) => {
          const cards = specs.map((spec, index) =>
            card(
              `c${String(index)}`,
              `n${String(spec.note)}`,
              spec.kind === 'new'
                ? null
                : state(
                    new Date(
                      studyDayStart(addDays(TODAY, spec.offset), ZONE).getTime() + 3_600_000,
                    ),
                  ),
            ),
          );
          const reviewedToday = {
            newCount: doneNew,
            reviewCount: doneReviews,
            noteIds: [...new Set(doneNotes)].map((note) => `n${String(note)}`),
          };
          const config = configOf(12, 8);
          const forecast = forecastDue({ cards, now: NOW, config, reviewedToday });
          const queue = buildDailyQueue({ cards, now: NOW, config, reviewedToday });
          expect(forecast.days[0]?.due).toBe(queue.reviews.length);
          expect(forecast.newAvailable).toBe(queue.newCards.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('nunca baja de un día al siguiente cuando no hay límite que lo corte', () => {
    fc.assert(
      fc.property(fc.array(cardArb, { maxLength: 50 }), (specs) => {
        const cards = specs.map((spec, index) =>
          card(
            `c${String(index)}`,
            `n${String(spec.note)}`,
            spec.kind === 'new'
              ? null
              : state(
                  new Date(studyDayStart(addDays(TODAY, spec.offset), ZONE).getTime() + 3_600_000),
                ),
          ),
        );
        const { days } = forecastDue({
          cards,
          now: NOW,
          config: configOf(100_000, 20),
          reviewedToday: NOTHING_TODAY,
        });
        for (let index = 1; index < days.length; index += 1) {
          expect(days[index]?.due ?? 0).toBeGreaterThanOrEqual(days[index - 1]?.due ?? 0);
        }
      }),
      { numRuns: 80 },
    );
  });
});
