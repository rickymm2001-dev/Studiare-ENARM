import { describe, expect, it } from 'vitest';
import { failedCalls, outcomeRows, spentRows, validRange } from './cloudCostsView';

describe('desglose del costo de la nube', () => {
  it('ordena de lo que más costó a lo que menos y saca la parte de cada uno', () => {
    const rows = spentRows(
      {
        forgetting: { calls: 40, costUsd: 0.3 },
        flashcards: { calls: 80, costUsd: 1.2 },
        bias_tips: { calls: 10, costUsd: 0 },
      },
      1.5,
    );
    expect(rows.map((row) => row.key)).toEqual(['flashcards', 'forgetting', 'bias_tips']);
    expect(rows[0]?.share).toBeCloseTo(0.8);
    expect(rows[1]?.share).toBeCloseTo(0.2);
    expect(rows[2]?.share).toBe(0);
  });

  it('sin gasto total las partes son cero y los empates siguen el orden de los motores', () => {
    const rows = spentRows(
      { restructure: { calls: 3, costUsd: 0 }, forgetting: { calls: 3, costUsd: 0 } },
      0,
      ['forgetting', 'weekly_report', 'flashcards', 'bias_tips', 'restructure'],
    );
    expect(rows.map((row) => [row.key, row.share])).toEqual([
      ['forgetting', 0],
      ['restructure', 0],
    ]);
  });

  it('los resultados van de los más a los menos frecuentes y se cuentan las llamadas sin texto', () => {
    const outcomes = { ok: 110, retried_ok: 6, refused: 4, provider_error: 1, rate_limited: 0 };
    expect(outcomeRows(outcomes).map((row) => row.key)).toEqual([
      'ok',
      'retried_ok',
      'refused',
      'provider_error',
      'rate_limited',
    ]);
    expect(failedCalls(outcomes)).toBe(5);
    expect(failedCalls({})).toBe(0);
  });

  it('un periodo va de una fecha a otra, de hasta un año', () => {
    expect(validRange({ from: '2026-10-01', to: '2026-10-31' })).toBe(true);
    expect(validRange({ from: '2026-10-31', to: '2026-10-01' })).toBe(false);
    expect(validRange({ from: '2026-10-01', to: '' })).toBe(false);
    expect(validRange({ from: '2025-10-01', to: '2026-10-03' })).toBe(false);
    expect(validRange({ from: '2025-10-01', to: '2026-10-01' })).toBe(true);
  });
});
