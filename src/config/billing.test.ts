import { describe, expect, it } from 'vitest';
import {
  AI_CARDS_PER_DAY_PAID,
  canUseFeature,
  FOUNDER_SEATS,
  GATED_FEATURES,
  PLANS,
  type FeatureAccess,
  type PlanKey,
} from './billing';

describe('planes y precios', () => {
  it('el mensual estándar cuesta 150 pesos', () => {
    expect(PLANS.monthly.priceMxn).toBe(150);
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
