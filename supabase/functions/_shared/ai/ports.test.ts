import { describe, expect, it } from 'vitest';
import { RoleSchema } from '../../../../src/data/schemas/common.ts';
import { AI_ROLES, isStaff, LOG_CODE } from './ports.ts';

describe('puertos del núcleo', () => {
  it('los roles son los mismos que los de la app', () => {
    expect([...AI_ROLES]).toEqual(RoleSchema.options);
  });

  it('solo el alumno no es del equipo', () => {
    expect(AI_ROLES.filter((role) => isStaff(role))).toEqual(['physician', 'admin', 'owner']);
  });

  it('un código del registro no deja pasar texto libre', () => {
    expect(LOG_CODE.test('ai.batch.created')).toBe(true);
    expect(LOG_CODE.test('ai_proxy')).toBe(true);
    expect(LOG_CODE.test('Error de Ana')).toBe(false);
    expect(LOG_CODE.test('ai.batch created')).toBe(false);
    expect(LOG_CODE.test('')).toBe(false);
  });
});
