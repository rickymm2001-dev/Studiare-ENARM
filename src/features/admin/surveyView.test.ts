// Lo que muestra la tarjeta de la encuesta a partir de los conteos (B18). Todas las opciones aparecen aunque nadie las haya
// marcado, y la mediana de una escala solo sale con 3 respuestas o más.
import { describe, expect, it } from 'vitest';
import { SURVEY_QUESTIONS, optionsOf } from '@/config/surveys';
import type { SurveySummary } from '@/data/cloud/survey';
import { MIN_ANSWERS_FOR_MEDIAN, questionViews } from './surveyView';

const summary = (answered: number): SurveySummary => ({
  eligible: 5,
  answered,
  comments: 1,
  questions: {
    clarity: { '5': 1, '3': 1, '2': 1 },
    used: { review: 2, none: 1 },
  },
});

describe('las tablas por pregunta', () => {
  it('traen una vista por pregunta con todas sus opciones, también las que nadie marcó', () => {
    const views = questionViews(summary(3));
    expect(views.map((view) => view.id)).toEqual(SURVEY_QUESTIONS.map((question) => question.id));
    for (const [index, question] of SURVEY_QUESTIONS.entries()) {
      expect(views[index]?.options.map((option) => option.value)).toEqual([...optionsOf(question)]);
    }
    const used = views.find((view) => view.id === 'used');
    expect(used?.options.find((option) => option.value === 'review')?.count).toBe(2);
    expect(used?.options.find((option) => option.value === 'tutor')?.count).toBe(0);
    expect(used?.options.find((option) => option.value === 'none')?.label).toBe('Nada todavía');
  });

  it('las escalas dicen sus extremos en el 1 y en el 5', () => {
    const clarity = questionViews(summary(3)).find((view) => view.id === 'clarity');
    expect(clarity?.options.map((option) => option.label)).toEqual([
      '1, Nada claro',
      '2',
      '3',
      '4',
      '5, Muy claro',
    ]);
  });

  it('la mediana sale con 3 respuestas o más y no antes', () => {
    expect(MIN_ANSWERS_FOR_MEDIAN).toBe(3);
    expect(questionViews(summary(3)).find((view) => view.id === 'clarity')?.median).toBe(3);
    expect(questionViews(summary(2)).find((view) => view.id === 'clarity')?.median).toBeNull();
    expect(questionViews(summary(0)).find((view) => view.id === 'clarity')?.median).toBeNull();
    // Solo las escalas tienen mediana
    expect(questionViews(summary(5)).find((view) => view.id === 'used')?.median).toBeNull();
  });
});
