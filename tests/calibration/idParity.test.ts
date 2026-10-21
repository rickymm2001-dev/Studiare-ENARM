// Paridad de ids entre la app y la base (B14, 1.3 del plan). La bitácora guarda ULID y el banco uuid, y
// las funciones uuid_to_ulid y ulid_to_uuid de supabase/migrations/20261028000001_model_core.sql tienen
// que dar lo mismo que src/data/cloud/cloudIds.ts. La prueba CA14 de supabase/tests/calibration_test.sql
// lee este mismo archivo de pares con psql, así la lista es una sola
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ulidToUuid, uuidToUlid } from '@/data/cloud/cloudIds';

const ROOT = resolve(import.meta.dirname, '../..');

const FixtureSchema = z.object({
  pairs: z.array(z.object({ ulid: z.string(), uuid: z.string() })),
  invalidUlids: z.array(z.string()),
  invalidUuids: z.array(z.string()),
});
const fixture = FixtureSchema.parse(
  JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/ulid-uuid.json'), 'utf8')),
);

describe('conversión de ids, lista fija de tests/fixtures/ulid-uuid.json', () => {
  it('cada ULID da su uuid y cada uuid vuelve a su ULID', () => {
    expect(fixture.pairs.length).toBeGreaterThanOrEqual(30);
    for (const pair of fixture.pairs) {
      expect(ulidToUuid(pair.ulid), pair.ulid).toBe(pair.uuid);
      expect(uuidToUlid(pair.uuid), pair.uuid).toBe(pair.ulid);
    }
  });

  it('la lista trae los bordes, todo ceros, todo unos y cada primera letra de 0 a 7', () => {
    const ulids = fixture.pairs.map((pair) => pair.ulid);
    expect(ulids).toContain('00000000000000000000000000');
    expect(ulids).toContain('7ZZZZZZZZZZZZZZZZZZZZZZZZZ');
    for (const first of '01234567') expect(ulids.some((ulid) => ulid.startsWith(first))).toBe(true);
  });

  it('un ULID que no cabe en 128 bits o que no es ULID no tiene uuid', () => {
    expect(fixture.invalidUlids).toContain('80000000000000000000000000');
    for (const ulid of fixture.invalidUlids) expect(ulidToUuid(ulid), ulid).toBeNull();
  });

  it('un texto que no es uuid no tiene ULID, y todo uuid válido cabe en un ULID', () => {
    for (const uuid of fixture.invalidUuids) expect(uuidToUlid(uuid), uuid).toBeNull();
    // Los uuid que empiezan con 8 o más también tienen ULID, porque un ULID de 26 letras guarda 130 bits
    expect(uuidToUlid('80000000-0000-0000-0000-000000000000')).toBe('40000000000000000000000000');
    expect(uuidToUlid('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe('7ZZZZZZZZZZZZZZZZZZZZZZZZZ');
  });

  it('el ULID en minúsculas da el mismo uuid', () => {
    for (const pair of fixture.pairs) expect(ulidToUuid(pair.ulid.toLowerCase())).toBe(pair.uuid);
  });
});

describe('la base usa el mismo alfabeto y la misma forma que la app', () => {
  const migration = readFileSync(
    resolve(ROOT, 'supabase/migrations/20261028000001_model_core.sql'),
    'utf8',
  );
  const cloudIds = readFileSync(resolve(ROOT, 'src/data/cloud/cloudIds.ts'), 'utf8');

  it('el alfabeto de Crockford y el patrón de un ULID son los mismos', () => {
    const alphabet = /const ALPHABET = '([0-9A-Z]+)'/.exec(cloudIds)?.[1];
    expect(alphabet).toBe('0123456789ABCDEFGHJKMNPQRSTVWXYZ');
    expect(migration).toContain(`'${alphabet}'`);
    const pattern = /const ULID_PATTERN = \/(.+)\/i;/.exec(cloudIds)?.[1];
    expect(pattern).toBe('^[0-7][0-9A-HJKMNP-TV-Z]{25}$');
    expect(migration).toContain(`'${pattern}'`);
  });

  it('la prueba SQL CA14 lee el mismo archivo de pares', () => {
    const sqlTest = readFileSync(resolve(ROOT, 'supabase/tests/calibration_test.sql'), 'utf8');
    expect(sqlTest).toContain('ulid-uuid.json');
  });
});
