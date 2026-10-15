import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ClosureError, functionClosure, importSpecifiers } from './closure.ts';

const ROOT = join(import.meta.dirname, '../..');
const dirs: string[] = [];

function repoWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'studiare-closure-'));
  dirs.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('lo que importa un módulo', () => {
  it('encuentra import, import type, export from, import de efecto e import dinámico', () => {
    const source = `
// import { nada } from './comentario.ts';
import { a,
  b } from '../_shared/a.ts';
import type { T } from "./tipos.ts";
export * from './todo.ts';
export { c } from './c.ts';
import './efecto.ts';
export const URL_DE_STRIPE = 'https://api.stripe.com';
const modulo = await import('./dinamico.ts');
import { z } from 'npm:zod@4';
`;
    expect(importSpecifiers(source)).toEqual([
      '../_shared/a.ts',
      './tipos.ts',
      './todo.ts',
      './c.ts',
      './efecto.ts',
      './dinamico.ts',
      'npm:zod@4',
    ]);
  });
});

describe('cierre de una Edge Function', () => {
  it('sigue los imports relativos y deja las rutas desde la raíz del repo', () => {
    const root = repoWith({
      'supabase/functions/hola/index.ts': `import { a } from '../_shared/a.ts';\nimport { z } from 'npm:zod@4';\nDeno.serve(() => a());`,
      'supabase/functions/_shared/a.ts': `import type { B } from './b.ts';\nexport * from './c.ts';\nexport const a = () => new Response('ok');`,
      'supabase/functions/_shared/b.ts': `export type B = string;`,
      'supabase/functions/_shared/c.ts': `import { a } from './a.ts';\nexport const c = a;`,
      'supabase/functions/_shared/sin-usar.ts': `export const x = 1;`,
    });
    const closure = functionClosure(root, 'hola');
    expect(closure.entrypointPath).toBe('supabase/functions/hola/index.ts');
    expect(closure.files.map((file) => file.path)).toEqual([
      'supabase/functions/hola/index.ts',
      'supabase/functions/_shared/a.ts',
      'supabase/functions/_shared/b.ts',
      'supabase/functions/_shared/c.ts',
    ]);
    expect(closure.files[0]?.bytes).toBeGreaterThan(0);
    expect(closure.external).toEqual(['npm:zod@4']);
  });

  it('falla si un import no existe o sale de supabase/functions', () => {
    const missing = repoWith({
      'supabase/functions/hola/index.ts': `import { a } from '../_shared/falta.ts';`,
    });
    expect(() => functionClosure(missing, 'hola')).toThrow(ClosureError);
    expect(() => functionClosure(missing, 'hola')).toThrow(/_shared\/falta\.ts no existe/);
    const outside = repoWith({
      'supabase/functions/hola/index.ts': `import { a } from '../../../src/config/billing.ts';`,
      'src/config/billing.ts': 'export const a = 1;',
    });
    expect(() => functionClosure(outside, 'hola')).toThrow(/queda fuera de supabase\/functions/);
    expect(() => functionClosure(missing, 'no-existe')).toThrow(/no tiene supabase\/functions/);
  });

  it('cancel-subscription del repo lleva su index.ts y los módulos de _shared que usa', () => {
    const closure = functionClosure(ROOT, 'cancel-subscription');
    expect(closure.files[0]?.path).toBe('supabase/functions/cancel-subscription/index.ts');
    const paths = closure.files.map((file) => file.path);
    expect(paths).toContain('supabase/functions/_shared/mercadopago.ts');
    expect(paths).toContain('supabase/functions/_shared/runtime.ts');
    expect(paths.some((path) => path.endsWith('.test.ts'))).toBe(false);
    expect(closure.external).toEqual([]);
  });
});
