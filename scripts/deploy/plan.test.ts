import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkDifferences } from './deploy.ts';
import { PlanError, loadPlan } from './plan.ts';

const dirs: string[] = [];

function repoWith(files: Record<string, string>, plan: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'studiare-plan-'));
  dirs.push(root);
  const all = { ...files, 'deploy/prueba.json': JSON.stringify(plan) };
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const SQL = 'select 1;\n';
const plan = (migrations: unknown[]) => ({ description: 'Prueba', migrations });

describe('la comprobación de un archivo manual', () => {
  const MANUAL = `create table if not exists public.t (id int);
-- Comprobación
select (select count(*) from public.t) = 0 as vacia, true as lista;
`;
  it('el plan debe nombrar exactamente las columnas del select', () => {
    const files = { 'supabase/manual/arreglo.sql': MANUAL };
    const missing = repoWith(
      files,
      plan([{ file: 'supabase/manual/arreglo.sql', check: { lista: true } }]),
    );
    expect(() => loadPlan(missing, 'prueba')).toThrow(/vacia/);
    const extra = repoWith(
      files,
      plan([{ file: 'supabase/manual/arreglo.sql', check: { vacia: true, lista: true, otra: 1 } }]),
    );
    expect(() => loadPlan(extra, 'prueba')).toThrow(/otra/);
    const ok = repoWith(
      files,
      plan([{ file: 'supabase/manual/arreglo.sql', check: { vacia: true, lista: true } }]),
    );
    expect(loadPlan(ok, 'prueba').migrations[0]?.check).toEqual({ vacia: true, lista: true });
  });

  it('una fila que no llega o una columna que falta no cuentan como verde', () => {
    expect(checkDifferences(undefined, { lista: false })).toEqual([
      'lista no llegó, la consulta no devolvió filas',
    ]);
    expect(checkDifferences({ otra: true }, { lista: false })).toEqual([
      'lista no viene en el resultado',
    ]);
    expect(checkDifferences({ lista: false }, { lista: false })).toEqual([]);
  });
});

describe('nombres con los que se reconoce lo aplicado', () => {
  it('dos migraciones del repo no pueden llamarse igual', () => {
    const root = repoWith(
      {
        'supabase/migrations/20260101000001_pagos.sql': SQL,
        'supabase/migrations/20260201000001_pagos.sql': SQL,
      },
      plan([{ file: 'supabase/migrations/20260101000001_pagos.sql' }]),
    );
    expect(() => loadPlan(root, 'prueba')).toThrow(PlanError);
    expect(() => loadPlan(root, 'prueba')).toThrow(/con el mismo nombre pagos/);
  });

  it('ninguna migración puede llamarse como un trozo de otra', () => {
    const root = repoWith(
      {
        'supabase/migrations/20260101000001_pagos.sql': SQL,
        'supabase/migrations/20260201000001_pagos_2.sql': SQL,
      },
      plan([{ file: 'supabase/migrations/20260101000001_pagos.sql' }]),
    );
    expect(() => loadPlan(root, 'prueba')).toThrow(/se llama como un trozo de/);
  });

  it('name y recordedAs no pueden ser el nombre de otro archivo ni repetirse en el plan', () => {
    const files = {
      'supabase/migrations/20260101000001_pagos.sql': SQL,
      'supabase/migrations/20260201000001_correos.sql': SQL,
      'supabase/manual/arreglo.sql': SQL,
    };
    const other = repoWith(
      files,
      plan([{ file: 'supabase/migrations/20260101000001_pagos.sql', recordedAs: ['correos'] }]),
    );
    expect(() => loadPlan(other, 'prueba')).toThrow(/usa el nombre correos, que es de/);
    const manualName = repoWith(
      files,
      plan([{ file: 'supabase/migrations/20260101000001_pagos.sql', name: 'manual_arreglo' }]),
    );
    expect(() => loadPlan(manualName, 'prueba')).toThrow(/usa el nombre manual_arreglo/);
    const twice = repoWith(
      files,
      plan([
        { file: 'supabase/migrations/20260101000001_pagos.sql', recordedAs: ['pagos_1'] },
        { file: 'supabase/migrations/20260201000001_correos.sql', recordedAs: ['pagos_1'] },
      ]),
    );
    expect(() => loadPlan(twice, 'prueba')).toThrow(/usan el mismo nombre pagos_1/);
  });

  it('los planes del repo cumplen las reglas', () => {
    const root = join(import.meta.dirname, '../..');
    expect(loadPlan(root, 'b10').migrations[1]?.recordedAs).toEqual([
      'billing_plans_1',
      'billing_plans_2',
      'billing_plans_3',
      'billing_plans_4',
      'billing_plans_5',
    ]);
    expect(() => loadPlan(root, 'b9')).not.toThrow();
  });
});
