import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SqlParseError,
  anonGrants,
  checkQuery,
  extractFunctions,
  fingerprint,
  fingerprintQuery,
} from './sql.ts';

const ROOT = join(import.meta.dirname, '../..');

describe('funciones de un archivo SQL', () => {
  it('saca nombre, esquema, argumentos y cuerpo, sin confundirse con comentarios ni cadenas', () => {
    const sql = `
-- create or replace function public.en_comentario() returns void as $$ select 1 $$;
/* create function public.en_bloque() /* anidado */ returns int as $$ select 2 $$; */
create or replace function public.alfa(p_note text default 'a;b', p_n int default 1)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- un punto y coma ; dentro del cuerpo
  return 'create function public.falsa() as $x$ $x$;';
end;
$$;
select 'create function public.en_cadena() returns int as $$ select 3 $$';
create function beta() returns int language sql as $fn$ select 1; $fn$;
CREATE OR REPLACE FUNCTION "public"."Gamma"() RETURNS int LANGUAGE sql AS 'select ''x''';
create procedure public.delta() language sql begin atomic select 1; end;
do $$ begin execute 'create function public.dinamica() returns int as $q$ select 1 $q$'; end $$;
`;
    const found = extractFunctions(sql);
    expect(found.map((fn) => `${fn.schema}.${fn.name}`)).toEqual([
      'public.alfa',
      'public.beta',
      'public.Gamma',
      'public.delta',
    ]);
    expect(found[0]?.args).toBe("p_note text default 'a;b', p_n int default 1");
    expect(found[0]?.body).toContain("return 'create function public.falsa()");
    expect(found[0]?.line).toBe(4);
    expect(found[1]?.body).toBe(' select 1; ');
    expect(found[2]?.body).toBe("select 'x'");
    expect(found[3]?.body).toBeNull();
  });

  it('avisa de un cuerpo sin cerrar', () => {
    expect(() =>
      extractFunctions('create function public.x() returns int as $$ select 1;'),
    ).toThrow(SqlParseError);
  });

  it('la huella no cambia por comentarios de línea ni espacios y sí por el código', () => {
    // md5 del texto sin comentarios ni espacios, calculado aparte con md5sum
    const base = fingerprint('begin\n  return 1; -- uno\nend;');
    expect(base).toBe('d7d8eaabbcc6b7ad64d519ae2f677702');
    expect(fingerprint('begin return 1;\n\n\tend;')).toBe(base);
    expect(fingerprint('begin return 2; end;')).not.toBe(base);
    expect(fingerprint(' select\r\n 1 ')).toBe('f6bf37efedbc0a2dfffc1caf5088d86e');
  });

  it('la consulta de huellas usa la misma cuenta que la base y solo acepta nombres simples', () => {
    const query = fingerprintQuery(['alfa', 'beta_2']);
    expect(query).toContain(
      "md5(regexp_replace(regexp_replace(p.prosrc, '--[^\\n]*', '', 'g'), '\\s+', '', 'g'))",
    );
    expect(query).toContain("any (array['alfa', 'beta_2']::text[])");
    expect(query).toContain("has_function_privilege('anon', p.oid, 'execute')");
    expect(query).toContain('pg_catalog.pg_proc');
    expect(() => fingerprintQuery(["x'; drop table y; --"])).toThrow(SqlParseError);
  });
});

describe('permisos para anon', () => {
  it('lee grants de varias líneas y de varias funciones, e ignora los que no son de anon', () => {
    const sql = `
revoke all on function public.uno(text) from public, anon, authenticated, service_role;
grant execute on function public.uno(text)
  to authenticated;
grant execute on function public.dos(text, int), public.tres() to anon, authenticated;
grant all on function cuatro() to public;
grant select on table public.cinco to anon;
do $$ begin execute 'grant execute on function public.seis() to anon'; end $$;
`;
    const grants = anonGrants(sql);
    expect([...grants.functions].sort()).toEqual(['cuatro', 'dos', 'tres']);
    expect(grants.all).toBe(false);
    expect(anonGrants('grant execute on all functions in schema public to anon;').all).toBe(true);
  });
});

describe('consulta de comprobación de un archivo manual', () => {
  it('toma el select que sigue a la última línea de Comprobación', () => {
    const sql = `begin;\ncreate table x (id int);\ncommit;\n-- ===== Comprobación\nselect\n  true as listo; -- fin\n`;
    expect(checkQuery(sql)).toBe('select\n  true as listo');
    expect(checkQuery('select 1;')).toBeNull();
    expect(() => checkQuery('-- Comprobación\nselect 1; select 2;')).toThrow(SqlParseError);
  });

  it('las de los archivos manuales del repo son un solo select', () => {
    for (const name of ['pagos-b10.sql', 'party-dueno-al-borrar-cuenta.sql']) {
      const query = checkQuery(readFileSync(join(ROOT, 'supabase/manual', name), 'utf8'));
      expect(query?.startsWith('select')).toBe(true);
    }
  });
});

describe('las migraciones del repo', () => {
  it('se leen todas y cada función tiene cuerpo', () => {
    const dir = join(ROOT, 'supabase/migrations');
    const names = new Set<string>();
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql'))) {
      const functions = extractFunctions(readFileSync(join(dir, file), 'utf8'));
      for (const fn of functions) {
        expect(fn.body, `${file} ${fn.name}`).not.toBeNull();
        names.add(fn.name);
      }
    }
    // El 2026-10-15 se comprobó contra un Postgres local con las migraciones de supabase/tests/run.sh
    // que estas 128 funciones, más la de Party de supabase/manual, dan la misma huella que la base
    expect(names.size).toBeGreaterThanOrEqual(128);
  });

  it('B10 trae 45 funciones, las 44 del conector más delete_my_account de la Sección con delete', () => {
    const names = [
      '20261022000001_billing_emails.sql',
      '20261022000002_billing_plans.sql',
      '20261022000003_invoice_requests.sql',
    ].flatMap((file) =>
      extractFunctions(readFileSync(join(ROOT, 'supabase/migrations', file), 'utf8')).map(
        (fn) => fn.name,
      ),
    );
    expect(new Set(names).size).toBe(45);
    expect(names).toContain('delete_my_account');
  });
});
