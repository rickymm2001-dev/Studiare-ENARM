import { describe, expect, it } from 'vitest';
import { niceMax } from './chartScale';

describe('tope del eje de la carga de repaso', () => {
  it('redondea hacia arriba a un número limpio que se parte en cuatro', () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(3)).toBe(4);
    expect(niceMax(7)).toBe(8);
    expect(niceMax(37)).toBe(40);
    expect(niceMax(400)).toBe(400);
    expect(niceMax(401)).toBe(600);
    expect(niceMax(1234)).toBe(1600);
  });

  it('nunca queda por debajo del valor', () => {
    for (const value of [5, 9, 11, 19, 23, 99, 101, 249, 251, 999, 4321, 98765]) {
      expect(niceMax(value)).toBeGreaterThanOrEqual(value);
      // Cada marca del eje es un entero
      expect(Number.isInteger(niceMax(value) / 4)).toBe(true);
      // Y no se desperdicia más de la mitad del alto
      expect(niceMax(value)).toBeLessThanOrEqual(value * 2 + 4);
    }
  });
});
