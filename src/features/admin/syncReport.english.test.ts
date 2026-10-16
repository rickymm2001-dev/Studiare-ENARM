// Las frases del reporte de renglones para los códigos nuevos de Inglés médico (B13, 1.5 y 1.6 del plan de
// B13). Cada código tiene su frase con la acción, en tú y sin exclamaciones, y un caso de lectura rechazado
// dice si fue por la fuente, por el idioma o por el orden.
import { describe, expect, it } from 'vitest';
import { SHEET_HEADERS } from '@/data/content/bankColumns';
import type { SyncRowResult } from '@/data/bank/contracts';
import { bankAdminText } from '@/i18n/bankAdmin';
import { incompleteText } from '../physician/reviewTexts';
import { noticeMessage, problemMessage, rowMessages, syncRowsCsv } from './syncReport';

describe('frases del reporte para Inglés médico', () => {
  it('el idioma que no va con la rama dice qué idioma tenía y qué hacer', () => {
    const message = problemMessage({
      code: 'language_branch_mismatch',
      column: SHEET_HEADERS.language,
      value: 'Español',
    });
    expect(message).toContain('Idioma Español');
    expect(message).toContain('Inglés médico va en Inglés');
    expect(message).toMatch(/Corrige el Idioma o la Rama troncal\.$/);
  });

  it('los avisos nuevos tienen su propia frase', () => {
    expect(noticeMessage('language_inferred')).toBe(
      'El Idioma estaba vacío en Inglés médico. Quedó en inglés.',
    );
    expect(noticeMessage('english_case_size')).toContain('dos o tres preguntas');
    for (const code of ['language_inferred', 'english_case_size']) {
      expect(noticeMessage(code)).not.toContain('Código');
      expect(noticeMessage(code)).not.toMatch(/[!¡]/);
      expect(noticeMessage(code).endsWith('.')).toBe(true);
    }
  });

  it('el aviso de un texto en inglés que quedó como español dice qué hacer', () => {
    const phrase = noticeMessage('language_suspect');
    expect(phrase).toContain('parece estar en inglés');
    expect(phrase).toContain('Inglés médico');
    expect(phrase).toContain('Idioma Inglés');
    expect(phrase).toContain('ignora este aviso');
    expect(phrase).not.toMatch(/[!¡:]/);
    expect(phrase).not.toBe(bankAdminText.sync.noticeOther('language_suspect'));
    // El renglón lo muestra con las demás frases del reporte, también en el CSV
    const row: SyncRowResult = {
      rowNumber: 12,
      sheetKey: 'GO-0012',
      outcome: 'created',
      incomplete: [],
      notices: ['language_suspect'],
      problems: [],
      questionId: null,
    };
    expect(rowMessages(row, incompleteText)).toEqual([phrase]);
    expect(syncRowsCsv([row], incompleteText)).toContain('parece estar en inglés');
  });

  it('un caso rechazado dice si fue por la fuente, por el idioma o por el orden', () => {
    const phrase = (column: string) => problemMessage({ code: 'case_inconsistent', column });
    const bySource = phrase(SHEET_HEADERS.passageSource);
    const byLanguage = phrase(SHEET_HEADERS.language);
    const byOrder = phrase(SHEET_HEADERS.caseKey);
    expect(bySource).toContain('fuentes del texto distintas');
    expect(byLanguage).toContain('español y en inglés');
    expect(byOrder).toContain('órdenes repetidos');
    expect(new Set([bySource, byLanguage, byOrder]).size).toBe(3);
    for (const message of [bySource, byLanguage, byOrder]) {
      expect(message).not.toMatch(/[!¡]/);
      expect(message.endsWith('.')).toBe(true);
    }
  });
});
