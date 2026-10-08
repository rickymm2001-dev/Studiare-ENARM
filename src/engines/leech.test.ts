import { describe, expect, it } from 'vitest';
import type { CardQualityIssue } from './cardQuality';
import { leechHit, leechSuggestions } from './leech';

describe('cuándo una tarjeta se vuelve sanguijuela', () => {
  it('avisa al llegar al umbral y de nuevo cada medio umbral', () => {
    // Con umbral 8 avisa en 8, 12, 16 y 20
    const hits = Array.from({ length: 24 }, (_, lapses) => lapses).filter((lapses) =>
      leechHit(lapses - 1, lapses, 8),
    );
    expect(hits).toEqual([8, 12, 16, 20]);
  });

  it('no avisa si no hubo un olvido nuevo, y con umbral 1 avisa en cada olvido', () => {
    expect(leechHit(8, 8, 8)).toBe(false);
    expect(leechHit(7, 7, 8)).toBe(false);
    expect(leechHit(0, 1, 1)).toBe(true);
    expect(leechHit(1, 2, 1)).toBe(true);
  });
});

describe('qué sugerir para una sanguijuela', () => {
  const issue = (value: Partial<CardQualityIssue> & { code: CardQualityIssue['code'] }) =>
    value as CardQualityIssue;

  it('sin pistas de calidad sugiere reescribirla', () => {
    expect(leechSuggestions([])).toEqual(['rewrite']);
    expect(leechSuggestions([issue({ code: 'answer_in_question', severity: 'warning' })])).toEqual([
      'rewrite',
    ]);
  });

  it('varias ideas o listas largas piden dividirla, y lo largo acortarla', () => {
    expect(
      leechSuggestions([
        issue({ code: 'list_too_long', severity: 'note' }),
        issue({ code: 'back_too_long', severity: 'note' }),
        issue({ code: 'multiple_ideas', severity: 'warning' }),
      ]),
    ).toEqual(['split', 'shorten']);
  });

  it('un hueco sin contexto pide darle contexto', () => {
    expect(leechSuggestions([issue({ code: 'hole_without_context', severity: 'note' })])).toEqual([
      'context',
    ]);
  });
});
