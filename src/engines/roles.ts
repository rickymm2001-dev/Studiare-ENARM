/**
 * Reglas para cambiar roles (D-070). Las mismas que aplica la función set_user_role de Supabase
 * (supabase/migrations, D-069). Aquí sirven para la interfaz y para el modo local.
 *   - Solo admin o dueño cambian roles
 *   - Nadie cambia su propio rol
 *   - El rol de dueño no se asigna ni se quita desde la app
 *   - Solo el dueño nombra o quita admins
 */
export type AppRole = 'student' | 'physician' | 'admin' | 'owner';

export type RoleChangeDenied =
  | 'not_admin'
  | 'self'
  | 'owner_not_assignable'
  | 'cannot_remove_owner'
  | 'only_owner_manages_admins';

export type RoleChangeCheck = { ok: true } | { ok: false; reason: RoleChangeDenied };

export function checkRoleChange(input: {
  caller: AppRole;
  target: AppRole;
  next: AppRole;
  isSelf: boolean;
}): RoleChangeCheck {
  const { caller, target, next } = input;
  if (caller !== 'admin' && caller !== 'owner') return { ok: false, reason: 'not_admin' };
  if (input.isSelf) return { ok: false, reason: 'self' };
  if (next === 'owner') return { ok: false, reason: 'owner_not_assignable' };
  if (target === 'owner') return { ok: false, reason: 'cannot_remove_owner' };
  if ((target === 'admin' || next === 'admin') && caller !== 'owner') {
    return { ok: false, reason: 'only_owner_manages_admins' };
  }
  return { ok: true };
}

/** Roles a los que el que llama puede mover a alguien con el rol dado */
export function assignableRoles(caller: AppRole, target: AppRole, isSelf: boolean): AppRole[] {
  return (['student', 'physician', 'admin'] as const).filter(
    (next) => next === target || checkRoleChange({ caller, target, next, isSelf }).ok,
  );
}
