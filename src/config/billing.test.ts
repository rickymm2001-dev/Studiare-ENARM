import { describe, expect, it } from 'vitest';
import { FOUNDER_SEATS, PLANS, type PlanKey } from './billing';

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
