import { describe, expect, it } from 'vitest';
import { allowedExamSizes, defaultExamSize } from './examSizes';

describe('tamaños del examen', () => {
  it('el de 280 solo está en los planes que lo permiten', () => {
    expect(allowedExamSizes(true)).toEqual([20, 50, 100, 280]);
    expect(allowedExamSizes(false)).toEqual([20, 50, 100]);
  });

  it('con el examen completo y sin límite arranca en 280 (D-012)', () => {
    expect(defaultExamSize(true, null)).toBe(280);
  });

  it('sin el examen completo arranca en el mayor que cabe en lo que le queda hoy', () => {
    expect(defaultExamSize(false, null)).toBe(100);
    expect(defaultExamSize(false, 60)).toBe(50);
    expect(defaultExamSize(false, 20)).toBe(20);
  });

  it('si no le cabe ni el más chico arranca en el más chico y la tarjeta lo limita', () => {
    expect(defaultExamSize(false, 7)).toBe(20);
    expect(defaultExamSize(false, 0)).toBe(20);
  });
});
