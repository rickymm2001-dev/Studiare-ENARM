import { describe, expect, it } from 'vitest';
import {
  AI_CARDS_PER_DAY_PAID,
  annualSavingsPercent,
  canUse,
  checkoutPlanFor,
  FOUNDER_SEATS,
  GATED_FEATURES,
  isGatedFeature,
  PAYMENT_PROVIDERS,
  PLAN_HIGHLIGHTS,
  PLANS,
  planOf,
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

  it('el plan Gratis da 20 preguntas al día y deja fuera el examen completo, el tutor con IA, Party, subir mazos y el catálogo', () => {
    // Respuestas 18 y 20 y 4.25 del plan del cambio (B8)
    expect(PLANS.free.access).toEqual({
      dailyQuestions: 20,
      fullExam: false,
      aiTutor: false,
      importDecks: false,
      deckCatalog: false,
      party: false,
    });
  });

  it('los tres planes de pago abren todo y sin límite de preguntas', () => {
    for (const key of ['founder', 'monthly', 'annual'] as const) {
      expect(PLANS[key].access).toEqual({
        dailyQuestions: null,
        fullExam: true,
        aiTutor: true,
        importDecks: true,
        deckCatalog: true,
        party: true,
      });
    }
  });

  it('cada plan se llama como su clave', () => {
    for (const key of Object.keys(PLANS) as PlanKey[]) expect(PLANS[key].key).toBe(key);
  });
});

describe('banderas de acceso por función de carga diaria', () => {
  it('todas las funciones están abiertas en todos los planes, menos las tarjetas con IA y Apuntes, que son de pago', () => {
    // Apuntes se cierra en Gratis por la respuesta 20 del plan del cambio (B6)
    const paidOnly = new Set(['aiCards', 'outlines']);
    for (const key of Object.keys(PLANS) as PlanKey[]) {
      for (const feature of GATED_FEATURES) {
        expect(canUse(key, feature), `${key} ${feature}`).toBe(
          paidOnly.has(feature) ? key !== 'free' : true,
        );
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
    expect(canUse('free', 'easyDays', plans)).toBe(false);
    expect(canUse('free', 'explore', plans)).toBe(true);
    expect(canUse('monthly', 'easyDays', plans)).toBe(true);
  });
});

describe('el plan de una suscripción', () => {
  it('solo una suscripción activa da su plan. Sin ella, cancelada o sin estado es Gratis', () => {
    expect(planOf(undefined)).toBe('free');
    expect(planOf(null)).toBe('free');
    expect(planOf({ plan: 'monthly', status: 'active' })).toBe('monthly');
    expect(planOf({ plan: 'founder', status: 'active' })).toBe('founder');
    expect(planOf({ plan: 'annual', status: 'canceled' })).toBe('free');
    expect(planOf({ plan: 'free', status: 'none' })).toBe('free');
  });
});

describe('candados del plan (B8)', () => {
  it('canUse junta las funciones de la carga diaria y las banderas de acceso', () => {
    expect(isGatedFeature('outlines')).toBe(true);
    expect(isGatedFeature('party')).toBe(false);
    for (const lock of ['outlines', 'aiCards', 'party', 'importDecks', 'deckCatalog'] as const) {
      expect(canUse('free', lock), lock).toBe(false);
      expect(canUse('monthly', lock), lock).toBe(true);
      expect(canUse('founder', lock), lock).toBe(true);
      expect(canUse('annual', lock), lock).toBe(true);
    }
    expect(canUse('free', 'explore')).toBe(true);
  });

  it('con otra tabla de planes la bandera de acceso cierra solo lo indicado', () => {
    const plans = {
      ...PLANS,
      free: { ...PLANS.free, access: { ...PLANS.free.access, party: true } },
    };
    expect(canUse('free', 'party', plans)).toBe(true);
    expect(canUse('free', 'importDecks', plans)).toBe(false);
  });

  it('la tabla de planes compara lo que cierra Gratis, sin repetir nada', () => {
    expect(new Set(PLAN_HIGHLIGHTS).size).toBe(PLAN_HIGHLIGHTS.length);
    for (const lock of ['outlines', 'party', 'importDecks', 'deckCatalog'] as const) {
      expect(PLAN_HIGHLIGHTS).toContain(lock);
    }
    // Todo lo que se compara está incluido en los de pago y algo de eso falta en Gratis
    expect(PLAN_HIGHLIGHTS.every((lock) => canUse('monthly', lock))).toBe(true);
    expect(PLAN_HIGHLIGHTS.filter((lock) => !canUse('free', lock)).length).toBeGreaterThan(0);
  });
});
