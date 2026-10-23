import { describe, expect, it } from 'vitest';
import {
  dailyPlan,
  GUIDE_PLAN,
  matchesGuidePlan,
  planFeasibility,
  type PlanLimits,
} from './dailyPlan';

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

  describe('planFeasibility', () => {
    const measured = { secondsPerReview: 8, secondsPerNew: 20, measured: true, newMeasured: true };

    it('sin minutos declarados o sin historial propio es calibrando y no avisa', () => {
      for (const dailyMinutes of [null, 0, -5, Number.NaN]) {
        expect(
          planFeasibility({ limits: limits(), dailyMinutes, times: measured, cardsTimeShare: 0.5 }),
        ).toEqual({ status: 'calibrating', reason: 'needs_minutes' });
      }
      expect(
        planFeasibility({
          limits: limits(),
          dailyMinutes: 120,
          times: { ...measured, measured: false },
          cardsTimeShare: 0.5,
        }),
      ).toEqual({ status: 'calibrating', reason: 'needs_history' });
    });

    it('cuando los límites caben en los minutos de tarjetas dice ok con sus cifras redondeadas', () => {
      // 100 repasos de 8 s y 10 nuevas de 20 s son 1000 s, unos 17 min, y hay 30 min para tarjetas
      const result = planFeasibility({
        limits: limits({ reviewsPerDay: 100, newCardsPerDay: 10 }),
        dailyMinutes: 60,
        times: measured,
        cardsTimeShare: 0.5,
      });
      expect(result).toEqual({ status: 'ok', needMinutes: 17, budgetMinutes: 30 });
    });

    it('cuando no caben dice over, con la guía de 300 tarjetas y media hora de estudio', () => {
      const result = planFeasibility({
        limits: { ...GUIDE_PLAN, unlimitedNewCards: false },
        dailyMinutes: 30,
        times: measured,
        cardsTimeShare: 0.5,
      });
      // 250 repasos de 8 s y 50 nuevas de 20 s son 3000 s, 50 min, contra 15 min de tarjetas
      expect(result).toEqual({ status: 'over', needMinutes: 50, budgetMinutes: 15 });
    });

    it('justo en el límite todavía cabe, y con nuevas sin límite solo cuentan los repasos', () => {
      expect(
        planFeasibility({
          limits: limits({ reviewsPerDay: 90, newCardsPerDay: 0 }),
          dailyMinutes: 24,
          times: measured,
          cardsTimeShare: 0.5,
        }).status,
      ).toBe('ok');
      const unlimited = planFeasibility({
        limits: limits({ reviewsPerDay: 60, newCardsPerDay: 500, unlimitedNewCards: true }),
        dailyMinutes: 60,
        times: measured,
        cardsTimeShare: 0.5,
      });
      expect(unlimited).toMatchObject({ status: 'ok', needMinutes: 8 });
    });

    it('con repasos medidos pero ninguna nueva medida, las nuevas no se cuentan con un tiempo de referencia', () => {
      // El caso de la revisión. 100 repasos a 3 segundos, ninguna nueva medida, 50 repasos y 20
      // nuevas de límite y 20 minutos al día. Con 30 s de referencia por nueva diría over
      const result = planFeasibility({
        limits: limits({ reviewsPerDay: 50, newCardsPerDay: 20 }),
        dailyMinutes: 20,
        times: { secondsPerReview: 3, secondsPerNew: 30, measured: true, newMeasured: false },
        cardsTimeShare: 0.5,
      });
      expect(result).toEqual({ status: 'calibrating', reason: 'needs_new_history' });
      // Sin límite de nuevas, o con cero, no hacen falta y se calcula solo con los repasos
      for (const patch of [{ newCardsPerDay: 0 }, { unlimitedNewCards: true }]) {
        expect(
          planFeasibility({
            limits: limits({ reviewsPerDay: 50, ...patch }),
            dailyMinutes: 20,
            times: { secondsPerReview: 3, secondsPerNew: 30, measured: true, newMeasured: false },
            cardsTimeShare: 0.5,
          }),
        ).toEqual({ status: 'ok', needMinutes: 3, budgetMinutes: 10 });
      }
    });

    it('usa lo que de verdad hay hoy y no los topes, y hoy sin nuevas no pide su ritmo', () => {
      // Con los valores de fábrica y 60 minutos, pero hoy solo tocan 15 tarjetas
      const real = planFeasibility({
        limits: { ...GUIDE_PLAN, unlimitedNewCards: false },
        available: { reviews: 15, newCards: 0 },
        dailyMinutes: 60,
        times: { secondsPerReview: 8, secondsPerNew: 20, measured: true, newMeasured: false },
        cardsTimeShare: 0.5,
      });
      expect(real).toEqual({ status: 'ok', needMinutes: 2, budgetMinutes: 30 });
      // Lo que hay no pasa del límite aunque haya más
      const capped = planFeasibility({
        limits: limits({ reviewsPerDay: 100, newCardsPerDay: 10 }),
        available: { reviews: 500, newCards: 400 },
        dailyMinutes: 20,
        times: measured,
        cardsTimeShare: 0.5,
      });
      expect(capped).toEqual({ status: 'over', needMinutes: 17, budgetMinutes: 10 });
      // Con nuevas sin límite cuentan las que hay hoy, y ya hay que conocer su ritmo
      expect(
        planFeasibility({
          limits: limits({ unlimitedNewCards: true }),
          available: { reviews: 0, newCards: 30 },
          dailyMinutes: 60,
          times: { ...measured, newMeasured: false },
          cardsTimeShare: 0.5,
        }),
      ).toEqual({ status: 'calibrating', reason: 'needs_new_history' });
    });

    it('compara los minutos ya redondeados y nunca avisa de unos 30 contra 30', () => {
      // 30.4 minutos de trabajo contra 30 de presupuesto redondean los dos a 30 y caben
      const near = planFeasibility({
        limits: limits({ reviewsPerDay: 228, newCardsPerDay: 0 }),
        dailyMinutes: 60,
        times: { secondsPerReview: 8, secondsPerNew: 20, measured: true, newMeasured: true },
        cardsTimeShare: 0.5,
      });
      expect(near).toEqual({ status: 'ok', needMinutes: 30, budgetMinutes: 30 });
      // 31 contra 30 sí es over
      expect(
        planFeasibility({
          limits: limits({ reviewsPerDay: 233, newCardsPerDay: 0 }),
          dailyMinutes: 60,
          times: { secondsPerReview: 8, secondsPerNew: 20, measured: true, newMeasured: true },
          cardsTimeShare: 0.5,
        }),
      ).toEqual({ status: 'over', needMinutes: 31, budgetMinutes: 30 });
    });
  });
});
