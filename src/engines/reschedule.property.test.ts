// Propiedades de los atrasos de repaso (D-085, fila 5) con fast-check
// - Repartir nunca pierde ni duplica tarjetas y todas las asignaciones cambian de fecha
// - Respeta la capacidad de cada día, reparte parejo y manda las más olvidadas primero
// - Ninguna acción mueve una tarjeta nueva ni pasa del inicio del día del ENARM
// - El resultado no depende del orden de entrada y deshacer regresa cada fecha original
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { FsrsCardState } from '@/data/schemas/common';
import {
  examDeadline,
  newCardState,
  retrievabilityOf,
  type QueueCard,
  type SchedulerConfig,
} from './fsrs';
import {
  advanceReviews,
  overdueCards,
  postponeCards,
  rescheduleBatches,
  spreadOverdue,
  summarizeOverdue,
  undoAssignments,
  type RescheduledCard,
} from './reschedule';
import { addDays, daysBetween, studyDayEnd, studyDayOf, studyDayStart } from './studyDay';

const TZ = 'America/Merida';
const MINUTE = 60 * 1000;
const BASE = new Date('2026-10-08T00:00:00.000Z').getTime();

type Kind = 'unseen' | 'new' | 'learning' | 'review' | 'relearning';
type Anchor = 'now' | 'todayStart' | 'todayEnd';

const specArbitrary = fc.record({
  kind: fc.constantFrom<Kind>('unseen', 'new', 'learning', 'review', 'relearning'),
  anchor: fc.constantFrom<Anchor>('now', 'todayStart', 'todayEnd'),
  // Mitad de los vencimientos caen a uno o dos minutos de un borde del día de estudio
  offsetMinutes: fc.oneof(
    fc.integer({ min: -60 * 24 * 40, max: 60 * 24 * 40 }),
    fc.integer({ min: -2, max: 2 }),
  ),
  stability: fc.double({ min: 0.5, max: 200, noNaN: true }),
  order: fc.nat(),
});

const scenarioArbitrary = fc.record({
  specs: fc.array(specArbitrary, { maxLength: 80 }),
  days: fc.integer({ min: -2, max: 12 }),
  reviewsPerDay: fc.integer({ min: 0, max: 30 }),
  // Tres días de relojes distintos, así se cruza el corte de las 4 a. m. locales
  nowMinutes: fc.integer({ min: 0, max: 60 * 24 * 3 }),
  examOffset: fc.option(fc.integer({ min: -2, max: 15 }), { nil: null }),
});

type Scenario = typeof scenarioArbitrary extends fc.Arbitrary<infer T> ? T : never;

interface Built {
  now: Date;
  config: SchedulerConfig;
  cards: QueueCard[];
  /** Las mismas tarjetas en otro orden, definido por el campo order de cada una */
  shuffled: QueueCard[];
  today: string;
  todayStart: number;
  todayEnd: number;
}

function build(scenario: Scenario): Built {
  const now = new Date(BASE + scenario.nowMinutes * MINUTE);
  const today = studyDayOf(now, TZ);
  const todayStart = studyDayStart(today, TZ).getTime();
  const todayEnd = studyDayEnd(today, TZ).getTime();
  const anchors: Record<Anchor, number> = { now: now.getTime(), todayStart, todayEnd };
  const config: SchedulerConfig = {
    desiredRetention: 0.9,
    examDate: scenario.examOffset === null ? null : addDays(today, scenario.examOffset),
    timeZone: TZ,
    thresholds: { ...DEFAULT_THRESHOLDS.fsrs, reviewsPerDay: scenario.reviewsPerDay },
  };
  const entries = scenario.specs.map((spec, index) => {
    const cardId = `k${String(index).padStart(3, '0')}`;
    const due = new Date(anchors[spec.anchor] + spec.offsetMinutes * MINUTE).toISOString();
    let state: FsrsCardState | null;
    if (spec.kind === 'unseen') {
      state = null;
    } else if (spec.kind === 'new') {
      state = { ...newCardState(now), due };
    } else {
      const scheduledDays = Math.max(1, Math.round(spec.stability));
      state = {
        due,
        stability: spec.stability,
        difficulty: 5,
        scheduledDays,
        learningSteps: 0,
        reps: 4,
        lapses: 0,
        state: spec.kind,
        lastReview: new Date(Date.parse(due) - scheduledDays * 24 * 60 * MINUTE).toISOString(),
      };
    }
    return {
      card: { cardId, noteId: `n-${cardId}`, state } satisfies QueueCard,
      order: spec.order,
    };
  });
  const shuffled = [...entries]
    .sort((a, b) => a.order - b.order || (a.card.cardId < b.card.cardId ? 1 : -1))
    .map((entry) => entry.card);
  return {
    now,
    config,
    cards: entries.map((entry) => entry.card),
    shuffled,
    today,
    todayStart,
    todayEnd,
  };
}

const isScheduled = (card: QueueCard) => card.state !== null && card.state.state !== 'new';
const dueOf = (card: QueueCard) => Date.parse((card.state as FsrsCardState).due);
const compareTuples = (a: [number, string], b: [number, string]) =>
  a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);

const RUNS = { numRuns: 300 };

describe('propiedades de repartir atrasos', () => {
  it('no pierde ni duplica tarjetas y cada asignación cambia la fecha hacia adelante', () => {
    fc.assert(
      fc.property(scenarioArbitrary, (scenario) => {
        const { cards, now, config, todayStart } = build(scenario);
        const plan = spreadOverdue({ cards, now, config, days: scenario.days });
        const overdue = overdueCards(cards, now, TZ);
        const overdueIds = new Set(overdue.map((card) => card.cardId));
        const assigned = plan.assignments.map((entry) => entry.cardId);

        expect(new Set(assigned).size).toBe(assigned.length);
        for (const entry of plan.assignments) {
          expect(overdueIds.has(entry.cardId)).toBe(true);
          expect(entry.from).not.toBe(entry.to);
          expect(Date.parse(entry.to)).toBeGreaterThan(Date.parse(entry.from));
          expect(Date.parse(entry.from)).toBeLessThan(todayStart);
          expect(Object.keys(entry).sort()).toEqual(['cardId', 'from', 'to']);
        }

        const expectedDays = Math.min(
          Math.max(1, scenario.days),
          7,
          config.examDate === null ? 7 : daysBetween(studyDayOf(now, TZ), config.examDate),
        );
        if (expectedDays < 1) {
          expect(plan).toEqual({ assignments: [], perDay: [], overCapacity: false });
          return;
        }
        expect(plan.perDay).toHaveLength(expectedDays);
        expect(plan.perDay.reduce((sum, entry) => sum + entry.count, 0)).toBe(overdue.length);
        expect(plan.assignments).toHaveLength(overdue.length - (plan.perDay[0]?.count ?? 0));
      }),
      RUNS,
    );
  });

  it('respeta la capacidad de cada día, reparte parejo y manda las más olvidadas primero', () => {
    fc.assert(
      fc.property(scenarioArbitrary, (scenario) => {
        const { cards, now, config, today, todayStart } = build(scenario);
        const plan = spreadOverdue({ cards, now, config, days: scenario.days });
        if (plan.perDay.length === 0) return;
        const counts = plan.perDay.map((entry) => entry.count);

        // Capacidad calculada aparte, con el día de estudio de cada vencimiento
        const caps = plan.perDay.map((entry, index) => {
          expect(entry.day).toBe(addDays(today, index));
          const due = cards.filter(
            (card) =>
              isScheduled(card) &&
              dueOf(card) >= todayStart &&
              studyDayOf(new Date(dueOf(card)), TZ) === entry.day,
          ).length;
          return Math.max(0, scenario.reviewsPerDay - due);
        });
        const total = counts.reduce((sum, count) => sum + count, 0);
        expect(plan.overCapacity).toBe(caps.reduce((sum, cap) => sum + cap, 0) < total);

        if (plan.overCapacity) {
          expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
        } else {
          counts.forEach((count, index) => {
            expect(count).toBeLessThanOrEqual(caps[index] ?? 0);
          });
          // Un día solo puede tener 2 o más que otro si el otro ya está lleno
          counts.forEach((high) => {
            counts.forEach((low, lowIndex) => {
              expect(high - low <= 1 || low === caps[lowIndex]).toBe(true);
            });
          });
        }

        // Las más olvidadas primero. Hoy tiene las primeras, luego cada día en orden
        const overdue = overdueCards(cards, now, TZ);
        const assignedIds = new Set(plan.assignments.map((entry) => entry.cardId));
        const rank = (card: QueueCard): [number, string] => [
          retrievabilityOf(card.state, now),
          card.cardId,
        ];
        const staying = overdue.filter((card) => !assignedIds.has(card.cardId)).map(rank);
        const moving = plan.assignments.map((entry) =>
          rank(cards.find((card) => card.cardId === entry.cardId) as QueueCard),
        );
        for (let index = 1; index < moving.length; index += 1) {
          expect(
            compareTuples(moving[index - 1] as [number, string], moving[index] as [number, string]),
          ).toBeLessThanOrEqual(0);
        }
        const first = moving[0];
        if (first) {
          for (const tuple of staying) expect(compareTuples(tuple, first)).toBeLessThan(0);
        }
        // Las que se quedan hoy son las primeras y las asignaciones van por día en orden
        const toValues = plan.assignments.map((entry) => Date.parse(entry.to));
        expect([...toValues].sort((a, b) => a - b)).toEqual(toValues);
      }),
      RUNS,
    );
  });

  it('nunca asigna en o después del inicio del día del ENARM ni mueve tarjetas nuevas', () => {
    fc.assert(
      fc.property(scenarioArbitrary, (scenario) => {
        const { cards, now, config } = build(scenario);
        const deadline = examDeadline(config);
        const plan = spreadOverdue({ cards, now, config, days: scenario.days });
        const scheduledIds = new Set(cards.filter(isScheduled).map((card) => card.cardId));
        for (const entry of plan.assignments) {
          expect(scheduledIds.has(entry.cardId)).toBe(true);
          if (deadline) expect(Date.parse(entry.to)).toBeLessThan(deadline.getTime());
        }
      }),
      RUNS,
    );
  });
});

describe('propiedades de posponer y adelantar', () => {
  it('posponer solo mueve tarjetas programadas hacia adelante, sin pasar del examen', () => {
    fc.assert(
      fc.property(scenarioArbitrary, (scenario) => {
        const { cards, now, config } = build(scenario);
        const deadline = examDeadline(config);
        const moved = postponeCards({ cards, now, config, days: scenario.days });
        const scheduledIds = new Set(cards.filter(isScheduled).map((card) => card.cardId));
        expect(new Set(moved.map((entry) => entry.cardId)).size).toBe(moved.length);
        for (const entry of moved) {
          expect(scheduledIds.has(entry.cardId)).toBe(true);
          expect(Date.parse(entry.to)).toBeGreaterThan(Date.parse(entry.from));
          expect(entry.from).not.toBe(entry.to);
          if (deadline) expect(Date.parse(entry.to)).toBeLessThanOrEqual(deadline.getTime());
        }
        // Todas llegan al mismo instante y salen del vencimiento más cercano al más lejano
        expect(new Set(moved.map((entry) => entry.to)).size).toBeLessThanOrEqual(1);
        const froms = moved.map((entry) => Date.parse(entry.from));
        expect([...froms].sort((a, b) => a - b)).toEqual(froms);
        // Lo que no se mueve ya vence en o después del destino
        const movedIds = new Set(moved.map((entry) => entry.cardId));
        const destination = moved[0] ? Date.parse(moved[0].to) : null;
        if (destination !== null) {
          for (const card of cards.filter(isScheduled)) {
            if (!movedIds.has(card.cardId)) expect(dueOf(card)).toBeGreaterThanOrEqual(destination);
          }
        }
      }),
      RUNS,
    );
  });

  it('adelantar trae los más cercanos que no vencen hoy y respeta el tope pedido', () => {
    fc.assert(
      fc.property(scenarioArbitrary, fc.integer({ min: -3, max: 100 }), (scenario, count) => {
        const { cards, now, config, todayEnd } = build(scenario);
        const moved = advanceReviews({ cards, now, config, count });
        const available = cards.filter((card) => isScheduled(card) && dueOf(card) >= todayEnd);
        expect(moved).toHaveLength(Math.min(Math.max(count, 0), available.length));
        const froms = moved.map((entry) => Date.parse(entry.from));
        expect([...froms].sort((a, b) => a - b)).toEqual(froms);
        for (const entry of moved) {
          expect(entry.to).toBe(now.toISOString());
          expect(Date.parse(entry.from)).toBeGreaterThanOrEqual(todayEnd);
        }
        // Ninguna que se quedó vence antes que la última que se trajo
        const movedIds = new Set(moved.map((entry) => entry.cardId));
        const last = froms.at(-1);
        if (last !== undefined) {
          for (const card of available) {
            if (!movedIds.has(card.cardId)) expect(dueOf(card)).toBeGreaterThanOrEqual(last);
          }
        }
      }),
      RUNS,
    );
  });
});

describe('propiedades de determinismo y de deshacer', () => {
  it('el orden de las tarjetas de entrada no cambia ningún resultado', () => {
    fc.assert(
      fc.property(scenarioArbitrary, fc.integer({ min: 0, max: 60 }), (scenario, count) => {
        const { cards, shuffled, now, config } = build(scenario);
        const days = scenario.days;
        expect(spreadOverdue({ cards: shuffled, now, config, days })).toEqual(
          spreadOverdue({ cards, now, config, days }),
        );
        expect(postponeCards({ cards: shuffled, now, config, days })).toEqual(
          postponeCards({ cards, now, config, days }),
        );
        expect(advanceReviews({ cards: shuffled, now, config, count })).toEqual(
          advanceReviews({ cards, now, config, count }),
        );
        expect(overdueCards(shuffled, now, TZ)).toEqual(overdueCards(cards, now, TZ));
      }),
      RUNS,
    );
  });

  it('deshacer cualquier cambio regresa cada tarjeta a su fecha anterior', () => {
    fc.assert(
      fc.property(scenarioArbitrary, fc.integer({ min: 0, max: 60 }), (scenario, count) => {
        const { cards, now, config } = build(scenario);
        const changes: RescheduledCard[][] = [
          spreadOverdue({ cards, now, config, days: scenario.days }).assignments,
          postponeCards({ cards, now, config, days: scenario.days }),
          advanceReviews({ cards, now, config, count }),
        ];
        for (const moved of changes) {
          const current = new Map(moved.map((entry) => [entry.cardId, entry.to]));
          const undone = undoAssignments({
            moved,
            currentDue: (id) => current.get(id) ?? null,
          });
          expect(undone).toEqual(
            moved.map((entry) => ({ cardId: entry.cardId, from: entry.to, to: entry.from })),
          );
          // Si cada tarjeta cambió después, no se toca ninguna
          expect(undoAssignments({ moved, currentDue: () => '2031-01-01T00:00:00.000Z' })).toEqual(
            [],
          );
        }
      }),
      RUNS,
    );
  });

  it('el resumen es coherente con la lista de atrasadas', () => {
    fc.assert(
      fc.property(
        scenarioArbitrary,
        fc.integer({ min: 0, max: 40 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (scenario, minOverdue, share) => {
          const { cards, now, config } = build(scenario);
          const summary = summarizeOverdue({
            cards,
            now,
            config,
            rules: { minOverdue, overdueShareOfLimit: share },
          });
          expect(summary.overdue).toBe(overdueCards(cards, now, TZ).length);
          expect(summary.reviewLimit).toBe(scenario.reviewsPerDay);
          if (summary.needsRecovery) {
            expect(summary.overdue).toBeGreaterThan(0);
            expect(summary.overdue).toBeGreaterThanOrEqual(minOverdue);
            expect(summary.suggestedDays).toBeGreaterThanOrEqual(2);
            expect(summary.suggestedDays).toBeLessThanOrEqual(7);
          } else {
            expect(summary.suggestedDays).toBe(1);
          }
        },
      ),
      RUNS,
    );
  });

  it('los lotes conservan todo en orden y ninguno pasa de 500', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_700 }), (length) => {
        const assignments: RescheduledCard[] = Array.from({ length }, (_, index) => ({
          cardId: `c${index}`,
          from: '2026-10-01T15:00:00.000Z',
          to: '2026-10-11T10:00:00.000Z',
        }));
        const batches = rescheduleBatches(assignments);
        expect(batches.flat()).toEqual(assignments);
        batches.forEach((batch, index) => {
          expect(batch.length).toBeGreaterThan(0);
          expect(batch.length).toBeLessThanOrEqual(500);
          if (index < batches.length - 1) expect(batch).toHaveLength(500);
        });
      }),
      { numRuns: 100 },
    );
  });
});
