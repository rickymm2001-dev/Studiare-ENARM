// El plan que viaja en los eventos (B15, 1.4)
import { describe, expect, it } from 'vitest';
import { planKindOf } from './context';

describe('planKindOf', () => {
  it('sin suscripción, cancelada del todo o en Gratis es free', () => {
    expect(planKindOf(null)).toBe('free');
    expect(planKindOf(undefined)).toBe('free');
    expect(planKindOf({ plan: 'monthly', status: 'none' })).toBe('free');
    expect(planKindOf({ plan: 'annual', status: 'canceled' })).toBe('free');
    expect(planKindOf({ plan: 'free', status: 'active' })).toBe('free');
  });

  it('en la prueba gratis es trial', () => {
    expect(planKindOf({ plan: 'monthly', status: 'active', cloudStatus: 'trialing' })).toBe(
      'trial',
    );
    expect(planKindOf({ plan: 'founder', status: 'active', cloudStatus: 'trialing' })).toBe(
      'trial',
    );
  });

  it('con cualquier otro plan vigente es paid, también un pase o un mes regalado', () => {
    expect(planKindOf({ plan: 'monthly', status: 'active', cloudStatus: 'active' })).toBe('paid');
    expect(planKindOf({ plan: 'annual', status: 'active' })).toBe('paid');
    expect(planKindOf({ plan: 'monthly', status: 'active', cloudStatus: 'canceled' })).toBe('paid');
    expect(planKindOf({ plan: 'founder_annual', status: 'active', cloudStatus: 'past_due' })).toBe(
      'paid',
    );
  });
});
