// Lo que muestra la tarjeta de la encuesta a partir de los conteos que da la base (B18, 2.4 del diseño). Una tabla por
// pregunta con cuántas respuestas marcaron cada opción, y la mediana de las escalas solo con 3 respuestas o más: con
// menos, cualquiera puede deducir quién escribió qué. Sin React, para probarlo con conteos fijos.
import {
  SCALE_VALUES,
  SURVEY_QUESTIONS,
  optionsOf,
  scaleMedian,
  type QuestionId,
} from '@/config/surveys';
import type { SurveySummary } from '@/data/cloud/survey';
import { surveyTexts } from '@/i18n/survey';

/** Desde cuántas respuestas se muestran medianas */
export const MIN_ANSWERS_FOR_MEDIAN = 3;

export interface OptionView {
  value: string;
  label: string;
  count: number;
}

export interface QuestionView {
  id: QuestionId;
  label: string;
  isScale: boolean;
  options: OptionView[];
  /** La mediana de una escala, o null si no es una escala o hay menos de 3 respuestas */
  median: number | null;
}

/** El texto de una opción de una pregunta. Las escalas son el número */
function optionLabel(id: QuestionId, value: string): string {
  const text = surveyTexts.questions[id];
  if ('options' in text) {
    const options: Record<string, string> = text.options;
    return options[value] ?? value;
  }
  const scale = Number(value);
  if (scale === SCALE_VALUES[0]) return `${value}, ${text.low}`;
  if (scale === SCALE_VALUES[SCALE_VALUES.length - 1]) return `${value}, ${text.high}`;
  return value;
}

/** Una vista por pregunta, con todas sus opciones aunque nadie las haya marcado, en el orden de la pregunta */
export function questionViews(summary: SurveySummary): QuestionView[] {
  return SURVEY_QUESTIONS.map((question) => {
    const counts = summary.questions[question.id] ?? {};
    const isScale = question.kind === 'scale';
    return {
      id: question.id,
      label: surveyTexts.questions[question.id].label,
      isScale,
      options: optionsOf(question).map((value) => ({
        value,
        label: optionLabel(question.id, value),
        count: counts[value] ?? 0,
      })),
      median: isScale && summary.answered >= MIN_ANSWERS_FOR_MEDIAN ? scaleMedian(counts) : null,
    };
  });
}
