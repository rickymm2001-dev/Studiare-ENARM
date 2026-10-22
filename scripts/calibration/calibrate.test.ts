// La dirección a la que viaja la llave de la calibración (revisión de B14, hallazgo 17). Solo se usa una
// dirección https de un proyecto de Supabase, o http hacia esta misma máquina para las pruebas locales
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAllowedUrl, main } from './calibrate.ts';
import { createLogger } from './log.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a qué dirección puede viajar la llave', () => {
  it('acepta la de un proyecto de Supabase y las locales de prueba', () => {
    expect(isAllowedUrl('https://bkjbcdwglyllizupokqm.supabase.co')).toBe(true);
    expect(isAllowedUrl('https://proyecto.supabase.co/')).toBe(true);
    expect(isAllowedUrl('http://localhost:54321')).toBe(true);
    expect(isAllowedUrl('http://127.0.0.1:54321')).toBe(true);
  });

  it('rechaza cualquier otro host aunque sea https, o se parezca al de Supabase', () => {
    for (const value of [
      'https://evil.example',
      'https://supabase.co',
      'https://supabase.co.evil.example',
      'https://proyectosupabase.co',
      'https://proyecto.supabase.co.evil.example',
      'https://proyecto.supabase.co@evil.example',
      'https://evil.example/proyecto.supabase.co',
      'http://proyecto.supabase.co',
      'http://evil.example',
      'ftp://proyecto.supabase.co',
      'javascript:alert(1)',
      'no es una dirección',
      '',
    ]) {
      expect(isAllowedUrl(value), value).toBe(false);
    }
  });

  it('con una dirección que no es de Supabase no llama a ningún servidor y queda como not_configured', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const lines: string[] = [];
    const code = await main(
      {
        SUPABASE_URL: 'https://evil.example',
        SUPABASE_CALIBRATION_KEY: 'sb_secret_' + 'llave_de_prueba_1234567890',
      },
      createLogger((line) => {
        lines.push(line);
      }),
    );
    expect(code).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
    expect(lines.some((line) => line.includes('"code":"not_configured"'))).toBe(true);
    // Ni la llave ni la dirección salen en lo que se imprime
    expect(lines.join('\n')).not.toMatch(/sb_secret|evil\.example/);
  });
});
