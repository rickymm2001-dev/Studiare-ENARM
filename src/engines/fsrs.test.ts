import { default_w } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { FsrsCardState } from '@/data/schemas/common';
import {
  buildDailyQueue,
  examDeadline,
  fromFsrsCard,
  isLeech,
  newCardState,
  previewReview,
  projectLoad,
  retentionFor,
  retrievabilityOf,
  scheduleReview,
  toFsrsCard,
  type QueueCard,
  type SchedulerConfig,
} from './fsrs';

const NOW = new Date('2026-10-01T15:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const config: SchedulerConfig = {
  desiredRetention: 0.9,
  examDate: null,
  timeZone: 'America/Merida',
  thresholds: DEFAULT_THRESHOLDS.fsrs,
};

/** Tarjeta madura con varios repasos buenos, el último antes de NOW */
function matureCard(): FsrsCardState {
  let state: FsrsCardState | null = null;
  let at = NOW.getTime() - 400 * DAY;
  for (let review = 0; review < 8 && at < NOW.getTime(); review += 1) {
    state = scheduleReview(state, 'good', new Date(at), config).state;
    at = new Date(state.due).getTime();
  }
  return state as FsrsCardState;
}

describe('fsrs (7.1)', () => {
  it('convierte de ida y vuelta entre el esquema y ts-fsrs', () => {
    const state = matureCard();
    expect(fromFsrsCard(toFsrsCard(state))).toEqual(state);
    const fresh = newCardState(NOW);
    expect(fresh.state).toBe('new');
    expect(fromFsrsCard(toFsrsCard(fresh))).toEqual(fresh);
  });

  it('una nueva con Bien entra a aprendizaje y con Fácil pasa a repaso en días', () => {
    const preview = previewReview(null, NOW, config);
    expect(preview.good.state.state).toBe('learning');
    expect(new Date(preview.again.state.due).getTime() - NOW.getTime()).toBe(60 * 1000);
    expect(preview.easy.state.state).toBe('review');
    expect(preview.easy.state.scheduledDays).toBeGreaterThanOrEqual(1);
  });

  it('un error en una madura suma un lapso y la regresa a reaprendizaje', () => {
    const state = matureCard();
    const after = scheduleReview(state, 'again', new Date(state.due), config).state;
    expect(after.lapses).toBe(state.lapses + 1);
    expect(after.state).toBe('relearning');
  });

  it('la retención sube a 0.93 en los últimos 30 días y no baja la del alumno', () => {
    expect(retentionFor(config, NOW)).toEqual({
      retention: 0.9,
      examWindow: false,
      daysToExam: null,
    });
    expect(retentionFor({ ...config, examDate: '2026-10-21' }, NOW)).toMatchObject({
      retention: 0.93,
      examWindow: true,
      daysToExam: 20,
    });
    expect(retentionFor({ ...config, examDate: '2026-11-30' }, NOW)).toMatchObject({
      retention: 0.9,
      examWindow: false,
    });
    expect(
      retentionFor({ ...config, desiredRetention: 0.95, examDate: '2026-10-21' }, NOW).retention,
    ).toBe(0.95);
    expect(retentionFor({ ...config, examDate: '2026-09-01' }, NOW).examWindow).toBe(false);
  });

  it('en modo examen el vencimiento no pasa del inicio del día del ENARM', () => {
    const examConfig = { ...config, examDate: '2026-10-04' };
    const deadline = examDeadline(examConfig);
    expect(deadline?.toISOString()).toBe('2026-10-04T10:00:00.000Z');
    const state = matureCard();
    const outcome = scheduleReview(state, 'easy', NOW, examConfig);
    expect(outcome.examCapped).toBe(true);
    expect(outcome.state.due).toBe('2026-10-04T10:00:00.000Z');
    expect(outcome.state.scheduledDays).toBeLessThanOrEqual(3);
    // Después del ENARM ya no se recorta
    const later = scheduleReview(state, 'easy', new Date('2026-10-05T15:00:00.000Z'), examConfig);
    expect(later.examCapped).toBe(false);
  });

  it('marca sanguijuela con 8 lapsos', () => {
    const state = matureCard();
    expect(isLeech({ ...state, lapses: 7 }, config.thresholds)).toBe(false);
    expect(isLeech({ ...state, lapses: 8 }, config.thresholds)).toBe(true);
    expect(isLeech(null, config.thresholds)).toBe(false);
  });

  it('la retrievability es 0 en nuevas y baja con el tiempo', () => {
    expect(retrievabilityOf(null, NOW)).toBe(0);
    expect(retrievabilityOf(newCardState(NOW), NOW)).toBe(0);
    const state = matureCard();
    const reviewed = new Date(state.lastReview as string);
    const soon = retrievabilityOf(state, new Date(reviewed.getTime() + DAY));
    const late = retrievabilityOf(state, new Date(reviewed.getTime() + 200 * DAY));
    expect(soon).toBeGreaterThan(late);
    expect(soon).toBeLessThanOrEqual(1);
  });

  it('si el reloj quedó antes del último repaso, programa desde el último repaso', () => {
    const state = matureCard();
    const lastReview = new Date(state.lastReview as string);
    const past = new Date(lastReview.getTime() - 5 * DAY);
    expect(scheduleReview(state, 'good', past, config).state).toEqual(
      scheduleReview(state, 'good', lastReview, config).state,
    );
    expect(retrievabilityOf(state, past)).toBeCloseTo(1, 6);
  });

  it('los pesos por alumno son un punto de extensión que respeta los valores por defecto', () => {
    const custom = scheduleReview(null, 'good', NOW, { ...config, weights: default_w });
    expect(custom.state).toEqual(scheduleReview(null, 'good', NOW, config).state);
  });
});

describe('cola del día', () => {
  /** Repasada hace tiempo y vencida hace daysAgo días. Más vencida, menor retrievability */
  const overdue = (cardId: string, noteId: string, daysAgo: number): QueueCard => {
    const state = matureCard();
    const due = NOW.getTime() - daysAgo * DAY;
    return {
      cardId,
      noteId,
      state: {
        ...state,
        due: new Date(due).toISOString(),
        lastReview: new Date(due - state.scheduledDays * DAY).toISOString(),
      },
    };
  };

  it('ordena por retrievability, respeta límites y entierra hermanas', () => {
    const cards: QueueCard[] = [
      overdue('a1', 'nota-a', 1),
      overdue('a2', 'nota-a', 30),
      overdue('b1', 'nota-b', 10),
      overdue('c1', 'nota-c', 5),
      { cardId: 'n1', noteId: 'nota-n', state: null },
      { cardId: 'n2', noteId: 'nota-n', state: null },
      { cardId: 'n3', noteId: 'nota-m', state: null },
      {
        cardId: 'futura',
        noteId: 'nota-f',
        state: { ...matureCard(), due: new Date(NOW.getTime() + 5 * DAY).toISOString() },
      },
    ];
    const queue = buildDailyQueue({
      cards,
      now: NOW,
      config: {
        ...config,
        thresholds: { ...config.thresholds, reviewsPerDay: 2, newCardsPerDay: 5 },
      },
      reviewedToday: { newCount: 0, reviewCount: 0, noteIds: [] },
    });
    // a2 es la más vencida, así que tiene menor retrievability. a1 es su hermana y se entierra
    expect(queue.reviews.map((card) => card.cardId)).toEqual(['a2', 'b1']);
    expect(queue.reviewsOverLimit).toBe(1);
    expect(queue.buriedSiblings).toEqual(['a1', 'n2']);
    expect(queue.newCards.map((card) => card.cardId)).toEqual(['n1', 'n3']);
  });

  it('descuenta lo que ya se hizo hoy y las notas ya vistas', () => {
    const queue = buildDailyQueue({
      cards: [
        overdue('a1', 'nota-a', 3),
        overdue('b1', 'nota-b', 3),
        { cardId: 'n1', noteId: 'nota-n', state: null },
      ],
      now: NOW,
      config,
      reviewedToday: { newCount: 20, reviewCount: 199, noteIds: ['nota-b'] },
    });
    expect(queue.reviews.map((card) => card.cardId)).toEqual(['a1']);
    expect(queue.buriedSiblings).toEqual(['b1']);
    expect(queue.newCards).toEqual([]);
    expect(queue.newOverLimit).toBe(1);
  });
});

describe('carga futura', () => {
  it('cuenta repasos e introduce nuevas al ritmo del límite', () => {
    const cards: QueueCard[] = [
      {
        cardId: 'm',
        noteId: 'nm',
        state: { ...matureCard(), due: new Date(NOW.getTime() + 2 * DAY).toISOString() },
      },
      ...Array.from({ length: 45 }, (_, index) => ({
        cardId: `n${index}`,
        noteId: `nn${index}`,
        state: null,
      })),
    ];
    const load = projectLoad({ cards, now: NOW, config, days: 30 });
    expect(load).toHaveLength(30);
    expect(load[0]?.day).toBe('2026-10-01');
    expect(load.map((day) => day.newCards).slice(0, 4)).toEqual([20, 20, 5, 0]);
    expect(load[2]?.reviews).toBeGreaterThan(0);
    const total = load.reduce((sum, day) => sum + day.reviews, 0);
    expect(total).toBeGreaterThan(45);
  });

  it('con cero nuevas por día solo cuenta repasos y respeta 60 días', () => {
    const load = projectLoad({
      cards: [{ cardId: 'n', noteId: 'n', state: null }],
      now: NOW,
      config: { ...config, thresholds: { ...config.thresholds, newCardsPerDay: 0 } },
      days: 60,
    });
    expect(load).toHaveLength(60);
    expect(load.every((day) => day.newCards === 0 && day.reviews === 0)).toBe(true);
  });

  it('en modo examen ningún repaso proyectado cae después del ENARM', () => {
    const examConfig = { ...config, examDate: '2026-10-20' };
    const load = projectLoad({
      cards: Array.from({ length: 30 }, (_, index) => ({
        cardId: `n${index}`,
        noteId: `n${index}`,
        state: null,
      })),
      now: NOW,
      config: examConfig,
      days: 18,
    });
    expect(load.at(-1)?.day).toBe('2026-10-18');
    expect(load.reduce((sum, day) => sum + day.reviews, 0)).toBeGreaterThan(30);
  });
});
