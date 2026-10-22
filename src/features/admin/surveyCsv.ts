// El CSV de la encuesta de los primeros días para el dueño y los admins (B18 del plan del cambio, 2.4 del diseño). Se hace
// en el navegador con csvCell, en UTF-8 con BOM para Excel. Una fila por respuesta con su código, una columna por pregunta
// y el comentario. Sin correo, nombre, alias, fecha ni días de la cuenta: ni siquiera existen en lo que llega de la base,
// y una prueba lo revisa. csvCell pone un apóstrofo antes de lo que empieza como fórmula, así un
// comentario que dice =1+1 no se corre en Excel ni en Sheets. Sin React ni Dexie.
import type { SurveyAnswers } from '@/config/surveys';
import type { SurveyResponseRow } from '@/data/cloud/survey';
import { surveyAdminTexts, surveyTexts } from '@/i18n/survey';
import { BOM } from '../physician/bankTemplates';
import { csvCell } from './csvCell';

/** El texto de la opción que marcó, de una pregunta de una sola respuesta */
function labelOf(id: 'days_used' | 'recommend', value: string): string {
  const options: Record<string, string> = surveyTexts.questions[id].options;
  return options[value] ?? value;
}

/** Los textos de lo que marcó, de una pregunta de varias respuestas */
function labelsOf(id: 'used' | 'blockers', values: readonly string[]): string {
  const options: Record<string, string> = surveyTexts.questions[id].options;
  return values.map((value) => options[value] ?? value).join('; ');
}

/** Lo que dice cada columna de una respuesta, en el orden de los encabezados */
export function surveyCsvCells(row: SurveyResponseRow): (string | number | null)[] {
  const { answers } = row;
  return [
    row.code,
    labelOf('days_used', answers.days_used),
    labelsOf('used', answers.used),
    answers.clarity,
    answers.ease,
    answers.useful,
    labelsOf('blockers', answers.blockers),
    labelOf('recommend', answers.recommend),
    row.comment,
  ];
}

export function surveyCsv(rows: readonly SurveyResponseRow[]): string {
  const lines = [surveyAdminTexts.card.csv.columns, ...rows.map(surveyCsvCells)];
  return `${BOM}${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** Las respuestas cerradas de una fila en una frase corta, para la lista del teléfono y la tabla de la computadora */
export function answerLine(answers: SurveyAnswers): string {
  const text = surveyAdminTexts.card;
  return [
    labelOf('days_used', answers.days_used),
    labelsOf('used', answers.used),
    text.scaleSummary(answers.clarity, answers.ease, answers.useful),
    labelsOf('blockers', answers.blockers),
    labelOf('recommend', answers.recommend),
  ].join(' · ');
}
