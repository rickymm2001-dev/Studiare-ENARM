// El CSV de la encuesta para el dueño y los admins (B18). Una fila por respuesta con su código, una columna por pregunta y
// el comentario, sin ninguna columna que diga de quién es ni cuántos días llevaba la cuenta, y con lo que empieza como
// fórmula protegido.
import { describe, expect, it } from 'vitest';
import type { SurveyAnswers } from '@/config/surveys';
import type { SurveyResponseRow } from '@/data/cloud/survey';
import { surveyAdminTexts } from '@/i18n/survey';
import { BOM } from '../physician/bankTemplates';
import { answerLine, surveyCsv, surveyCsvCells } from './surveyCsv';

const ANSWERS: SurveyAnswers = {
  days_used: 'd3_4',
  used: ['review', 'practice'],
  clarity: 4,
  ease: 5,
  useful: 3,
  blockers: ['slow', 'not_like_exam'],
  recommend: 'maybe',
};

const row = (overrides: Partial<SurveyResponseRow> = {}): SurveyResponseRow => ({
  code: 'RA00002',
  answers: ANSWERS,
  comment: 'Me costó ubicar Simular',
  ...overrides,
});

/** El contenido sin el BOM, partido en líneas */
const lines = (csv: string) => csv.slice(BOM.length).trimEnd().split('\r\n');

describe('el CSV de la encuesta', () => {
  it('va en UTF-8 con BOM, con un encabezado y una fila por respuesta', () => {
    const csv = surveyCsv([row(), row({ code: 'RB00003' })]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(lines(csv)).toHaveLength(3);
    expect(lines(csv)[0]).toBe(
      surveyAdminTexts.card.csv.columns.map((column) => `"${column}"`).join(','),
    );
  });

  it('trae el código, una columna por pregunta con su texto y el comentario', () => {
    const csv = surveyCsv([row()]);
    expect(lines(csv)[1]).toBe(
      [
        '"RA00002"',
        '"3 o 4"',
        '"Repasar; Simular por rama"',
        '"4"',
        '"5"',
        '"3"',
        '"Fue lento; Las preguntas no se parecen al examen"',
        '"Tal vez"',
        '"Me costó ubicar Simular"',
      ].join(','),
    );
    expect(surveyCsvCells(row())).toHaveLength(surveyAdminTexts.card.csv.columns.length);
  });

  it('no tiene ninguna columna ni dato que diga de quién es', () => {
    const csv = surveyCsv([row()]);
    const header = lines(csv)[0] ?? '';
    expect(header).not.toMatch(/correo|e-?mail|nombre|alias|fecha|usuario|user|identificador/i);
    // Con 5 personas, los días de la cuenta más la fecha de alta de Usuarios darían la cuenta
    expect(header).not.toMatch(/días de cuenta|dias de cuenta|días de la cuenta|signup/i);
    expect(csv).not.toMatch(/@|user_id|created_at|days_since|[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it('un comentario que empieza como fórmula lleva un apóstrofo, y las comillas se duplican', () => {
    const csv = surveyCsv([
      row({ comment: '=HYPERLINK("http://x.test")' }),
      row({ code: 'RB00003', comment: '+1+1' }),
      row({ code: 'RC00004', comment: '@SUMA(A1)' }),
      row({ code: 'RD00005', comment: '-2+3' }),
      row({ code: 'RE00006', comment: 'Dijo "no sé", y otra cosa\ncon salto' }),
    ]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x.test"")"`);
    expect(csv).toContain(`"'+1+1"`);
    expect(csv).toContain(`"'@SUMA(A1)"`);
    expect(csv).toContain(`"'-2+3"`);
    expect(csv).toContain(`"Dijo ""no sé"", y otra cosa\ncon salto"`);
    // Ninguna celda del archivo queda empezando como fórmula
    for (const cell of csv.matchAll(/(?:^|,)"([=+\-@\t\r][^"]*)"/gm)) {
      throw new Error(`Una celda empieza como fórmula: ${cell[1] ?? ''}`);
    }
  });

  it('un comentario vacío queda en blanco y sin respuestas el archivo trae solo el encabezado', () => {
    expect(lines(surveyCsv([row({ comment: null })]))[1]?.endsWith(',""')).toBe(true);
    expect(lines(surveyCsv([]))).toHaveLength(1);
  });

  it('la línea corta de una respuesta junta lo cerrado', () => {
    expect(answerLine(ANSWERS)).toBe(
      '3 o 4 · Repasar; Simular por rama · Claridad 4, facilidad 5, utilidad 3 · Fue lento; Las preguntas no se parecen al examen · Tal vez',
    );
  });
});
