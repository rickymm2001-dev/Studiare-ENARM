// El reporte de renglones de la sincronización (3.9 del plan de B11). Cada código del contrato tiene su
// frase con su acción, en español y sin texto de una pregunta, y el CSV repite la misma tabla
import { describe, expect, it } from 'vitest';
import type { SyncRowResult } from '@/data/bank/contracts';
import { bankAdminText } from '@/i18n/bankAdmin';
import { incompleteText } from '../physician/reviewTexts';
import {
  noticeMessage,
  problemMessage,
  rowLabel,
  rowMessages,
  SYNC_NOTICE_CODES,
  SYNC_PROBLEM_CODES,
  syncRowsCsv,
} from './syncReport';

const row = (overrides: Partial<SyncRowResult> = {}): SyncRowResult => ({
  rowNumber: 45,
  sheetKey: 'GO-0045',
  outcome: 'rejected',
  incomplete: [],
  notices: [],
  problems: [],
  questionId: null,
  ...overrides,
});

describe('reporte de renglones', () => {
  it('cada motivo de rechazo y cada aviso del contrato tiene su frase en tú y sin exclamaciones', () => {
    const phrases = [
      ...SYNC_PROBLEM_CODES.map((code) =>
        problemMessage({ code, column: 'Subtema', value: 'Control prenatal' }),
      ),
      ...SYNC_NOTICE_CODES.map(noticeMessage),
    ];
    expect(phrases).toHaveLength(SYNC_PROBLEM_CODES.length + SYNC_NOTICE_CODES.length);
    for (const phrase of phrases) {
      expect(phrase.length).toBeGreaterThan(10);
      expect(phrase).not.toMatch(/[!¡]/);
      expect(phrase.endsWith('.')).toBe(true);
    }
    expect(new Set(phrases).size).toBe(phrases.length);
  });

  it('dice el renglón, el valor de la lista y la acción', () => {
    const message = problemMessage({
      code: 'subtopic_is_topic',
      column: 'Subtema',
      value: 'Control prenatal',
    });
    expect(bankAdminText.sync.rows.line(rowLabel(row()), message)).toBe(
      'Renglón 45. El subtema Control prenatal es una subespecialidad. Elige el subtema en la lista.',
    );
  });

  it('un código que no conoce no rompe el reporte', () => {
    expect(problemMessage({ code: 'nuevo' as never, column: 'ID' })).toContain('nuevo');
    expect(noticeMessage('otro')).toContain('otro');
  });

  it('junta problemas, pendientes y avisos, y los faltantes dicen qué hacer', () => {
    const messages = rowMessages(
      row({
        outcome: 'created',
        incomplete: ['explanation_missing', 'bias_missing:C'],
        notices: ['kind_control_check'],
      }),
      incompleteText,
    );
    expect(messages).toEqual([
      'Falta la explicación.',
      'Falta el sesgo del distractor C.',
      bankAdminText.sync.notices.kind_control_check,
    ]);
    expect(rowMessages(row({ outcome: 'missing', rowNumber: null }), incompleteText)).toEqual([
      bankAdminText.sync.rows.missing,
    ]);
    expect(rowLabel({ rowNumber: null })).toBe(bankAdminText.sync.rows.row(null));
  });

  it('el CSV lleva BOM y un renglón por cada acción', () => {
    const csv = syncRowsCsv(
      [
        row({ problems: [{ code: 'branch_unknown', column: 'Rama troncal', value: 'Brujería' }] }),
        row({ rowNumber: 46, sheetKey: 'GO-0046', outcome: 'versioned' }),
      ],
      incompleteText,
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"Renglón 45","GO-0045","Rechazado"');
    expect(lines[1]).toContain('Brujería');
    expect(lines[2]).toBe('"Renglón 46","GO-0046","Versión nueva",""');
  });

  it('una clave del Sheet que parece fórmula no se corre al abrir el CSV', () => {
    const csv = syncRowsCsv([row({ sheetKey: '=HYPERLINK("http://x")' })], incompleteText);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[1]).toBe('"Renglón 45","\'=HYPERLINK(""http://x"")","Rechazado",""');
  });
});
