import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { newId } from '../ids';
import { ulidToUuid, uuidToUlid } from './cloudIds';

describe('ids de la app y de la nube', () => {
  it('convierte valores conocidos', () => {
    expect(ulidToUuid('00000000000000000000000000')).toBe('00000000-0000-0000-0000-000000000000');
    expect(ulidToUuid('7ZZZZZZZZZZZZZZZZZZZZZZZZZ')).toBe('ffffffff-ffff-ffff-ffff-ffffffffffff');
    expect(ulidToUuid('00000000000000000000000001')).toBe('00000000-0000-0000-0000-000000000001');
    expect(ulidToUuid('0000000000000000000000000Z')).toBe('00000000-0000-0000-0000-00000000001f');
    expect(uuidToUlid('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe('7ZZZZZZZZZZZZZZZZZZZZZZZZZ');
  });

  it('un ULID de la app vuelve igual después de ir y regresar', () => {
    for (let index = 0; index < 200; index += 1) {
      const id = newId();
      const uuid = ulidToUuid(id);
      expect(uuid).not.toBeNull();
      expect(uuidToUlid(uuid ?? '')).toBe(id);
    }
  });

  it('para cualquier valor de 128 bits ida y vuelta no pierde nada', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: (1n << 128n) - 1n }), (value) => {
        const hex = value.toString(16).padStart(32, '0');
        const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        const ulid = uuidToUlid(uuid);
        expect(ulid).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
        expect(ulidToUuid(ulid ?? '')).toBe(uuid);
      }),
    );
  });

  it('dos ULID distintos dan uuid distintos, y se conserva el orden', () => {
    const first = newId();
    const second = newId();
    expect(first < second).toBe(true);
    expect((ulidToUuid(first) ?? '') < (ulidToUuid(second) ?? '')).toBe(true);
  });

  it('acepta minúsculas y devuelve el uuid en minúsculas y el ULID en mayúsculas', () => {
    const id = newId();
    expect(ulidToUuid(id.toLowerCase())).toBe(ulidToUuid(id));
    expect(uuidToUlid((ulidToUuid(id) ?? '').toUpperCase())).toBe(id);
  });

  it('rechaza lo que no es un ULID o un uuid', () => {
    for (const bad of [
      '',
      'abc',
      '8ZZZZZZZZZZZZZZZZZZZZZZZZZ',
      '0000000000000000000000000I',
      `${newId()}0`,
    ]) {
      expect(ulidToUuid(bad)).toBeNull();
    }
    for (const bad of [
      '',
      'no-es-uuid',
      '00000000000000000000000000000000',
      'g0000000-0000-0000-0000-000000000000',
    ]) {
      expect(uuidToUlid(bad)).toBeNull();
    }
  });
});
