// Los catálogos de la app son los mismos que acepta la base, así el formulario nunca ofrece un código
// que request_invoice rechazaría (B10, 3.2)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CFDI_USES, TAX_REGIMES, catalogLabel } from './cfdi';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261022000003_invoice_requests.sql', import.meta.url),
  'utf8',
);

/** Los códigos de la lista "<columna> in (...)" de la tabla */
function codesOf(column: string): string[] {
  const match = new RegExp(`${column} text not null check \\(${column} in \\(([^)]*)\\)`, 's').exec(
    migration,
  );
  if (!match?.[1]) throw new Error(`No se encontró la lista de ${column} en la migración`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1] ?? '');
}

describe('catálogos del SAT', () => {
  it('el régimen fiscal tiene los mismos códigos que la base, sin repetir', () => {
    const codes = TAX_REGIMES.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect([...codes].sort()).toEqual([...codesOf('tax_regime')].sort());
  });

  it('el uso del CFDI tiene los mismos códigos que la base, con Gastos en general primero', () => {
    const codes = CFDI_USES.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect([...codes].sort()).toEqual([...codesOf('cfdi_use')].sort());
    expect(CFDI_USES[0]).toEqual({ code: 'G03', name: 'Gastos en general' });
  });

  it('cada opción lleva su código y su nombre, sin dos puntos', () => {
    for (const entry of [...TAX_REGIMES, ...CFDI_USES]) {
      expect(entry.name.length).toBeGreaterThan(3);
      expect(catalogLabel(entry)).toBe(`${entry.code} ${entry.name}`);
      expect(entry.name).not.toContain(':');
    }
  });
});
