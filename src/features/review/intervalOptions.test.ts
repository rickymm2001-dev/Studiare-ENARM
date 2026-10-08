import { describe, expect, it } from 'vitest';
import { fromOption, maxIntervalOptions, MAX_INTERVAL_OPTIONS, toOption } from './intervalOptions';

describe('opciones del intervalo máximo', () => {
  it('con un valor de la lista no agrega nada', () => {
    expect(maxIntervalOptions('21')).toEqual([...MAX_INTERVAL_OPTIONS]);
    expect(maxIntervalOptions('none')).toEqual([...MAX_INTERVAL_OPTIONS]);
  });

  it('con un valor fuera de la lista, como el del perfil guía, lo agrega en su lugar', () => {
    const options = maxIntervalOptions('287');
    expect(options).toContain('287');
    // Queda entre 180 y sin tope, y todo lo demás sigue ahí
    expect(options.indexOf('287')).toBe(options.indexOf('180') + 1);
    expect(options.at(-1)).toBe('none');
    for (const value of MAX_INTERVAL_OPTIONS) expect(options).toContain(value);
  });

  it('un valor chico fuera de la lista queda ordenado entre sus vecinos', () => {
    const options = maxIntervalOptions('4');
    expect(options.slice(0, 3)).toEqual(['3', '4', '5']);
  });

  it('convierte entre días y opción sin perder el valor', () => {
    expect(fromOption(toOption(287))).toBe(287);
    expect(fromOption(toOption(null))).toBeNull();
  });
});
