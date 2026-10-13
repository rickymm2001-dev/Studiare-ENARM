import { describe, expect, it } from 'vitest';
import { AppEventSchema, type AppEvent } from '@/data/schemas/events';
import {
  ERROR_MOTIVES,
  LEGACY_CAUSE_EQUIVALENCE,
  LEGACY_ERROR_CAUSES,
  READING_MOTIVES,
  errorMotives,
  isErrorMotive,
  latestMotive,
  motiveOf,
  motivesByAttempt,
  motivesByGroup,
  reportedMotives,
  topMotive,
  type StoredErrorCause,
} from './errorCauses';

// IDs con forma de ULID, en orden, para que el esquema de la bitácora los acepte
let counter = 0;
const id = () => {
  counter += 1;
  return `01J${String(counter).padStart(23, '0')}`;
};
const USER = id();
const Q1 = id();
const Q1_STABLE = id();
const CARD = id();
const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 15, minute)).toISOString();

function envelope(minute: number) {
  return {
    id: id(),
    userId: USER,
    at: at(minute),
    tz: 'America/Merida',
    schemaVersion: 1,
    sessionId: null,
  };
}

const answered = (minute: number, correct: boolean, questionVersionId = Q1): AppEvent =>
  AppEventSchema.parse({
    ...envelope(minute),
    type: 'question_answered',
    payload: {
      questionVersionId,
      optionVersionId: id(),
      correct,
      confidence: null,
      msToAnswer: 40_000,
      changeCount: 0,
      highlightEnabled: false,
    },
  });

const reviewed = (minute: number, rating: 'again' | 'good'): AppEvent =>
  AppEventSchema.parse({
    ...envelope(minute),
    type: 'card_reviewed',
    payload: {
      cardId: CARD,
      deckId: id(),
      source: 'card',
      rating,
      confidence: null,
      msToReveal: 1000,
      msToRate: 1000,
      stateBefore: null,
      stateAfter: {
        due: at(minute + 10),
        stability: 1,
        difficulty: 5,
        scheduledDays: 0,
        learningSteps: 0,
        reps: 1,
        lapses: 0,
        state: 'learning',
        lastReview: at(minute),
      },
    },
  });

/** Un reporte guardado, con un motivo de hoy o una causa de antes */
const reported = (
  minute: number,
  cause: StoredErrorCause,
  target: { kind: 'question' | 'card'; id: string } = { kind: 'question', id: Q1 },
): AppEvent =>
  AppEventSchema.parse({
    ...envelope(minute),
    type: 'cause_reported',
    payload: { targetKind: target.kind, targetId: target.id, cause },
  });

describe('los siete motivos y la tabla de equivalencias (4.23)', () => {
  it('son los siete de Ricardo en su orden', () => {
    expect(ERROR_MOTIVES).toEqual([
      'knowledge',
      'time',
      'misinterpretation',
      'superficial_reading',
      'anxiety',
      'overconfidence',
      'fatigue',
    ]);
  });

  it('cada una de las ocho causas de antes tiene su equivalencia', () => {
    expect(Object.keys(LEGACY_CAUSE_EQUIVALENCE).sort()).toEqual([...LEGACY_ERROR_CAUSES].sort());
    expect(LEGACY_CAUSE_EQUIVALENCE).toEqual({
      not_studied: 'knowledge',
      forgot: 'knowledge',
      confused: 'knowledge',
      misread: 'misinterpretation',
      missed_detail: 'superficial_reading',
      rushed_or_tired: 'time',
      changed_answer: 'anxiety',
      other: null,
    });
    // Ninguna causa vieja se llama igual que un motivo, así un valor guardado nunca es ambiguo
    expect(LEGACY_ERROR_CAUSES.some((cause) => isErrorMotive(cause))).toBe(false);
  });

  it('un motivo de hoy se lee igual y una causa vieja con la tabla', () => {
    for (const motive of ERROR_MOTIVES) expect(motiveOf(motive)).toBe(motive);
    expect(motiveOf('forgot')).toBe('knowledge');
    expect(motiveOf('rushed_or_tired')).toBe('time');
    expect(motiveOf('other')).toBeNull();
  });

  it('las dos de lectura son Malinterpretación y Lectura superficial', () => {
    expect([...READING_MOTIVES].sort()).toEqual(['misinterpretation', 'superficial_reading']);
  });
});

describe('el motivo vigente de cada error', () => {
  it('cambiar de motivo es otro evento y vale el último, sin importar el orden en que lleguen', () => {
    const error = answered(0, false);
    const events = [reported(3, 'fatigue'), error, reported(1, 'knowledge'), reported(2, 'time')];
    const entries = errorMotives(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      attemptId: error.id,
      failed: true,
      kind: 'question',
      targetId: Q1,
      motive: 'fatigue',
      at: at(3),
    });
    expect(motivesByAttempt(entries).get(error.id)).toBe('fatigue');
  });

  it('un reporte explica el intento más reciente de su pregunta y no los anteriores', () => {
    const first = answered(0, false);
    const second = answered(100, false);
    const entries = errorMotives([first, reported(1, 'anxiety'), second, reported(101, 'time')]);
    const byAttempt = motivesByAttempt(entries);
    expect(byAttempt.get(first.id)).toBe('anxiety');
    expect(byAttempt.get(second.id)).toBe('time');
  });

  it('una causa vieja se lee con la tabla y un motivo nuevo después la reemplaza', () => {
    const error = answered(0, false);
    expect(
      motivesByAttempt(errorMotives([error, reported(1, 'missed_detail')])).get(error.id),
    ).toBe('superficial_reading');
    expect(
      motivesByAttempt(
        errorMotives([error, reported(1, 'missed_detail'), reported(2, 'anxiety')]),
      ).get(error.id),
    ).toBe('anxiety');
  });

  it('un reporte con el ID estable de la pregunta encuentra su intento con los alias', () => {
    const error = answered(0, false);
    const events = [error, reported(1, 'overconfidence', { kind: 'question', id: Q1_STABLE })];
    expect(motivesByAttempt(errorMotives(events)).get(error.id)).toBeUndefined();
    const withAliases = errorMotives(events, {
      aliases: (version) => (version === Q1 ? [Q1_STABLE] : []),
    });
    expect(motivesByAttempt(withAliases).get(error.id)).toBe('overconfidence');
  });

  it('en tarjetas se ata al repaso fallado y un reporte sin intento queda suelto', () => {
    const lapse = reviewed(0, 'again');
    const entries = errorMotives([
      lapse,
      reported(1, 'fatigue', { kind: 'card', id: CARD }),
      reported(2, 'time', { kind: 'question', id: id() }),
    ]);
    expect(motivesByAttempt(entries).get(lapse.id)).toBe('fatigue');
    expect(entries.find((entry) => entry.attemptId === null)).toMatchObject({
      failed: null,
      motive: 'time',
    });
  });

  it('para contar deja fuera lo que se lee sin motivo y lo atado a un acierto', () => {
    const entries = errorMotives([
      answered(0, false, Q1),
      reported(1, 'other'),
      answered(2, true, Q1_STABLE),
      reported(3, 'knowledge', { kind: 'question', id: Q1_STABLE }),
      reported(4, 'time', { kind: 'question', id: id() }),
    ]);
    expect(reportedMotives(entries).map((entry) => entry.motive)).toEqual(['time']);
  });
});

describe('empates y eventos ajenos', () => {
  it('con el mismo momento gana el reporte de ID mayor y los demás eventos no cuentan', () => {
    const error = answered(0, false);
    const unrelated = AppEventSchema.parse({
      ...envelope(1),
      type: 'session_started',
      payload: { kind: 'exam', config: {} },
    });
    const first = reported(2, 'knowledge');
    const second = reported(2, 'anxiety');
    const older = reported(1, 'time');
    for (const order of [
      [second, unrelated, error, first, older],
      [first, older, error, second, unrelated],
    ]) {
      expect(motivesByAttempt(errorMotives(order)).get(error.id)).toBe('anxiety');
      expect(latestMotive(order, { kind: 'question', ids: [Q1] }, at(0))).toBe('anxiety');
    }
  });
});

describe('el motivo que ya marcó, para la revisión', () => {
  it('es el último desde el momento pedido, de cualquiera de los IDs de la pregunta', () => {
    const events = [
      reported(1, 'knowledge'),
      reported(5, 'time', { kind: 'question', id: Q1_STABLE }),
      reported(6, 'fatigue', { kind: 'card', id: Q1 }),
    ];
    const target = { kind: 'question' as const, ids: [Q1, Q1_STABLE] };
    expect(latestMotive(events, target, at(0))).toBe('time');
    expect(latestMotive(events, { kind: 'question', ids: [Q1] }, at(0))).toBe('knowledge');
    // Lo de un examen anterior no cuenta para este
    expect(latestMotive(events, target, at(10))).toBeNull();
    expect(latestMotive([reported(1, 'changed_answer')], target, at(0))).toBe('anxiety');
  });
});

describe('el reparto de motivos', () => {
  it('cuenta por grupo, del motivo más marcado al menos y en empate en el orden de Ricardo', () => {
    const rows = motivesByGroup([
      { group: 'pediatrics', motive: 'fatigue' },
      { group: 'internal_medicine', motive: 'time' },
      { group: 'internal_medicine', motive: 'knowledge' },
      { group: 'internal_medicine', motive: 'time' },
    ]);
    expect(rows).toEqual([
      {
        group: 'internal_medicine',
        total: 3,
        motives: [
          { motive: 'time', count: 2 },
          { motive: 'knowledge', count: 1 },
        ],
      },
      { group: 'pediatrics', total: 1, motives: [{ motive: 'fatigue', count: 1 }] },
    ]);
    expect(
      motivesByGroup([
        { group: 'g', motive: 'fatigue' },
        { group: 'g', motive: 'knowledge' },
      ])[0]?.motives.map((entry) => entry.motive),
    ).toEqual(['knowledge', 'fatigue']);
  });

  it('el motivo principal dice cuántas veces y de cuántos', () => {
    expect(topMotive(['anxiety', 'time', 'anxiety'])).toEqual({
      motive: 'anxiety',
      count: 2,
      total: 3,
    });
    expect(topMotive([])).toBeNull();
  });
});
