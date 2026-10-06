import { describe, expect, it } from 'vitest';
import { INSIGHT_MINIMUMS, type Insight, type InsightReport } from '@/engines/insights';
import { weeklyReport } from './weeklyReport';

const ready = (
  id: string,
  area: Insight['area'],
  level: 'strength' | 'watch' | 'focus',
  weight = 1,
): Insight => ({ id, area, weight, state: { kind: 'ready', level, values: {}, refs: {} } });

const report = (insights: Insight[], answers = 40): InsightReport => ({
  insights,
  strengths: insights.filter((i) => i.state.kind === 'ready' && i.state.level === 'strength'),
  focus: insights
    .filter((i) => i.state.kind === 'ready' && i.state.level === 'focus')
    .sort((a, b) => b.weight - a.weight),
  totals: { answers, reviews: 0, taggedErrors: 0, sessions: 0 },
});

const weak = [
  {
    key: 'nephrology',
    name: 'Nefrología',
    branch: 'internal_medicine',
    branchName: 'Medicina interna',
    mastery: 0.4,
  },
];

describe('informe semanal con plantilla (8.3)', () => {
  it('con pocas respuestas calibra y dice cuánto falta', () => {
    expect(weeklyReport(report([], 5), weak)).toEqual({
      ready: false,
      have: 5,
      need: INSIGHT_MINIMUMS.answers,
    });
  });

  it('arma prioridades, un hábito y un reto con lo que ya calculó Conócete', () => {
    const result = weeklyReport(
      report([
        ready('negation', 'exam', 'focus', 5),
        ready('consistency', 'study', 'watch', 2),
        ready('retention', 'study', 'focus', 1),
        ready('session_length', 'study', 'strength', 9),
      ]),
      weak,
    );
    if (!result.ready) throw new Error('debía estar listo');
    expect(result.priorities.length).toBeGreaterThan(0);
    expect(result.priorities.length).toBeLessThanOrEqual(3);
    // El hábito es la lectura de estudio más urgente, un foco antes que algo a vigilar
    expect(result.habit?.review).toBe(true);
    expect(result.habit?.to).toBe('/repasar');
    // Con un tema débil el reto es practicarlo
    expect(result.challenge?.to).toBe('/simular?topic=nephrology');
    expect(result.challenge?.title).toBe('Practica 10 preguntas de Nefrología');
  });

  it('sin tema débil el reto sale de la técnica de negaciones y sin lecturas listas no hay hábito', () => {
    const result = weeklyReport(report([ready('negation', 'exam', 'focus')]), []);
    if (!result.ready) throw new Error('debía estar listo');
    expect(result.habit).toBeNull();
    expect(result.challenge?.to).toBe('/simular?structure=negative');
  });

  it('con todo en orden no inventa prioridades, hábito ni reto', () => {
    const result = weeklyReport(
      report([ready('consistency', 'study', 'strength'), ready('tasks', 'exam', 'strength')]),
      [],
    );
    expect(result).toEqual({ ready: true, priorities: [], habit: null, challenge: null });
  });
});
