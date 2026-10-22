import { describe, expect, it } from 'vitest';
import { dailyPlan, GUIDE_PLAN, matchesGuidePlan, type PlanLimits } from './dailyPlan';

const limits = (patch: Partial<PlanLimits> = {}): PlanLimits => ({
  reviewsPerDay: 200,
  newCardsPerDay: 20,
  unlimitedNewCards: false,
  questionsPerDay: 50,
  ...patch,
});
const done = { cards: 0, newCards: 0, questions: 0 };

describe('dailyPlan', () => {
  it('da tres filas con la meta de tarjetas igual a repasos más nuevas', () => {
    const rows = dailyPlan({ limits: limits(), done: { cards: 110, newCards: 10, questions: 25 } });
    expect(rows.map((r) => [r.key, r.done, r.target])).toEqual([
      ['cards', 110, 220],
      ['newCards', 10, 20],
      ['questions', 25, 50],
    ]);
    expect(rows[0]?.fraction).toBe(0.5);
    expect(rows.every((r) => !r.met)).toBe(true);
  });

  it('la fracción no pasa de 1 y la meta se marca cumplida al alcanzarla o pasarla', () => {
    const rows = dailyPlan({ limits: limits(), done: { cards: 500, newCards: 20, questions: 50 } });
    expect(rows.map((r) => r.fraction)).toEqual([1, 1, 1]);
    expect(rows.every((r) => r.met)).toBe(true);
  });

  it('con nuevas sin límite no hay fila de nuevas y la meta es solo de repasos', () => {
    const rows = dailyPlan({ limits: limits({ unlimitedNewCards: true }), done });
    expect(rows.map((r) => r.key)).toEqual(['cards', 'questions']);
    expect(rows[0]?.target).toBe(200);
  });

  it('un límite en cero oculta su fila y sin ninguna meta no queda nada', () => {
    expect(dailyPlan({ limits: limits({ questionsPerDay: 0 }), done }).map((r) => r.key)).toEqual([
      'cards',
      'newCards',
    ]);
    expect(
      dailyPlan({
        limits: limits({ reviewsPerDay: 0, newCardsPerDay: 0, questionsPerDay: 0 }),
        done,
      }),
    ).toEqual([]);
  });

  it('las cifras de la guía suman 300 tarjetas al día con 50 nuevas y 50 preguntas', () => {
    const rows = dailyPlan({ limits: { ...GUIDE_PLAN, unlimitedNewCards: false }, done });
    expect(rows.map((r) => r.target)).toEqual([300, 50, 50]);
  });

  it('reconoce cuándo los límites ya son los de la guía', () => {
    expect(matchesGuidePlan({ ...GUIDE_PLAN, unlimitedNewCards: false })).toBe(true);
    expect(matchesGuidePlan(limits())).toBe(false);
    expect(matchesGuidePlan({ ...GUIDE_PLAN, unlimitedNewCards: true })).toBe(false);
  });

  it('el tope de preguntas del plan manda sobre el ajuste y marca la fila como topada', () => {
    const rows = dailyPlan({
      limits: limits({ questionsPerDay: 50 }),
      done: { cards: 0, newCards: 0, questions: 12 },
      questionsCap: 20,
    });
    const questions = rows.find((r) => r.key === 'questions');
    expect(questions).toMatchObject({ target: 20, done: 12, capped: true });
    expect(questions?.fraction).toBe(0.6);
    // Las otras filas no se topan
    expect(rows.filter((r) => r.key !== 'questions').every((r) => !r.capped)).toBe(true);
  });

  it('sin tope, o con un tope mayor al ajuste, la meta es la del alumno y no se marca topada', () => {
    for (const questionsCap of [undefined, null, 50, 100]) {
      const questions = dailyPlan({
        limits: limits({ questionsPerDay: 50 }),
        done,
        ...(questionsCap === undefined ? {} : { questionsCap }),
      }).find((r) => r.key === 'questions');
      expect(questions).toMatchObject({ target: 50, capped: false });
    }
  });

  it('con las preguntas apagadas el tope no hace aparecer la fila', () => {
    const rows = dailyPlan({ limits: limits({ questionsPerDay: 0 }), done, questionsCap: 20 });
    expect(rows.find((r) => r.key === 'questions')).toBeUndefined();
  });
});
