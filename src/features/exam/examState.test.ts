import { describe, expect, it } from 'vitest';
import { newId } from '@/data/testing/fixtures';
import {
  addFiredAlerts,
  answeredCount,
  answerOf,
  choose,
  createExamState,
  elapsedMs,
  ExamStateSchema,
  finishExamState,
  goTo,
  isClosed,
  markedCount,
  markNudged,
  markRecorded,
  markSessionEnded,
  recordShown,
  setQueuedErrors,
  remainingMs,
  setConfidence,
  toggleEliminated,
  toggleMarked,
} from './examState';
import { clearExamState, loadExamState, saveExamState } from './examStorage';

const T0 = 1_000_000;
const MINUTE = 60_000;

function fresh(questions = 5) {
  const ids = Array.from({ length: questions }, () => newId());
  const state = createExamState({
    examId: newId(),
    userId: newId(),
    seed: 'semilla',
    questionIds: ids,
    requested: questions,
    shortfall: 0,
    totalMs: 10 * MINUTE,
    nowMs: T0,
    highlight: false,
    askConfidence: false,
    alerts: true,
  });
  return { state, ids };
}

describe('estado del examen', () => {
  it('nace válido, en la primera pregunta y sin respuestas', () => {
    const { state } = fresh();
    expect(ExamStateSchema.safeParse(state).success).toBe(true);
    expect(state.current).toBe(0);
    expect(answeredCount(state)).toBe(0);
    expect(remainingMs(state, T0)).toBe(10 * MINUTE);
  });

  it('elige, cuenta los cambios y devuelve la opción anterior', () => {
    const { state, ids } = fresh();
    const [q] = ids as [string];
    const a = newId();
    const b = newId();
    const first = choose(state, q, a, T0 + 1000);
    expect(first).toMatchObject({ from: null, changed: true });
    expect(answerOf(first.state, q).changes).toBe(0);
    const second = choose(first.state, q, b, T0 + 2000);
    expect(second).toMatchObject({ from: a, changed: true });
    expect(answerOf(first.state, q).answeredAtMs).toBe(T0 + 1000);
    expect(answerOf(second.state, q)).toMatchObject({
      optionId: b,
      changes: 1,
      answeredAtMs: T0 + 2000,
    });
    const same = choose(second.state, q, b, T0 + 3000);
    expect(same.changed).toBe(false);
    expect(same.state).toBe(second.state);
    expect(answeredCount(second.state)).toBe(1);
  });

  it('descartar una opción no toca la respuesta y elegirla la vuelve a incluir', () => {
    const { state, ids } = fresh();
    const [q] = ids as [string];
    const [a, b, c] = [newId(), newId(), newId()];
    let next = choose(state, q, a, T0 + 1000).state;
    next = toggleEliminated(next, q, b);
    next = toggleEliminated(next, q, c);
    expect(answerOf(next, q).eliminated).toEqual([b, c]);
    // La elegida no se puede descartar
    expect(toggleEliminated(next, q, a)).toBe(next);
    // Volver a tocarla la incluye de nuevo, y elegirla también
    expect(answerOf(toggleEliminated(next, q, b), q).eliminated).toEqual([c]);
    expect(answerOf(choose(next, q, c, T0 + 2000).state, q).eliminated).toEqual([b]);
  });

  it('marca para revisar, guarda la confianza y fija las opciones mostradas una sola vez', () => {
    const { state, ids } = fresh();
    const [q] = ids as [string];
    const [a, b] = [newId(), newId()];
    let next = toggleMarked(state, q);
    expect(markedCount(next)).toBe(1);
    next = toggleMarked(next, q);
    expect(markedCount(next)).toBe(0);
    next = setConfidence(next, q, 'sure');
    expect(answerOf(next, q).confidence).toBe('sure');
    next = recordShown(next, q, [a, b]);
    expect(next.shownOptions[q]).toEqual([a, b]);
    expect(answerOf(next, q).shown).toBe(true);
    // No cambia si ya estaban fijadas
    expect(recordShown(next, q, [b, a])).toBe(next);
    expect(markNudged(next, q).answers[q]?.nudged).toBe(true);
  });

  it('suma el tiempo de cada visita a la pregunta que deja', () => {
    const { state, ids } = fresh();
    const [q1, q2] = ids as [string, string];
    let next = goTo(state, 1, T0 + 30_000);
    expect(next.current).toBe(1);
    expect(answerOf(next, q1).msSpent).toBe(30_000);
    next = goTo(next, 0, T0 + 50_000);
    expect(answerOf(next, q2).msSpent).toBe(20_000);
    next = goTo(next, 1, T0 + 80_000);
    expect(answerOf(next, q1).msSpent).toBe(60_000);
    // Ir a la misma pregunta no suma ni cambia nada
    expect(goTo(next, 1, T0 + 90_000)).toBe(next);
    // Los índices se acotan
    expect(goTo(next, 99, T0 + 90_000).current).toBe(4);
    expect(goTo(next, -3, T0 + 90_000).current).toBe(0);
  });

  it('el tiempo transcurrido no pasa del total y el cierre deja de contarlo', () => {
    const { state } = fresh();
    expect(elapsedMs(state, T0 + 3 * MINUTE)).toBe(3 * MINUTE);
    expect(remainingMs(state, T0 + 30 * MINUTE)).toBe(0);
    const closed = finishExamState(state, T0 + 4 * MINUTE, 'completed');
    expect(closed.finishedAtMs).toBe(T0 + 4 * MINUTE);
    expect(elapsedMs(closed, T0 + 9 * MINUTE)).toBe(4 * MINUTE);
  });

  it('si el tiempo se acabó con la pestaña cerrada, el cierre queda en el límite', () => {
    const { state, ids } = fresh();
    const [q] = ids as [string];
    const closed = finishExamState(state, T0 + 2 * 60 * MINUTE, 'time_up');
    expect(closed.finishedAtMs).toBe(T0 + 10 * MINUTE);
    expect(closed.endReason).toBe('time_up');
    // La pregunta en la que estaba solo cuenta hasta el límite
    expect(answerOf(closed, q).msSpent).toBe(10 * MINUTE);
    // Cerrar dos veces no cambia nada y un examen cerrado no navega
    expect(finishExamState(closed, T0 + 99 * MINUTE, 'abandoned')).toBe(closed);
    expect(goTo(closed, 2, T0 + 99 * MINUTE)).toBe(closed);
  });

  it('una respuesta elegida después del límite no cuenta, como en el examen real', () => {
    const { state, ids } = fresh();
    const [q] = ids as [string];
    const option = newId();
    const late = choose(state, q, option, T0 + 10 * MINUTE);
    expect(late).toMatchObject({ changed: false, from: null });
    expect(late.state).toBe(state);
    expect(choose(state, q, option, T0 + 10 * MINUTE + 400).changed).toBe(false);
    // Un instante antes del límite sí cuenta
    expect(choose(state, q, option, T0 + 10 * MINUTE - 1).changed).toBe(true);
  });

  it('con el examen cerrado ya no cambia ninguna respuesta, marca ni descarte', () => {
    const { state, ids } = fresh();
    const [q] = ids as [string];
    const [a, b] = [newId(), newId()];
    const answered = choose(state, q, a, T0 + 1000).state;
    const closed = finishExamState(answered, T0 + 2000, 'completed');
    expect(choose(closed, q, b, T0 + 3000)).toMatchObject({ changed: false, from: a });
    expect(choose(closed, q, b, T0 + 3000).state).toBe(closed);
    expect(toggleMarked(closed, q)).toBe(closed);
    expect(toggleEliminated(closed, q, b)).toBe(closed);
    expect(setConfidence(closed, q, 'sure')).toBe(closed);
  });

  it('registra los avisos de tiempo una sola vez', () => {
    const { state } = fresh();
    const next = addFiredAlerts(state, ['half', 'pace-20']);
    expect(next.firedAlerts).toEqual(['half', 'pace-20']);
    expect(addFiredAlerts(next, ['half'])).toBe(next);
    expect(addFiredAlerts(next, ['half', 'quarter']).firedAlerts).toEqual([
      'half',
      'pace-20',
      'quarter',
    ]);
  });
});

describe('cierre del examen', () => {
  it('solo está cerrado cuando terminó, quedó en la bitácora y pasaron los errores al repaso', () => {
    const { state } = fresh();
    expect(isClosed(state)).toBe(false);
    const finished = finishExamState(state, T0 + MINUTE, 'completed');
    expect(isClosed(finished)).toBe(false);
    const ended = markSessionEnded(finished, 3);
    expect(ended).toMatchObject({ sessionEnded: true, correct: 3 });
    expect(isClosed(ended)).toBe(false);
    expect(isClosed(setQueuedErrors(ended, 0))).toBe(true);
    // Sin terminar nunca está cerrado, aunque los pasos ya estén anotados
    expect(isClosed(setQueuedErrors(markSessionEnded(state, 0), 0))).toBe(false);
  });

  it('anota cada respuesta registrada una sola vez, con su XP', () => {
    const { state, ids } = fresh();
    const [q] = ids as [string];
    const once = markRecorded(state, q, 12);
    expect(once).toMatchObject({ recorded: [q], xp: 12 });
    expect(markRecorded(once, q, 12)).toBe(once);
  });

  it('un examen guardado antes de existir el campo de aciertos se lee con null', () => {
    const { state } = fresh();
    const { correct: _correct, ...old } = state;
    const parsed = ExamStateSchema.safeParse(old);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.correct).toBeNull();
  });
});

describe('examen guardado en el navegador', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
      data,
    };
  };

  it('guarda y recupera el mismo estado', () => {
    const { state, ids } = fresh();
    const [q] = ids as [string];
    const progressed = choose(toggleMarked(state, q), q, newId(), T0 + 1000).state;
    const storage = memory();
    saveExamState(progressed, storage);
    expect(loadExamState(progressed.userId, storage)).toEqual(progressed);
  });

  it('ignora contenido dañado, de otro alumno o con otra versión', () => {
    const { state } = fresh();
    const storage = memory();
    saveExamState(state, storage);
    expect(loadExamState(newId(), storage)).toBeNull();
    storage.setItem(`enarm.exam.v1.${state.userId}`, '{no es json');
    expect(loadExamState(state.userId, storage)).toBeNull();
    storage.setItem(`enarm.exam.v1.${state.userId}`, JSON.stringify({ ...state, version: 7 }));
    expect(loadExamState(state.userId, storage)).toBeNull();
  });

  it('un almacenamiento que falla no rompe nada', () => {
    const { state } = fresh();
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('lleno');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(() => {
      saveExamState(state, broken);
    }).not.toThrow();
    expect(loadExamState(state.userId, broken)).toBeNull();
    expect(() => {
      clearExamState(state.userId, broken);
    }).not.toThrow();
  });

  it('borrar quita el examen', () => {
    const { state } = fresh();
    const storage = memory();
    saveExamState(state, storage);
    clearExamState(state.userId, storage);
    expect(loadExamState(state.userId, storage)).toBeNull();
  });
});
