import { describe, expect, it } from 'vitest';
import { assignableRoles, checkRoleChange } from './roles';

describe('reglas de roles, iguales a set_user_role de Supabase (D-069, D-070)', () => {
  it('un alumno o un médico no cambian roles', () => {
    expect(
      checkRoleChange({ caller: 'student', target: 'student', next: 'physician', isSelf: false }),
    ).toEqual({ ok: false, reason: 'not_admin' });
    expect(
      checkRoleChange({ caller: 'physician', target: 'student', next: 'physician', isSelf: false })
        .ok,
    ).toBe(false);
  });

  it('nadie cambia su propio rol', () => {
    expect(
      checkRoleChange({ caller: 'owner', target: 'owner', next: 'student', isSelf: true }),
    ).toEqual({ ok: false, reason: 'self' });
  });

  it('el admin nombra médicos pero no admins, y nadie toca al dueño', () => {
    expect(
      checkRoleChange({ caller: 'admin', target: 'student', next: 'physician', isSelf: false }).ok,
    ).toBe(true);
    expect(
      checkRoleChange({ caller: 'admin', target: 'student', next: 'admin', isSelf: false }),
    ).toEqual({ ok: false, reason: 'only_owner_manages_admins' });
    expect(
      checkRoleChange({ caller: 'admin', target: 'admin', next: 'student', isSelf: false }).ok,
    ).toBe(false);
    expect(
      checkRoleChange({ caller: 'owner', target: 'owner', next: 'student', isSelf: false }),
    ).toEqual({ ok: false, reason: 'cannot_remove_owner' });
    expect(
      checkRoleChange({ caller: 'owner', target: 'student', next: 'owner', isSelf: false }),
    ).toEqual({ ok: false, reason: 'owner_not_assignable' });
  });

  it('el dueño nombra y quita admins', () => {
    expect(
      checkRoleChange({ caller: 'owner', target: 'student', next: 'admin', isSelf: false }).ok,
    ).toBe(true);
    expect(
      checkRoleChange({ caller: 'owner', target: 'admin', next: 'physician', isSelf: false }).ok,
    ).toBe(true);
    expect(assignableRoles('owner', 'student', false)).toEqual(['student', 'physician', 'admin']);
    expect(assignableRoles('admin', 'student', false)).toEqual(['student', 'physician']);
    expect(assignableRoles('admin', 'admin', false)).toEqual(['admin']);
  });
});
