import { describe, expect, it } from 'vitest';
import {
  AI_CARDS_PER_DAY_PAID,
  annualSavingsPercent,
  canUseFeature,
  checkoutPlanFor,
  FOUNDER_SEATS,
  GATED_FEATURES,
  PAYMENT_PROVIDERS,
  PLANS,
  VISIBLE_PLANS,
  visiblePlanOf,
  type FeatureAccess,
  type PlanKey,
} from './billing';

describe('planes y precios', () => {
  it('el mensual cuesta 149 pesos y el anual 1,499 (D-114)', () => {
    expect(PLANS.monthly.priceMxn).toBe(149);
    expect(PLANS.annual.priceMxn).toBe(1499);
  });

  it('el Fundador es más barato que el mensual, es para 100 usuarios y da lo mismo que el de pago', () => {
    expect(PLANS.founder.priceMxn).toBeLessThan(PLANS.monthly.priceMxn);
    expect(PLANS.founder.priceMxn).toBeGreaterThanOrEqual(59);
    expect(PLANS.founder.priceMxn).toBeLessThanOrEqual(79);
    expect(PLANS.founder.access).toEqual(PLANS.monthly.access);
    expect(FOUNDER_SEATS).toBe(100);
  });

  it('el anual sale más barato que pagar 12 meses', () => {
    expect(PLANS.annual.priceMxn).toBeLessThan(PLANS.monthly.priceMxn * 12);
  });

  it('el ahorro del anual es 16% contra 12 meses al precio regular, sin redondear hacia arriba', () => {
    expect(annualSavingsPercent()).toBe(16);
    const plans = { ...PLANS, monthly: { priceMxn: 100 }, annual: { priceMxn: 1000 } };
    // 1 - 1000 / 1200 es 16.67%, y se dice 16
    expect(annualSavingsPercent(plans)).toBe(16);
    expect(annualSavingsPercent({ ...plans, annual: { priceMxn: 1500 } })).toBe(0);
  });

  it('el Fundador es una promoción del mensual y no una tarjeta aparte', () => {
    expect(VISIBLE_PLANS).toEqual(['free', 'monthly', 'annual']);
    expect(checkoutPlanFor('monthly', true)).toBe('founder');
    expect(checkoutPlanFor('monthly', false)).toBe('monthly');
    expect(checkoutPlanFor('annual', true)).toBe('annual');
    expect(visiblePlanOf('founder')).toBe('monthly');
    expect(visiblePlanOf('annual')).toBe('annual');
  });

  it('solo se ofrece Stripe mientras Mercado Pago no esté configurado', () => {
    expect(PAYMENT_PROVIDERS).toEqual(['stripe']);
  });

  it('el plan Gratis limita las preguntas y deja fuera el examen completo y el tutor con IA', () => {
    expect(PLANS.free.access).toMatchObject({
      dailyQuestions: 20,
      fullExam: false,
      aiTutor: false,
      importDecks: true,
      party: true,
    });
  });

  it('cada plan se llama como su clave', () => {
    for (const key of Object.keys(PLANS) as PlanKey[]) expect(PLANS[key].key).toBe(key);
  });
});

describe('banderas de acceso por función de carga diaria', () => {
  it('todas las funciones están abiertas en todos los planes, menos las tarjetas con IA, que son de pago', () => {
    for (const key of Object.keys(PLANS) as PlanKey[]) {
      for (const feature of GATED_FEATURES) {
        expect(canUseFeature(key, feature)).toBe(feature === 'aiCards' ? key !== 'free' : true);
      }
    }
  });

  it('el plan Gratis no genera tarjetas con IA y los de pago tienen un tope diario', () => {
    expect(PLANS.free.aiCardsPerDay).toBe(0);
    for (const key of ['founder', 'monthly', 'annual'] as const) {
      expect(PLANS[key].aiCardsPerDay).toBe(AI_CARDS_PER_DAY_PAID);
    }
  });

  it('cada plan trae una bandera por cada función, sin sobrar ni faltar', () => {
    for (const key of Object.keys(PLANS) as PlanKey[]) {
      expect(Object.keys(PLANS[key].features).sort()).toEqual([...GATED_FEATURES].sort());
    }
  });

  it('con otra tabla de planes la bandera cierra solo la función indicada y solo ese plan', () => {
    const closed: FeatureAccess = { ...PLANS.free.features, easyDays: false };
    const plans = { ...PLANS, free: { ...PLANS.free, features: closed } };
    expect(canUseFeature('free', 'easyDays', plans)).toBe(false);
    expect(canUseFeature('free', 'explore', plans)).toBe(true);
    expect(canUseFeature('monthly', 'easyDays', plans)).toBe(true);
  });
});
