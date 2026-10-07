import { describe, expect, it } from 'vitest';
import { newId } from '@/data/testing/fixtures';
import { DUEL_QUESTIONS } from '@/engines/party';
import { answered, event, minute, option, question } from '../tutor/testing/fixtures';
import { duelSize, duelView, playerDuelResult, simulatedDuelResult, verdictFor } from './duels';

const duelId = newId();
const questions = Array.from({ length: 3 }, () => question({ id: newId() }));
const right = option(newId(), true, 'Correcta');
const wrong = option(newId(), false, 'Incorrecta');
const challenge = { id: duelId, questionIds: questions.map((item) => item.id) };
const SELF = 'yo';
const sessionA = newId();
const sessionB = newId();

const started = (session: string, at: number, id = duelId) =>
  event('session_started', { kind: 'challenge', config: { duelId: id, count: 3 } }, at, session);
const ended = (session: string, at: number, reason: 'completed' | 'abandoned' = 'completed') =>
  event(
    'session_ended',
    { kind: 'challenge', reason, items: 3, correct: 2, durationMs: 90_000, xp: 30 },
    at,
    session,
  );
const answer = (index: number, correct: boolean, ms: number, session: string, at: number) =>
  answered(
    questions[index] ?? question({ id: newId() }),
    correct ? right.id : wrong.id,
    correct,
    at,
    { msToAnswer: ms },
    session,
  );

describe('resultado del alumno en un duelo', () => {
  it('sin jugar no hay resultado', () => {
    expect(playerDuelResult([], challenge, SELF)).toBeNull();
    // Empezó pero no terminó, así que todavía puede jugarlo
    expect(playerDuelResult([started(sessionA, minute(0))], challenge, SELF)).toBeNull();
  });

  it('cuenta aciertos y suma lo que tardó en contestar, no la sesión completa', () => {
    const events = [
      started(sessionA, minute(0)),
      answer(0, true, 20_000, sessionA, minute(1)),
      answer(1, false, 30_000, sessionA, minute(2)),
      answer(2, true, 10_000, sessionA, minute(3)),
      ended(sessionA, minute(10)),
    ];
    expect(playerDuelResult(events, challenge, SELF)).toEqual({
      memberId: SELF,
      correct: 2,
      answered: 3,
      totalMs: 60_000,
    });
  });

  it('las preguntas sin contestar cuentan como incorrectas porque el denominador es el duelo', () => {
    const events = [
      started(sessionA, minute(0)),
      answer(0, true, 20_000, sessionA, minute(1)),
      ended(sessionA, minute(2), 'abandoned'),
    ];
    expect(playerDuelResult(events, challenge, SELF)).toMatchObject({ correct: 1, answered: 3 });
  });

  it('ignora respuestas de otras sesiones y de preguntas que no son del duelo', () => {
    const outsider = question({ id: newId() });
    const events = [
      started(sessionA, minute(0)),
      answer(0, true, 10_000, sessionA, minute(1)),
      answer(1, true, 10_000, sessionB, minute(2)),
      answered(outsider, right.id, true, minute(3), { msToAnswer: 99_000 }, sessionA),
      ended(sessionA, minute(4)),
    ];
    expect(playerDuelResult(events, challenge, SELF)).toMatchObject({
      correct: 1,
      totalMs: 10_000,
    });
  });

  it('una pregunta repetida cuenta una sola vez, la primera', () => {
    const events = [
      started(sessionA, minute(0)),
      answer(0, false, 10_000, sessionA, minute(1)),
      answer(0, true, 5_000, sessionA, minute(2)),
      ended(sessionA, minute(3)),
    ];
    expect(playerDuelResult(events, challenge, SELF)).toMatchObject({
      correct: 0,
      totalMs: 10_000,
    });
  });

  it('una sesión de otro duelo o una práctica libre no cuenta', () => {
    const events = [
      started(sessionA, minute(0), newId()),
      answer(0, true, 10_000, sessionA, minute(1)),
      ended(sessionA, minute(2)),
    ];
    expect(playerDuelResult(events, challenge, SELF)).toBeNull();
  });
});

describe('rival simulado', () => {
  const rival = { id: newId() };

  it('es estable para el mismo compañero y duelo, y cambia con otro duelo', () => {
    const first = simulatedDuelResult(rival, challenge);
    expect(simulatedDuelResult(rival, challenge)).toEqual(first);
    const other = simulatedDuelResult(rival, { ...challenge, id: newId() });
    expect(other.memberId).toBe(first.memberId);
  });

  it('queda dentro de lo posible y contesta todas las preguntas del duelo', () => {
    for (let index = 0; index < 40; index += 1) {
      const result = simulatedDuelResult({ id: newId() }, { id: newId(), questionIds: undefined });
      expect(result.answered).toBe(DUEL_QUESTIONS);
      expect(result.correct).toBeGreaterThanOrEqual(0);
      expect(result.correct).toBeLessThanOrEqual(DUEL_QUESTIONS);
      expect(result.totalMs).toBeGreaterThan(0);
    }
  });

  it('los compañeros no son todos iguales', () => {
    const results = Array.from({ length: 20 }, () =>
      simulatedDuelResult({ id: newId() }, challenge),
    );
    expect(new Set(results.map((result) => result.correct)).size).toBeGreaterThan(1);
  });

  it('el tamaño del duelo es el de las preguntas fijadas, o 20 si no hay', () => {
    expect(duelSize(challenge)).toBe(3);
    expect(duelSize({})).toBe(DUEL_QUESTIONS);
  });
});

describe('quién gana', () => {
  const result = (memberId: string, correct: number, totalMs: number) => ({
    memberId,
    correct,
    answered: 20,
    totalMs,
  });

  it('gana quien acierta más, aunque tarde más', () => {
    expect(verdictFor(result('yo', 15, 900_000), result('rival', 12, 300_000))).toEqual({
      kind: 'win',
      by: 'accuracy',
    });
    expect(verdictFor(result('yo', 11, 100_000), result('rival', 12, 900_000))).toEqual({
      kind: 'lose',
      by: 'accuracy',
    });
  });

  it('con los mismos aciertos desempata el menor tiempo', () => {
    expect(verdictFor(result('yo', 12, 600_000), result('rival', 12, 700_000))).toEqual({
      kind: 'win',
      by: 'time',
    });
    expect(verdictFor(result('yo', 12, 800_000), result('rival', 12, 700_000))).toEqual({
      kind: 'lose',
      by: 'time',
    });
  });

  it('con todo igual es empate', () => {
    expect(verdictFor(result('yo', 12, 700_000), result('rival', 12, 700_000))).toEqual({
      kind: 'draw',
    });
  });
});

describe('vista del duelo', () => {
  const rival = { id: 'rival-fijo' };
  const play = (correctCount: number, ms: number) => [
    started(sessionA, minute(0)),
    ...questions.map((_, index) =>
      answer(index, index < correctCount, ms / 3, sessionA, minute(1 + index)),
    ),
    ended(sessionA, minute(10)),
  ];

  it('pendiente no revela nada del rival', () => {
    expect(duelView({ events: [], challenge, selfId: SELF, opponent: rival })).toEqual({
      status: 'pending',
    });
  });

  it('decidido trae los dos resultados y el veredicto que sale de compararlos', () => {
    const view = duelView({ events: play(3, 30_000), challenge, selfId: SELF, opponent: rival });
    expect(view.status).toBe('decided');
    if (view.status !== 'decided') return;
    expect(view.self).toEqual({ memberId: SELF, correct: 3, answered: 3, totalMs: 30_000 });
    expect(view.rival).toEqual(simulatedDuelResult(rival, challenge));
    expect(view.verdict).toEqual(verdictFor(view.self, view.rival));
  });

  it('el mismo duelo da siempre el mismo veredicto al volver a abrirlo', () => {
    const events = play(2, 45_000);
    const first = duelView({ events, challenge, selfId: SELF, opponent: rival });
    const second = duelView({ events, challenge, selfId: SELF, opponent: rival });
    expect(second).toEqual(first);
  });
});
