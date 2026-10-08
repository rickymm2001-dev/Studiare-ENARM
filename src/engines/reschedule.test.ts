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
  MAX_ADVANCE_COUNT,
  overdueCards,
  postponeCards,
  rescheduleBatches,
  spreadOverdue,
  summarizeOverdue,
  undoAssignments,
  type RecoveryRules,
  type RescheduledCard,
} from './reschedule';
import { NO_EASY_DAYS, type EasyDays } from './easyDays';
import { DAY_MS, studyDayStart } from './studyDay';

const TZ = 'America/Merida';
/** 9:00 a. m. en Mérida (UTC-6). El día de estudio es 2026-10-08 y empieza a las 10:00 UTC */
const NOW = new Date('2026-10-08T15:00:00.000Z');
const TODAY_START = '2026-10-08T10:00:00.000Z';
const TOMORROW_START = '2026-10-09T10:00:00.000Z';

const config: SchedulerConfig = {
  desiredRetention: 0.9,
  examDate: null,
  timeZone: TZ,
  thresholds: DEFAULT_THRESHOLDS.fsrs,
};

function withLimit(reviewsPerDay: number): SchedulerConfig {
  return { ...config, thresholds: { ...config.thresholds, reviewsPerDay } };
}

function stateOf(due: string, overrides: Partial<FsrsCardState> = {}): FsrsCardState {
  const scheduledDays = overrides.scheduledDays ?? 10;
  return {
    due,
    stability: 10,
    difficulty: 5,
    scheduledDays,
    learningSteps: 0,
    reps: 5,
    lapses: 0,
    state: 'review',
    lastReview: new Date(Date.parse(due) - scheduledDays * DAY_MS).toISOString(),
    ...overrides,
  };
}

function card(
  cardId: string,
  due: string,
  overrides: Partial<FsrsCardState> = {},
  noteId = `n-${cardId}`,
): QueueCard {
  return { cardId, noteId, state: stateOf(due, overrides) };
}

/** Tarjeta que nunca se ha visto, sin estado */
function unseen(cardId: string): QueueCard {
  return { cardId, noteId: `n-${cardId}`, state: null };
}

/** Tarjeta nueva con estado new y un vencimiento pasado, como queda al crearla */
function freshCard(cardId: string): QueueCard {
  return {
    cardId,
    noteId: `n-${cardId}`,
    state: newCardState(new Date('2026-09-01T15:00:00.000Z')),
  };
}

/** Varias tarjetas con ids consecutivos, todas con el mismo vencimiento */
function batch(prefix: string, count: number, due: string): QueueCard[] {
  return Array.from({ length: count }, (_, index) =>
    card(`${prefix}${String(index + 1).padStart(3, '0')}`, due),
  );
}

/**
 * Atrasadas con retrievability creciente según su número. Mismo último repaso y mismo vencimiento,
 * así que solo cambia la estabilidad, y a más estabilidad más se recuerda
 */
function overdueByForgetting(count: number): QueueCard[] {
  return Array.from({ length: count }, (_, index) =>
    card(
      `o${String(index + 1).padStart(3, '0')}`,
      '2026-09-20T15:00:00.000Z',
      { stability: index + 1, scheduledDays: 10 },
      `note-${index}`,
    ),
  );
}

const ids = (items: readonly { cardId: string }[]) => items.map((item) => item.cardId);

/** Orden de entrada distinto y fijo, sin azar */
function reorder<T>(items: readonly T[]): T[] {
  const reversed = [...items].reverse();
  const half = Math.floor(reversed.length / 2);
  return [...reversed.slice(half), ...reversed.slice(0, half)];
}

describe('overdueCards', () => {
  const cards = [
    card('d', '2026-10-05T15:00:00.000Z'),
    card('b', '2026-10-01T15:00:00.000Z'),
    card('a', '2026-10-01T15:00:00.000Z'),
    card('today-early', TODAY_START),
    card('today-late', '2026-10-09T09:59:59.999Z'),
    card('future', '2026-10-12T15:00:00.000Z'),
    unseen('null-state'),
    freshCard('fresh'),
  ];

  it('solo cuenta tarjetas con estado distinto de nueva que vencieron antes de hoy', () => {
    expect(ids(overdueCards(cards, NOW, TZ))).toEqual(['a', 'b', 'd']);
  });

  it('ordena de la más vencida a la menos vencida y luego por cardId', () => {
    expect(ids(overdueCards(cards, NOW, TZ))).toEqual(['a', 'b', 'd']);
    expect(ids(overdueCards(reorder(cards), NOW, TZ))).toEqual(['a', 'b', 'd']);
  });

  it('lo que vence hoy no es atraso, ni lo que venció hace unas horas el mismo día de estudio', () => {
    const earlyToday = card('early-today', TODAY_START);
    const justBefore = card('just-before', '2026-10-08T09:59:59.999Z');
    expect(ids(overdueCards([earlyToday, justBefore], NOW, TZ))).toEqual(['just-before']);
  });

  it('acepta tarjetas en aprendizaje y reaprendizaje', () => {
    const learning = card('learning', '2026-10-07T12:00:00.000Z', { state: 'learning' });
    const relearning = card('relearning', '2026-10-07T13:00:00.000Z', { state: 'relearning' });
    expect(ids(overdueCards([relearning, learning], NOW, TZ))).toEqual(['learning', 'relearning']);
  });

  it('ignora una tarjeta cuyo vencimiento no se puede leer', () => {
    const broken = card('broken', '2026-10-01T15:00:00.000Z', {
      due: 'no es una fecha',
      lastReview: null,
    });
    expect(overdueCards([broken], NOW, TZ)).toEqual([]);
  });

  it('no modifica la lista de entrada', () => {
    const input = [...cards];
    overdueCards(input, NOW, TZ);
    expect(input).toEqual(cards);
  });
});

describe('cambio de día de estudio a las 4 a. m. locales', () => {
  // 3:30 a. m. del 8 de octubre en Mérida sigue siendo el día de estudio 2026-10-07
  const beforeCutoff = new Date('2026-10-08T09:30:00.000Z');
  const atCutoff = new Date('2026-10-08T10:00:00.000Z');
  const cards = [
    card('before-start', '2026-10-07T09:59:59.999Z'),
    card('at-start', '2026-10-07T10:00:00.000Z'),
    card('yesterday-afternoon', '2026-10-07T20:00:00.000Z'),
    card('late-night', '2026-10-08T05:00:00.000Z'),
  ];

  it('a las 3:30 a. m. el día de estudio es el anterior y solo es atraso lo previo a su inicio', () => {
    expect(ids(overdueCards(cards, beforeCutoff, TZ))).toEqual(['before-start']);
  });

  it('a las 4:00 a. m. en punto empieza el día nuevo y lo de ayer ya es atraso', () => {
    expect(ids(overdueCards(cards, atCutoff, TZ))).toEqual([
      'before-start',
      'at-start',
      'yesterday-afternoon',
      'late-night',
    ]);
  });

  it('un milisegundo antes de las 4:00 a. m. todavía es el día anterior', () => {
    const justBefore = new Date('2026-10-08T09:59:59.999Z');
    expect(ids(overdueCards(cards, justBefore, TZ))).toEqual(['before-start']);
  });

  it('al repartir a las 3:30 a. m. el primer día del plan es el día de estudio anterior', () => {
    const plan = spreadOverdue({
      cards: [...overdueByForgetting(6)],
      now: beforeCutoff,
      config,
      days: 2,
    });
    expect(plan.perDay.map((entry) => entry.day)).toEqual(['2026-10-07', '2026-10-08']);
    expect(plan.assignments.every((entry) => entry.to === '2026-10-08T10:00:00.000Z')).toBe(true);
  });
});

describe('summarizeOverdue', () => {
  const rules: RecoveryRules = { minOverdue: 20, overdueShareOfLimit: 0.25 };
  const summarize = (count: number, cfg: SchedulerConfig = config, customRules = rules) =>
    summarizeOverdue({
      cards: batch('v', count, '2026-10-01T15:00:00.000Z'),
      now: NOW,
      config: cfg,
      rules: customRules,
    });

  it('no pide recuperación bajo el umbral, que es el mayor entre el mínimo y la fracción del límite', () => {
    // Límite 200 y 25 por ciento son 50, mayor que el mínimo de 20
    expect(summarize(49)).toEqual({
      overdue: 49,
      reviewLimit: 200,
      needsRecovery: false,
      suggestedDays: 1,
    });
    expect(summarize(50).needsRecovery).toBe(true);
  });

  it('sugiere días según la mitad del límite diario y entre 2 y 7', () => {
    expect(summarize(50).suggestedDays).toBe(2);
    expect(summarize(200).suggestedDays).toBe(2);
    expect(summarize(201).suggestedDays).toBe(3);
    expect(summarize(450).suggestedDays).toBe(5);
    expect(summarize(2_000).suggestedDays).toBe(7);
  });

  it('con un límite bajo manda el mínimo de atrasadas', () => {
    const small = withLimit(10);
    expect(summarize(19, small).needsRecovery).toBe(false);
    expect(summarize(20, small).needsRecovery).toBe(true);
    // La mitad del límite es 5, así que 20 atrasadas piden 4 días
    expect(summarize(20, small).suggestedDays).toBe(4);
  });

  it('nunca pide recuperación sin atrasadas, aunque el umbral sea cero', () => {
    expect(summarize(0, config, { minOverdue: 0, overdueShareOfLimit: 0 })).toMatchObject({
      overdue: 0,
      needsRecovery: false,
      suggestedDays: 1,
    });
    expect(summarize(1, config, { minOverdue: 0, overdueShareOfLimit: 0 }).needsRecovery).toBe(
      true,
    );
  });

  it('con un límite de cero o de uno no divide entre cero', () => {
    expect(summarize(30, withLimit(0))).toMatchObject({ reviewLimit: 0, needsRecovery: true });
    expect(summarize(30, withLimit(0)).suggestedDays).toBe(7);
    expect(summarize(30, withLimit(1)).suggestedDays).toBe(7);
  });

  it('no cuenta las que vencen hoy ni las nuevas', () => {
    const cards = [
      ...batch('late', 3, '2026-10-01T15:00:00.000Z'),
      ...batch('today', 5, '2026-10-08T16:00:00.000Z'),
      freshCard('fresh'),
      unseen('unseen'),
    ];
    expect(
      summarizeOverdue({
        cards,
        now: NOW,
        config,
        rules: { minOverdue: 1, overdueShareOfLimit: 0 },
      }),
    ).toMatchObject({ overdue: 3, needsRecovery: true });
  });
});

describe('spreadOverdue', () => {
  it('con capacidad suficiente reparte parejo y manda las más olvidadas a los primeros días', () => {
    const cards = overdueByForgetting(30);
    const plan = spreadOverdue({ cards, now: NOW, config, days: 3 });
    expect(plan.overCapacity).toBe(false);
    expect(plan.perDay).toEqual([
      { day: '2026-10-08', count: 10 },
      { day: '2026-10-09', count: 10 },
      { day: '2026-10-10', count: 10 },
    ]);
    // Las 10 más olvidadas se quedan hoy y no generan asignación
    expect(ids(plan.assignments)).toEqual(cards.slice(10).map((entry) => entry.cardId));
    expect(plan.assignments.slice(0, 10).every((entry) => entry.to === TOMORROW_START)).toBe(true);
    expect(
      plan.assignments.slice(10).every((entry) => entry.to === '2026-10-10T10:00:00.000Z'),
    ).toBe(true);
    for (const entry of plan.assignments) {
      const original = cards.find((item) => item.cardId === entry.cardId);
      expect(entry.from).toBe(original?.state?.due);
    }
  });

  it('el orden de asignación sigue la retrievability y no la fecha de vencimiento', () => {
    const forgotten = card('z-forgotten', '2026-10-06T15:00:00.000Z', {
      stability: 1,
      scheduledDays: 30,
    });
    const solid = card('a-solid', '2026-09-01T15:00:00.000Z', { stability: 80, scheduledDays: 10 });
    expect(retrievabilityOf(forgotten.state, NOW)).toBeLessThan(retrievabilityOf(solid.state, NOW));
    const plan = spreadOverdue({ cards: [solid, forgotten], now: NOW, config, days: 2 });
    // La más olvidada se queda hoy y la otra pasa a mañana
    expect(plan.perDay.map((entry) => entry.count)).toEqual([1, 1]);
    expect(ids(plan.assignments)).toEqual(['a-solid']);
  });

  it('desempata por cardId cuando la retrievability es igual', () => {
    const twins = [
      card('t-b', '2026-09-20T15:00:00.000Z'),
      card('t-a', '2026-09-20T15:00:00.000Z'),
      card('t-c', '2026-09-20T15:00:00.000Z'),
    ];
    const plan = spreadOverdue({ cards: twins, now: NOW, config, days: 3 });
    expect(ids(plan.assignments)).toEqual(['t-b', 't-c']);
    expect(plan.assignments.map((entry) => entry.to)).toEqual([
      TOMORROW_START,
      '2026-10-10T10:00:00.000Z',
    ]);
  });

  it('el sobrante de un reparto no exacto va a los primeros días', () => {
    const plan = spreadOverdue({ cards: overdueByForgetting(10), now: NOW, config, days: 3 });
    expect(plan.perDay.map((entry) => entry.count)).toEqual([4, 3, 3]);
  });

  it('la capacidad de cada día descuenta lo que ya vence ese día y no pasa del límite', () => {
    const load = [
      ...batch('today', 190, '2026-10-08T16:00:00.000Z'),
      ...batch('later', 20, '2026-10-10T16:00:00.000Z'),
    ];
    const plan = spreadOverdue({
      cards: [...load, ...overdueByForgetting(40)],
      now: NOW,
      config,
      days: 3,
    });
    // Capacidades 10, 200 y 180. Lo parejo que cabe son 10, 15 y 15
    expect(plan.overCapacity).toBe(false);
    expect(plan.perDay.map((entry) => entry.count)).toEqual([10, 15, 15]);
  });

  it('un día lleno no recibe nada y las demás se reparten el resto', () => {
    const load = batch('today', 200, '2026-10-08T16:00:00.000Z');
    const plan = spreadOverdue({
      cards: [...load, ...overdueByForgetting(9)],
      now: NOW,
      config,
      days: 3,
    });
    expect(plan.overCapacity).toBe(false);
    expect(plan.perDay.map((entry) => entry.count)).toEqual([0, 5, 4]);
    expect(plan.assignments).toHaveLength(9);
  });

  it('sin capacidad suficiente avisa y reparte parejo ignorando la capacidad', () => {
    const plan = spreadOverdue({
      cards: overdueByForgetting(20),
      now: NOW,
      config: withLimit(5),
      days: 3,
    });
    expect(plan.overCapacity).toBe(true);
    expect(plan.perDay.map((entry) => entry.count)).toEqual([7, 7, 6]);
    expect(plan.assignments).toHaveLength(13);
  });

  it('cuando la capacidad total alcanza justo no hay sobrecapacidad', () => {
    const plan = spreadOverdue({
      cards: overdueByForgetting(15),
      now: NOW,
      config: withLimit(5),
      days: 3,
    });
    expect(plan.overCapacity).toBe(false);
    expect(plan.perDay.map((entry) => entry.count)).toEqual([5, 5, 5]);
  });

  it('con límite cero todo es sobrecapacidad y aun así no se pierde ninguna', () => {
    const plan = spreadOverdue({
      cards: overdueByForgetting(5),
      now: NOW,
      config: withLimit(0),
      days: 2,
    });
    expect(plan.overCapacity).toBe(true);
    expect(plan.perDay.map((entry) => entry.count)).toEqual([3, 2]);
  });

  it('sin atrasadas el plan no tiene asignaciones ni sobrecapacidad', () => {
    const plan = spreadOverdue({
      cards: batch('today', 5, '2026-10-08T16:00:00.000Z'),
      now: NOW,
      config,
      days: 3,
    });
    expect(plan.assignments).toEqual([]);
    expect(plan.overCapacity).toBe(false);
    expect(plan.perDay.map((entry) => entry.count)).toEqual([0, 0, 0]);
  });

  it('repartir en 1 día no cambia nada', () => {
    const plan = spreadOverdue({ cards: overdueByForgetting(12), now: NOW, config, days: 1 });
    expect(plan.assignments).toEqual([]);
    expect(plan.perDay).toEqual([{ day: '2026-10-08', count: 12 }]);
    expect(plan.overCapacity).toBe(false);
  });

  it('en 1 día avisa si lo atrasado no cabe hoy', () => {
    const plan = spreadOverdue({
      cards: overdueByForgetting(12),
      now: NOW,
      config: withLimit(10),
      days: 1,
    });
    expect(plan.assignments).toEqual([]);
    expect(plan.overCapacity).toBe(true);
  });

  it('recorta los días a 1 y 7 y trata lo que no es número como 1', () => {
    const cards = overdueByForgetting(14);
    const daysOf = (days: number) => spreadOverdue({ cards, now: NOW, config, days }).perDay.length;
    expect(daysOf(0)).toBe(1);
    expect(daysOf(-4)).toBe(1);
    expect(daysOf(Number.NaN)).toBe(1);
    expect(daysOf(2.9)).toBe(2);
    expect(daysOf(7)).toBe(7);
    expect(daysOf(30)).toBe(7);
    expect(daysOf(Number.POSITIVE_INFINITY)).toBe(7);
  });

  describe('con examen cercano', () => {
    const cards = overdueByForgetting(12);

    it('no asigna nada en o después del día del examen', () => {
      const exam: SchedulerConfig = { ...config, examDate: '2026-10-10' };
      const deadline = examDeadline(exam) as Date;
      const plan = spreadOverdue({ cards, now: NOW, config: exam, days: 7 });
      expect(plan.perDay.map((entry) => entry.day)).toEqual(['2026-10-08', '2026-10-09']);
      expect(plan.assignments.length).toBeGreaterThan(0);
      for (const entry of plan.assignments) {
        expect(new Date(entry.to).getTime()).toBeLessThan(deadline.getTime());
      }
    });

    it('con el examen mañana solo queda hoy y no hay asignaciones', () => {
      const plan = spreadOverdue({
        cards,
        now: NOW,
        config: { ...config, examDate: '2026-10-09' },
        days: 7,
      });
      expect(plan.assignments).toEqual([]);
      expect(plan.perDay).toEqual([{ day: '2026-10-08', count: 12 }]);
    });

    it('el día del examen y después no hay días antes del examen y el plan queda vacío', () => {
      for (const examDate of ['2026-10-08', '2026-10-07', '2025-01-01']) {
        const plan = spreadOverdue({ cards, now: NOW, config: { ...config, examDate }, days: 7 });
        expect(plan).toEqual({ assignments: [], perDay: [], overCapacity: false });
      }
    });

    it('un examen lejano no limita el reparto', () => {
      const plan = spreadOverdue({
        cards,
        now: NOW,
        config: { ...config, examDate: '2027-06-01' },
        days: 4,
      });
      expect(plan.perDay).toHaveLength(4);
    });
  });

  it('es determinista y no depende del orden de las tarjetas de entrada', () => {
    const cards = [
      ...overdueByForgetting(37),
      ...batch('today', 12, '2026-10-08T16:00:00.000Z'),
      ...batch('soon', 9, '2026-10-09T16:00:00.000Z'),
      freshCard('fresh'),
      unseen('unseen'),
    ];
    const first = spreadOverdue({ cards, now: NOW, config, days: 5 });
    expect(spreadOverdue({ cards, now: NOW, config, days: 5 })).toEqual(first);
    expect(spreadOverdue({ cards: reorder(cards), now: NOW, config, days: 5 })).toEqual(first);
    expect(spreadOverdue({ cards: [...cards].reverse(), now: NOW, config, days: 5 })).toEqual(
      first,
    );
  });

  it('nunca mueve una tarjeta nueva, aunque su fecha sea pasada', () => {
    const cards = [freshCard('fresh'), unseen('unseen'), ...overdueByForgetting(6)];
    const plan = spreadOverdue({ cards, now: NOW, config, days: 3 });
    expect(ids(plan.assignments)).not.toContain('fresh');
    expect(ids(plan.assignments)).not.toContain('unseen');
    expect(plan.perDay.reduce((sum, entry) => sum + entry.count, 0)).toBe(6);
  });

  it('las asignaciones solo llevan cardId, from y to, sin tocar la estabilidad ni la dificultad', () => {
    const plan = spreadOverdue({ cards: overdueByForgetting(8), now: NOW, config, days: 2 });
    expect(plan.assignments.length).toBeGreaterThan(0);
    for (const entry of plan.assignments) {
      expect(Object.keys(entry).sort()).toEqual(['cardId', 'from', 'to']);
    }
  });

  it('cada asignación va a un inicio de día de estudio posterior a su fecha anterior', () => {
    const plan = spreadOverdue({ cards: overdueByForgetting(21), now: NOW, config, days: 7 });
    const starts = new Set(
      ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'].map(
        (day) => studyDayStart(day, TZ).toISOString(),
      ),
    );
    expect(plan.assignments).toHaveLength(18);
    for (const entry of plan.assignments) {
      expect(starts.has(entry.to)).toBe(true);
      expect(entry.to > entry.from).toBe(true);
    }
  });
});

describe('spreadOverdue con días fáciles', () => {
  // Jueves 8 de octubre. Viernes 9, sábado 10, domingo 11 y lunes 12
  const easy = (days: Partial<EasyDays>): SchedulerConfig => ({
    ...config,
    easyDays: { ...NO_EASY_DAYS, ...days },
  });

  it('un día casi sin repasos no recibe atrasadas y se reparte entre los días útiles', () => {
    const plan = spreadOverdue({
      cards: overdueByForgetting(30),
      now: NOW,
      config: easy({ sat: 'minimum' }),
      days: 3,
    });
    expect(plan.perDay.map((entry) => entry.day)).toEqual([
      '2026-10-08',
      '2026-10-09',
      '2026-10-11',
    ]);
    expect(plan.perDay.reduce((total, entry) => total + entry.count, 0)).toBe(30);
  });

  it('con sábado y domingo en mínimo salta el fin de semana completo', () => {
    const plan = spreadOverdue({
      cards: overdueByForgetting(30),
      now: NOW,
      config: easy({ sat: 'minimum', sun: 'minimum' }),
      days: 3,
    });
    expect(plan.perDay.map((entry) => entry.day)).toEqual([
      '2026-10-08',
      '2026-10-09',
      '2026-10-12',
    ]);
  });

  it('un día con menos repasos recibe la mitad de lo que cabría', () => {
    // Límite de 20 por día y 40 atrasadas entre jueves, viernes y sábado. El sábado cabe la mitad
    const plan = spreadOverdue({
      cards: overdueByForgetting(40),
      now: NOW,
      config: {
        ...easy({ sat: 'reduced' }),
        thresholds: { ...config.thresholds, reviewsPerDay: 20 },
      },
      days: 3,
    });
    expect(plan.overCapacity).toBe(false);
    expect(plan.perDay.map((entry) => entry.count)).toEqual([15, 15, 10]);
  });

  it('hoy cuenta siempre, aunque hoy sea un día fácil', () => {
    const plan = spreadOverdue({
      cards: overdueByForgetting(10),
      now: NOW,
      config: easy({ thu: 'minimum' }),
      days: 2,
    });
    expect(plan.perDay[0]?.day).toBe('2026-10-08');
  });

  it('sin días fáciles reparte igual que antes', () => {
    const plain = spreadOverdue({ cards: overdueByForgetting(30), now: NOW, config, days: 3 });
    const normal = spreadOverdue({
      cards: overdueByForgetting(30),
      now: NOW,
      config: easy({}),
      days: 3,
    });
    expect(normal).toEqual(plain);
  });
});

describe('postponeCards', () => {
  const cards = [
    card('overdue', '2026-10-01T15:00:00.000Z'),
    card('today', '2026-10-08T16:00:00.000Z'),
    card('in-two', '2026-10-10T15:00:00.000Z'),
    card('exact', '2026-10-11T10:00:00.000Z'),
    card('later', '2026-10-15T15:00:00.000Z'),
    freshCard('fresh'),
    unseen('unseen'),
  ];

  it('lleva cada tarjeta al inicio del día dentro de N días, o la deja si vence después', () => {
    const moved = postponeCards({ cards, now: NOW, config, days: 3 });
    expect(moved).toEqual([
      { cardId: 'overdue', from: '2026-10-01T15:00:00.000Z', to: '2026-10-11T10:00:00.000Z' },
      { cardId: 'today', from: '2026-10-08T16:00:00.000Z', to: '2026-10-11T10:00:00.000Z' },
      { cardId: 'in-two', from: '2026-10-10T15:00:00.000Z', to: '2026-10-11T10:00:00.000Z' },
    ]);
  });

  it('no genera asignación si ya vence en ese instante ni nunca toca tarjetas nuevas', () => {
    const moved = postponeCards({ cards, now: NOW, config, days: 3 });
    expect(ids(moved)).not.toContain('exact');
    expect(ids(moved)).not.toContain('later');
    expect(ids(moved)).not.toContain('fresh');
    expect(ids(moved)).not.toContain('unseen');
  });

  it('recorta los días a 1 y 30', () => {
    const target = (days: number) =>
      postponeCards({ cards: [card('c', '2026-10-01T15:00:00.000Z')], now: NOW, config, days })[0]
        ?.to;
    expect(target(0)).toBe(TOMORROW_START);
    expect(target(Number.NaN)).toBe(TOMORROW_START);
    expect(target(30)).toBe('2026-11-07T10:00:00.000Z');
    expect(target(500)).toBe(target(30));
  });

  it('no pasa del inicio del día del examen', () => {
    const exam: SchedulerConfig = { ...config, examDate: '2026-10-12' };
    const deadline = examDeadline(exam) as Date;
    const moved = postponeCards({
      cards: [
        card('a', '2026-10-01T15:00:00.000Z'),
        card('b', '2026-10-11T15:00:00.000Z'),
        card('at-deadline', deadline.toISOString()),
        card('after-deadline', '2026-10-20T15:00:00.000Z'),
      ],
      now: NOW,
      config: exam,
      days: 10,
    });
    expect(moved.map((entry) => entry.cardId)).toEqual(['a', 'b']);
    for (const entry of moved) expect(entry.to).toBe(deadline.toISOString());
  });

  it('nunca adelanta una tarjeta, ni siquiera una que ya vence después del examen', () => {
    const exam: SchedulerConfig = { ...config, examDate: '2026-10-12' };
    const moved = postponeCards({
      cards: [card('weird', '2026-12-01T15:00:00.000Z')],
      now: NOW,
      config: exam,
      days: 3,
    });
    expect(moved).toEqual([]);
  });

  it('si el examen ya empezó no hay a dónde posponer', () => {
    for (const examDate of ['2026-10-08', '2026-10-01']) {
      expect(postponeCards({ cards, now: NOW, config: { ...config, examDate }, days: 3 })).toEqual(
        [],
      );
    }
  });

  it('respeta el cambio de día de estudio de las 4 a. m.', () => {
    const beforeCutoff = new Date('2026-10-08T09:30:00.000Z');
    const moved = postponeCards({
      cards: [card('c', '2026-10-01T15:00:00.000Z')],
      now: beforeCutoff,
      config,
      days: 1,
    });
    // Para el alumno sigue siendo el 7 de octubre, así que 1 día es el 8 a las 4 a. m.
    expect(moved[0]?.to).toBe('2026-10-08T10:00:00.000Z');
  });

  it('es determinista y no depende del orden de entrada', () => {
    const first = postponeCards({ cards, now: NOW, config, days: 4 });
    expect(postponeCards({ cards, now: NOW, config, days: 4 })).toEqual(first);
    expect(postponeCards({ cards: reorder(cards), now: NOW, config, days: 4 })).toEqual(first);
  });
});

describe('advanceReviews', () => {
  const cards = [
    card('overdue', '2026-10-01T15:00:00.000Z'),
    card('today', '2026-10-08T16:00:00.000Z'),
    card('last-ms-today', '2026-10-09T09:59:59.999Z'),
    card('tomorrow-start', TOMORROW_START),
    card('b-tie', '2026-10-10T15:00:00.000Z'),
    card('a-tie', '2026-10-10T15:00:00.000Z'),
    card('far', '2026-12-01T15:00:00.000Z'),
    freshCard('fresh'),
    unseen('unseen'),
  ];

  it('trae al presente los próximos repasos que no vencen hoy, del más cercano al más lejano', () => {
    const moved = advanceReviews({ cards, now: NOW, config, count: 3 });
    expect(moved).toEqual([
      { cardId: 'tomorrow-start', from: TOMORROW_START, to: NOW.toISOString() },
      { cardId: 'a-tie', from: '2026-10-10T15:00:00.000Z', to: NOW.toISOString() },
      { cardId: 'b-tie', from: '2026-10-10T15:00:00.000Z', to: NOW.toISOString() },
    ]);
  });

  it('con un count mayor al disponible entrega solo las que hay', () => {
    const moved = advanceReviews({ cards, now: NOW, config, count: 100 });
    expect(ids(moved)).toEqual(['tomorrow-start', 'a-tie', 'b-tie', 'far']);
  });

  it('no incluye atrasadas, las de hoy ni las nuevas', () => {
    const moved = ids(advanceReviews({ cards, now: NOW, config, count: 100 }));
    for (const excluded of ['overdue', 'today', 'last-ms-today', 'fresh', 'unseen']) {
      expect(moved).not.toContain(excluded);
    }
  });

  it('con count de cero, negativo o que no es número no hace nada', () => {
    for (const count of [0, -3, Number.NaN]) {
      expect(advanceReviews({ cards, now: NOW, config, count })).toEqual([]);
    }
  });

  it('recorta count a 5,000', () => {
    const many = batch('f', MAX_ADVANCE_COUNT + 100, '2026-11-01T15:00:00.000Z');
    expect(advanceReviews({ cards: many, now: NOW, config, count: 99_999 })).toHaveLength(
      MAX_ADVANCE_COUNT,
    );
  });

  it('sin tarjetas a futuro devuelve vacío', () => {
    expect(
      advanceReviews({
        cards: [card('x', '2026-10-01T15:00:00.000Z')],
        now: NOW,
        config,
        count: 5,
      }),
    ).toEqual([]);
  });

  it('es determinista y no depende del orden de entrada', () => {
    const first = advanceReviews({ cards, now: NOW, config, count: 3 });
    expect(advanceReviews({ cards: reorder(cards), now: NOW, config, count: 3 })).toEqual(first);
  });
});

describe('undoAssignments', () => {
  const moved: RescheduledCard[] = [
    { cardId: 'a', from: '2026-10-01T15:00:00.000Z', to: '2026-10-11T10:00:00.000Z' },
    { cardId: 'b', from: '2026-10-02T15:00:00.000Z', to: '2026-10-11T10:00:00.000Z' },
    { cardId: 'c', from: '2026-10-03T15:00:00.000Z', to: '2026-10-11T10:00:00.000Z' },
    { cardId: 'd', from: '2026-10-04T15:00:00.000Z', to: '2026-10-11T10:00:00.000Z' },
  ];

  it('regresa las que siguen en la fecha del cambio y respeta el orden', () => {
    const current: Record<string, string> = {
      a: '2026-10-11T10:00:00.000Z',
      b: '2026-10-11T10:00:00.000Z',
      c: '2026-10-11T10:00:00.000Z',
      d: '2026-10-11T10:00:00.000Z',
    };
    expect(undoAssignments({ moved, currentDue: (id) => current[id] ?? null })).toEqual([
      { cardId: 'a', from: '2026-10-11T10:00:00.000Z', to: '2026-10-01T15:00:00.000Z' },
      { cardId: 'b', from: '2026-10-11T10:00:00.000Z', to: '2026-10-02T15:00:00.000Z' },
      { cardId: 'c', from: '2026-10-11T10:00:00.000Z', to: '2026-10-03T15:00:00.000Z' },
      { cardId: 'd', from: '2026-10-11T10:00:00.000Z', to: '2026-10-04T15:00:00.000Z' },
    ]);
  });

  it('no toca la tarjeta que cambió después, ya sea porque la repasó, la movió o ya no existe', () => {
    const current: Record<string, string> = {
      a: '2026-10-11T10:00:00.000Z',
      // Repasada después del cambio, ahora vence otro día
      b: '2026-10-25T15:00:00.000Z',
      // Movida otra vez a la fecha anterior a mano
      c: '2026-10-03T15:00:00.000Z',
    };
    const undone = undoAssignments({ moved, currentDue: (id) => current[id] ?? null });
    expect(ids(undone)).toEqual(['a']);
  });

  it('reconoce la misma fecha aunque venga escrita con otro formato', () => {
    const undone = undoAssignments({
      moved: [moved[0] as RescheduledCard],
      currentDue: () => '2026-10-11T10:00:00Z',
    });
    expect(undone).toEqual([
      { cardId: 'a', from: '2026-10-11T10:00:00Z', to: '2026-10-01T15:00:00.000Z' },
    ]);
  });

  it('con una lista vacía no hace nada ni consulta fechas', () => {
    let calls = 0;
    const undone = undoAssignments({
      moved: [],
      currentDue: () => {
        calls += 1;
        return null;
      },
    });
    expect(undone).toEqual([]);
    expect(calls).toBe(0);
  });

  it('nunca produce una asignación donde from y to son iguales', () => {
    const odd: RescheduledCard = {
      cardId: 'x',
      from: '2026-10-11T10:00:00.000Z',
      to: '2026-10-11T10:00:00.000Z',
    };
    expect(undoAssignments({ moved: [odd], currentDue: () => odd.to })).toEqual([]);
  });

  it('deshacer un reparto devuelve cada tarjeta a su fecha original', () => {
    const cards = overdueByForgetting(24);
    const plan = spreadOverdue({ cards, now: NOW, config, days: 4 });
    const current = new Map(plan.assignments.map((entry) => [entry.cardId, entry.to]));
    const undone = undoAssignments({
      moved: plan.assignments,
      currentDue: (id) => current.get(id) ?? null,
    });
    expect(undone).toHaveLength(plan.assignments.length);
    for (const entry of undone) {
      const original = cards.find((item) => item.cardId === entry.cardId);
      expect(entry.to).toBe(original?.state?.due);
      expect(entry.from).toBe(current.get(entry.cardId));
    }
  });
});

describe('rescheduleBatches', () => {
  const assignments = (count: number): RescheduledCard[] =>
    Array.from({ length: count }, (_, index) => ({
      cardId: `c${index}`,
      from: '2026-10-01T15:00:00.000Z',
      to: '2026-10-11T10:00:00.000Z',
    }));

  it('parte en lotes de 500 conservando el orden', () => {
    const batches = rescheduleBatches(assignments(1_203));
    expect(batches.map((entry) => entry.length)).toEqual([500, 500, 203]);
    expect(batches.flat().map((entry) => entry.cardId)).toEqual(ids(assignments(1_203)));
  });

  it('maneja los bordes', () => {
    expect(rescheduleBatches([])).toEqual([]);
    expect(rescheduleBatches(assignments(1)).map((entry) => entry.length)).toEqual([1]);
    expect(rescheduleBatches(assignments(500)).map((entry) => entry.length)).toEqual([500]);
    expect(rescheduleBatches(assignments(501)).map((entry) => entry.length)).toEqual([500, 1]);
  });
});

describe('rendimiento con 5,000 tarjetas', () => {
  // Medido en desarrollo, cada acción tarda unos 10 ms. El límite es holgado a propósito para que no
  // sea frágil en el CI
  const LIMIT_MS = 500;
  const cards: QueueCard[] = [];
  for (let index = 0; index < 5_000; index += 1) {
    const id = `p${String(index).padStart(5, '0')}`;
    const kind = index % 10;
    if (kind < 3) {
      cards.push(
        card(id, new Date(NOW.getTime() - (1 + (index % 40)) * DAY_MS).toISOString(), {
          stability: 1 + (index % 50),
        }),
      );
    } else if (kind < 5) {
      cards.push(card(id, new Date(NOW.getTime() + (index % 8) * 3_600_000).toISOString()));
    } else if (kind < 8) {
      cards.push(card(id, new Date(NOW.getTime() + (2 + (index % 60)) * DAY_MS).toISOString()));
    } else if (kind === 8) {
      cards.push(freshCard(id));
    } else {
      cards.push(unseen(id));
    }
  }

  function timed<T>(action: () => T): { result: T; ms: number } {
    const start = performance.now();
    const result = action();
    return { result, ms: performance.now() - start };
  }

  it('repartir 1,500 atrasadas entre 7 días tarda menos de 500 ms', () => {
    const { result, ms } = timed(() => spreadOverdue({ cards, now: NOW, config, days: 7 }));
    expect(result.perDay.reduce((sum, entry) => sum + entry.count, 0)).toBe(1_500);
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it('contar atrasadas, posponer y adelantar tardan menos de 500 ms', () => {
    const overdue = timed(() => overdueCards(cards, NOW, TZ));
    const postponed = timed(() => postponeCards({ cards, now: NOW, config, days: 14 }));
    const advanced = timed(() => advanceReviews({ cards, now: NOW, config, count: 5_000 }));
    expect(overdue.result).toHaveLength(1_500);
    expect(postponed.result.length).toBeGreaterThan(0);
    expect(advanced.result.length).toBeGreaterThan(0);
    expect(overdue.ms).toBeLessThan(LIMIT_MS);
    expect(postponed.ms).toBeLessThan(LIMIT_MS);
    expect(advanced.ms).toBeLessThan(LIMIT_MS);
  });
});
