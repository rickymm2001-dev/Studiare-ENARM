// Las frases de los códigos nuevos de Inglés médico (B13, 7.5 del plan de B13). Cada uno tiene su frase
// con la acción, en tú y sin exclamaciones, y ninguno cae en el texto de respaldo que solo repite el
// código. Los pendientes salen en el editor, en el banco y en el reporte de renglones del Sheet.
import { describe, expect, it } from 'vitest';
import type { SyncRowResult } from '@/data/bank/contracts';
import { bankAdminText } from '@/i18n/bankAdmin';
import { physicianText } from '@/i18n/physician';
import { noticeMessage, problemMessage, rowLabel, rowMessages } from '../admin/syncReport';
import { flagText, incompleteText } from './reviewTexts';

const PENDING = ['passage_source_missing', 'license_not_allowed'] as const;
const REJECTION = 'language_branch_mismatch';
const NOTICES = ['language_inferred', 'english_case_size'] as const;

const clean = (phrase: string) => {
  expect(phrase.length).toBeGreaterThan(20);
  expect(phrase).not.toMatch(/[!¡]/);
  expect(phrase.endsWith('.')).toBe(true);
};

describe('frases de los códigos de Inglés médico', () => {
  it('los pendientes de la fuente tienen su frase y no caen en el texto de respaldo', () => {
    for (const code of PENDING) {
      const phrase = incompleteText(code);
      expect(phrase).not.toBe(physicianText.incomplete.other(code));
      expect(phrase).not.toContain(code);
      clean(phrase);
    }
    expect(incompleteText('passage_source_missing')).toContain('fuente');
    expect(incompleteText('license_not_allowed')).toContain('licencia');
    expect(new Set(PENDING.map(incompleteText)).size).toBe(PENDING.length);
  });

  it('el rechazo por idioma y rama tiene su frase en el editor y en el reporte', () => {
    expect(incompleteText(REJECTION)).not.toBe(physicianText.incomplete.other(REJECTION));
    clean(incompleteText(REJECTION));
    const phrase = problemMessage({ code: REJECTION, column: 'Idioma', value: 'Español' });
    expect(phrase).not.toBe(bankAdminText.sync.problemOther(REJECTION, 'Idioma'));
    clean(phrase);
  });

  it('los avisos de idioma inferido y de tamaño del caso tienen su frase', () => {
    for (const code of NOTICES) {
      const phrase = noticeMessage(code);
      expect(phrase).not.toBe(bankAdminText.sync.noticeOther(code));
      clean(phrase);
    }
  });

  it('el reporte de un renglón en inglés dice el renglón y lo que hay que llenar', () => {
    const row: SyncRowResult = {
      rowNumber: 210,
      sheetKey: 'EN-0042',
      outcome: 'created',
      incomplete: ['passage_source_missing'],
      notices: ['english_case_size'],
      problems: [],
      questionId: null,
    };
    const lines = rowMessages(row, incompleteText).map((message) =>
      bankAdminText.sync.rows.line(rowLabel(row), message),
    );
    expect(lines[0]).toMatch(/^Renglón 210\. Falta la fuente del texto en inglés\./);
    expect(lines[0]).toContain('licencia');
    expect(lines[0]).toContain('enlace');
    expect(lines).toHaveLength(2);
  });

  it('un pendiente que no conoce sigue diciendo su código y los avisos con casilla no cambian', () => {
    expect(incompleteText('otro_nuevo')).toBe(physicianText.incomplete.other('otro_nuevo'));
    expect(flagText('topic_inferred')).toBe(physicianText.flags.topic_inferred);
  });
});
