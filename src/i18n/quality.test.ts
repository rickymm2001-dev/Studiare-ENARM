import { describe, expect, it } from 'vitest';
import type { CardQualityIssue } from '@/engines/cardQuality';
import { t } from './es-MX';
import { qualityIssueMessage } from './quality';

const note = 'note' as const;
const warning = 'warning' as const;

/** Una muestra de cada aviso, con las dos gravedades donde el texto cambia */
const samples: CardQualityIssue[] = [
  { code: 'front_too_long', severity: note, words: 31, limit: 30 },
  { code: 'front_too_long', severity: warning, words: 61, limit: 30 },
  { code: 'back_too_long', severity: note, words: 26, limit: 25 },
  { code: 'back_too_long', severity: warning, words: 51, limit: 25 },
  { code: 'text_too_long', severity: note, words: 36, limit: 35 },
  { code: 'text_too_long', severity: warning, words: 71, limit: 35 },
  { code: 'list_too_long', severity: note, field: 'back', items: 4, limit: 3 },
  { code: 'list_too_long', severity: warning, field: 'text', items: 8, limit: 3 },
  { code: 'multiple_ideas', severity: note, field: 'back', sentences: 3, lines: 1 },
  { code: 'multiple_ideas', severity: warning, field: 'text', sentences: 5, lines: 3 },
  { code: 'multiple_questions', severity: note, questions: 2 },
  { code: 'too_many_holes', severity: note, holes: 4, limit: 3 },
  { code: 'hole_answer_too_long', severity: note, ordinal: 2, words: 6, limit: 5 },
  { code: 'hole_answer_too_long', severity: warning, ordinal: 2, words: 13, limit: 5 },
  { code: 'hole_without_context', severity: note, ordinal: 1, contextWords: 1, minimum: 3 },
  { code: 'hole_without_context', severity: warning, ordinal: 1, contextWords: 0, minimum: 3 },
  { code: 'answer_in_question', severity: warning, direction: 'forward' },
  { code: 'answer_in_question', severity: warning, direction: 'reverse' },
  { code: 'answer_in_question', severity: warning, direction: 'both' },
  { code: 'answer_in_cloze_text', severity: warning, ordinals: [1] },
  { code: 'answer_in_cloze_text', severity: warning, ordinals: [1, 2, 3] },
];

describe('mensajes de calidad de tarjetas', () => {
  it('cada aviso tiene un mensaje en español, completo y sin dos puntos', () => {
    for (const issue of samples) {
      const message = qualityIssueMessage(issue);
      expect(message.length, issue.code).toBeGreaterThan(30);
      expect(message, issue.code).toMatch(/[.)]$/);
      expect(message, issue.code).not.toContain(':');
      expect(message, issue.code).not.toMatch(/undefined|NaN|\[object/);
    }
  });

  it('las muestras cubren todos los códigos', () => {
    const covered = new Set(samples.map((issue) => issue.code));
    expect(covered.size).toBe(11);
  });

  it('usa las cifras del aviso y el singular cuando toca', () => {
    expect(qualityIssueMessage(samples[0] as CardQualityIssue)).toContain('31 palabras');
    expect(
      qualityIssueMessage({
        code: 'hole_without_context',
        severity: note,
        ordinal: 3,
        contextWords: 1,
        minimum: 3,
      }),
    ).toContain('solo 1 palabra de contexto');
    expect(
      qualityIssueMessage({
        code: 'multiple_ideas',
        severity: note,
        field: 'back',
        sentences: 3,
        lines: 3,
      }),
    ).toContain('3 oraciones en 3 líneas');
    expect(qualityIssueMessage(samples[8] as CardQualityIssue)).toContain('(3 oraciones)');
    expect(
      qualityIssueMessage({ code: 'too_many_holes', severity: note, holes: 4, limit: 3 }),
    ).toContain('4 huecos distintos');
  });

  it('nombra los huecos como en el editor, con una lista en español', () => {
    expect(
      qualityIssueMessage({ code: 'answer_in_cloze_text', severity: warning, ordinals: [1] }),
    ).toContain('el hueco c1');
    expect(
      qualityIssueMessage({ code: 'answer_in_cloze_text', severity: warning, ordinals: [1, 2, 3] }),
    ).toContain('los huecos c1, c2 y c3');
  });

  it('está integrado en la i18n central', () => {
    expect(t.cardQuality.issue).toBe(qualityIssueMessage);
    expect(t.cardQuality.severity).toEqual({ warning: 'Aviso', note: 'Sugerencia' });
    expect(t.cardQuality.more(1234)).toBe('Y 1,234 más.');
  });
});
