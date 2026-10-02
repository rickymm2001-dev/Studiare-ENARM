import { describe, expect, it } from 'vitest';
import { createRng } from './random';

describe('azar con semilla', () => {
  it('la misma semilla da la misma secuencia y otra semilla da otra', () => {
    const a = createRng('semilla');
    const b = createRng('semilla');
    const c = createRng('otra');
    const seqA = Array.from({ length: 10 }, () => a.next());
    expect(Array.from({ length: 10 }, () => b.next())).toEqual(seqA);
    expect(Array.from({ length: 10 }, () => c.next())).not.toEqual(seqA);
    expect(createRng(42).next()).toBe(createRng('42').next());
  });

  it('uniforme en [0, 1) con media cercana a 0.5', () => {
    const rng = createRng(1);
    const values = Array.from({ length: 20000 }, () => rng.next());
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    expect(values.reduce((s, v) => s + v, 0) / values.length).toBeCloseTo(0.5, 1);
  });

  it('int, pick, shuffle y chance', () => {
    const rng = createRng('x');
    const ints = Array.from({ length: 2000 }, () => rng.int(1, 6));
    expect(new Set(ints)).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(() => rng.int(3, 2)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
    expect(['a', 'b']).toContain(rng.pick(['a', 'b']));
    const items = Array.from({ length: 50 }, (_, i) => i);
    const shuffled = rng.shuffle(items);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
    expect(shuffled).not.toEqual(items);
    expect(items[0]).toBe(0);
    const hits = Array.from({ length: 10000 }, () => rng.chance(0.3)).filter(Boolean).length;
    expect(hits / 10000).toBeCloseTo(0.3, 1);
  });

  it('normal, gamma y beta tienen la media esperada', () => {
    const rng = createRng('distribuciones');
    const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean(Array.from({ length: 20000 }, () => rng.normal(2, 3)))).toBeCloseTo(2, 1);
    expect(mean(Array.from({ length: 20000 }, () => rng.gamma(3)))).toBeCloseTo(3, 1);
    expect(mean(Array.from({ length: 20000 }, () => rng.gamma(0.5)))).toBeCloseTo(0.5, 1);
    expect(mean(Array.from({ length: 20000 }, () => rng.beta(2, 6)))).toBeCloseTo(0.25, 1);
    expect(() => rng.gamma(0)).toThrow(RangeError);
  });
});
