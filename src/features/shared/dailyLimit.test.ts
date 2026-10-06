import { describe, expect, it } from 'vitest';
import { PLANS } from '@/config/billing';
import { answered, minute, option, question, event } from '../tutor/testing/fixtures';
import { newId } from '@/data/testing/fixtures';
import { dailyQuestions } from './dailyLimit';

const now = new Date(minute(0));
const q = question({ id: newId() });
const right = option(newId(), true, 'Correcta');

const answers = (count: number, at = minute(0)) =>
  Array.from({ length: count }, (_, index) => answered(q, right.id, true, at + index * 1000));

describe('preguntas que le quedan hoy', () => {
  it('sin suscripción es el plan Gratis y descuenta lo respondido hoy', () => {
    const limit = PLANS.free.access.dailyQuestions ?? 0;
    const result = dailyQuestions({
      events: answers(7),
      subscription: undefined,
      timeZone: 'America/Merida',
      now,
    });
    expect(result).toEqual({ plan: 'free', limit, answeredToday: 7, left: limit - 7 });
  });

  it('nunca baja de cero aunque haya contestado más', () => {
    const limit = PLANS.free.access.dailyQuestions ?? 0;
    const result = dailyQuestions({
      events: answers(limit + 5),
      subscription: null,
      timeZone: 'America/Merida',
      now,
    });
    expect(result.left).toBe(0);
  });

  it('un plan de pago activo no tiene límite', () => {
    const result = dailyQuestions({
      events: answers(50),
      subscription: { plan: 'monthly', status: 'active' },
      timeZone: 'America/Merida',
      now,
    });
    expect(result).toMatchObject({ plan: 'monthly', limit: null, left: null, answeredToday: 50 });
  });

  it('una suscripción cancelada vuelve al plan Gratis', () => {
    const result = dailyQuestions({
      events: [],
      subscription: { plan: 'annual', status: 'canceled' },
      timeZone: 'America/Merida',
      now,
    });
    expect(result.plan).toBe('free');
    expect(result.left).toBe(PLANS.free.access.dailyQuestions);
  });

  it('las respuestas de otro día no cuentan y otros eventos tampoco', () => {
    const yesterday = answers(5, minute(0) - 2 * 86_400_000);
    const other = event(
      'pomodoro_started',
      { phase: 'focus', plannedMinutes: 25, cycle: 1 },
      minute(0),
    );
    const result = dailyQuestions({
      events: [...yesterday, other],
      subscription: undefined,
      timeZone: 'America/Merida',
      now,
    });
    expect(result.answeredToday).toBe(0);
  });
});
