import { describe, expect, it } from 'vitest';
import {
  choose,
  createExamState,
  finishExamState,
  markRecorded,
  markSessionEnded,
  setQueuedErrors,
  type ExamState,
} from './examState';
import { newId } from '@/data/testing/fixtures';
import { saveExamState } from './examStorage';
import { hasPendingClose, loadPendingClose } from './pendingClose';

const T0 = Date.parse('2026-10-29T15:00:00.000Z');
const USER = newId();
const OTHER_USER = newId();
const EXAM = newId();
const QUESTIONS = [newId(), newId()] as const;
const OPTION = newId();

function started(): ExamState {
  return createExamState({
    examId: EXAM,
    userId: USER,
    seed: 'seed',
    questionIds: QUESTIONS,
    requested: 2,
    shortfall: 0,
    totalMs: 10 * 60_000,
    nowMs: T0,
    highlight: false,
    askConfidence: false,
    alerts: false,
  });
}

/** Terminado por el alumno, con una respuesta elegida y nada registrado todavía */
const finished = () =>
  finishExamState(choose(started(), QUESTIONS[0], OPTION, T0 + 5000).state, T0 + 9000, 'completed');

/** Un almacenamiento en memoria, para no depender del navegador */
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

describe('cierre pendiente de un examen', () => {
  it('sin examen no hay nada que retomar', () => {
    expect(hasPendingClose(null)).toBe(false);
  });

  it('un examen en curso no cuenta, aunque ya tenga respuestas', () => {
    const inProgress = choose(started(), QUESTIONS[0], OPTION, T0 + 5000).state;
    expect(hasPendingClose(inProgress)).toBe(false);
  });

  it('un examen terminado sin registrar nada queda pendiente', () => {
    expect(hasPendingClose(finished())).toBe(true);
  });

  it('también queda pendiente si se cortó a la mitad del cierre', () => {
    // Con la respuesta registrada pero sin el fin de la sesión
    const answered = markRecorded(finished(), QUESTIONS[0], 10);
    expect(hasPendingClose(answered)).toBe(true);
    // Con el fin de la sesión pero sin los errores en el repaso
    expect(hasPendingClose(markSessionEnded(answered, 1))).toBe(true);
  });

  it('terminado por tiempo o abandonado también queda pendiente', () => {
    expect(hasPendingClose(finishExamState(started(), T0 + 11 * 60_000, 'time_up'))).toBe(true);
    expect(hasPendingClose(finishExamState(started(), T0 + 1000, 'abandoned'))).toBe(true);
  });

  it('un examen cerrado del todo ya no tiene nada pendiente', () => {
    const closed = setQueuedErrors(
      markSessionEnded(markRecorded(finished(), QUESTIONS[0], 10), 1),
      0,
    );
    expect(hasPendingClose(closed)).toBe(false);
  });

  it('busca el examen guardado del alumno y lo devuelve solo si falta cerrarlo', () => {
    const storage = memoryStorage();
    expect(loadPendingClose(USER, storage)).toBeNull();

    saveExamState(started(), storage);
    expect(loadPendingClose(USER, storage)).toBeNull();

    const pending = finished();
    saveExamState(pending, storage);
    expect(loadPendingClose(USER, storage)).toEqual(pending);
    // El examen es de otro alumno
    expect(loadPendingClose(OTHER_USER, storage)).toBeNull();

    saveExamState(setQueuedErrors(markSessionEnded(pending, 0), 0), storage);
    expect(loadPendingClose(USER, storage)).toBeNull();
  });
});
