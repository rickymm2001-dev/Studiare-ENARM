import { describe, expect, it } from 'vitest';
import type { DayLoad } from './fsrs';
import {
  canJoinGroup,
  collectiveProgress,
  decideDuel,
  generateInviteCode,
  isValidInviteCode,
  MAX_GROUP_MEMBERS,
  weeklyLeaderboard,
  type SharedMemberStats,
} from './party';
import { buildPlan } from './planner';
import { createRng } from './random';
import { addDays } from './studyDay';

const TODAY = '2026-10-01';
const load = (reviews: number, newCards = 0, days = 30): DayLoad[] =>
  Array.from({ length: days }, (_, index) => ({ day: addDays(TODAY, index), reviews, newCards }));

describe('planificador (7.10)', () => {
  it('usa los minutos declarados si no hay Pomodoro y los reales si hay 3 días o más', () => {
    const declared = buildPlan({
      today: TODAY,
      examDate: '2027-09-14',
      declaredMinutes: 60,
      pomodoroMinutes: [30, 40],
      load: load(40),
      priorityTopics: ['cardio'],
    });
    expect(declared).toMatchObject({
      minutesAvailable: 60,
      minutesSource: 'declared',
      daysToExam: 348,
    });
    const real = buildPlan({
      today: TODAY,
      examDate: null,
      declaredMinutes: 60,
      pomodoroMinutes: [30, 40, 50],
      load: load(40),
      priorityTopics: [],
    });
    expect(real).toMatchObject({
      minutesAvailable: 40,
      minutesSource: 'pomodoro',
      daysToExam: null,
    });
  });

  it('arma el día con repasos, nuevas, simulador y reto mientras quepan', () => {
    const plan = buildPlan({
      today: TODAY,
      examDate: null,
      declaredMinutes: 60,
      pomodoroMinutes: [],
      load: load(80, 20),
      priorityTopics: ['cardio', 'neo'],
    });
    expect(plan.today).toMatchObject({
      day: TODAY,
      reviews: 80,
      newCards: 20,
      challenge: true,
      simulatorTopic: 'cardio',
    });
    // 80 × 15 s + 20 × 40 s = 2,000 s. Quedan 1,600 s, 600 de reto y 11 preguntas de 90 s
    expect(plan.today.simulatorQuestions).toBe(11);
    expect(plan.week).toHaveLength(7);
    expect(plan.week[1]?.simulatorTopic).toBe('neo');
    expect(plan.warnings).toEqual([]);
  });

  it('avisa de sobrecarga y propone opciones con su efecto', () => {
    const plan = buildPlan({
      today: TODAY,
      examDate: null,
      declaredMinutes: 30,
      pomodoroMinutes: [],
      load: load(160, 20),
      loadWithFewerNew: { newPerDay: 10, load: load(120, 10) },
      priorityTopics: [],
    });
    expect(plan.today.reviews).toBe(120);
    expect(plan.today.newCards).toBe(0);
    const [warning] = plan.warnings;
    // Necesita 160 × 15 + 20 × 40 = 3,200 s, unos 53.3 minutos
    expect(warning?.averageNeededMinutes).toBeCloseTo(3200 / 60, 9);
    const [reduce, increase] = warning?.options ?? [];
    expect(reduce).toMatchObject({ action: 'reduce_new', value: 10 });
    expect(reduce?.effectMinutesPerDay).toBeCloseTo(3200 / 60 - (120 * 15 + 10 * 40) / 60, 9);
    expect(increase).toMatchObject({ action: 'increase_minutes', value: 54 });
    expect(increase?.effectMinutesPerDay).toBeCloseTo(3200 / 60 - 30, 9);
  });

  it('sin carga da un día vacío', () => {
    const plan = buildPlan({
      today: TODAY,
      examDate: null,
      declaredMinutes: 20,
      pomodoroMinutes: [],
      load: [],
      priorityTopics: [],
    });
    expect(plan.today).toMatchObject({ day: TODAY, reviews: 0, newCards: 0 });
  });
});

describe('Party (9.6)', () => {
  it('genera códigos de 6 caracteres sin letras que se confundan', () => {
    const rng = createRng('codigos');
    const codes = Array.from({ length: 200 }, () => generateInviteCode(rng));
    expect(codes.every(isValidInviteCode)).toBe(true);
    expect(codes.some((code) => /[01OIL]/.test(code))).toBe(false);
    expect(isValidInviteCode('ABC12')).toBe(false);
    expect(isValidInviteCode('ABCDE0')).toBe(false);
  });

  it('la tabla semanal ordena por XP y comparte solo alias, XP, nivel y racha', () => {
    const members: SharedMemberStats[] = [
      { memberId: 'a', alias: 'Ana', weeklyXp: 500, level: 4, streak: 3, isSimulated: true },
      { memberId: 'b', alias: 'Beto', weeklyXp: 900, level: 6, streak: 10, isSimulated: true },
      { memberId: 'c', alias: 'Caro', weeklyXp: 500, level: 3, streak: 1, isSimulated: false },
    ];
    const table = weeklyLeaderboard(members);
    expect(table.map((row) => [row.alias, row.rank])).toEqual([
      ['Beto', 1],
      ['Ana', 2],
      ['Caro', 2],
    ]);
    expect(Object.keys(table[0] ?? {}).sort()).toEqual([
      'alias',
      'isSimulated',
      'level',
      'memberId',
      'rank',
      'streak',
      'weeklyXp',
    ]);
  });

  it('un grupo tiene como máximo 50 miembros', () => {
    expect(canJoinGroup(MAX_GROUP_MEMBERS - 1)).toBe(true);
    expect(canJoinGroup(MAX_GROUP_MEMBERS)).toBe(false);
  });

  it('progreso de un reto colectivo', () => {
    expect(collectiveProgress([300, 400, -5], 1000)).toEqual({
      total: 700,
      target: 1000,
      fraction: 0.7,
      completed: false,
    });
    expect(collectiveProgress([600, 500], 1000)).toMatchObject({ fraction: 1, completed: true });
    expect(() => collectiveProgress([1], 0)).toThrow(RangeError);
  });

  it('en un duelo gana la exactitud y desempata el tiempo', () => {
    expect(
      decideDuel(
        { memberId: 'a', correct: 15, answered: 20, totalMs: 900000 },
        { memberId: 'b', correct: 14, answered: 20, totalMs: 300000 },
      ),
    ).toEqual({ kind: 'winner', memberId: 'a', by: 'accuracy' });
    expect(
      decideDuel(
        { memberId: 'a', correct: 15, answered: 20, totalMs: 900000 },
        { memberId: 'b', correct: 15, answered: 20, totalMs: 300000 },
      ),
    ).toEqual({ kind: 'winner', memberId: 'b', by: 'time' });
    expect(
      decideDuel(
        { memberId: 'a', correct: 0, answered: 0, totalMs: 1 },
        { memberId: 'b', correct: 0, answered: 0, totalMs: 1 },
      ),
    ).toEqual({ kind: 'draw' });
  });
});
