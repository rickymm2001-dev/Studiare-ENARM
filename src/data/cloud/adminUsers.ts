// Usuarios reales para el admin y el dueño (Fase H, D-108). La lista sale de admin_list_users, que solo
// contesta a un admin o al dueño, y el cambio de rol lo hace set_user_role, que aplica las mismas
// reglas que engines/roles. Aquí solo se llaman y se traducen sus errores.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { RoleChangeDenied } from '../../engines/roles.ts';
import { RoleSchema, type Role } from '../schemas/common.ts';

export const USERS_PAGE_SIZE = 25;

export interface CloudUser {
  id: string;
  alias: string;
  email: string | null;
  role: Role;
  plan: string;
  createdAt: string;
}

export type UsersFailure = 'not_admin' | 'no_session' | 'network' | 'unknown';
export type ListUsersResult =
  { ok: true; users: CloudUser[]; total: number } | { ok: false; reason: UsersFailure };

const RowSchema = z.object({
  user_id: z.string(),
  alias: z.string(),
  email: z.string().nullable(),
  role: RoleSchema,
  plan: z.string(),
  created_at: z.string(),
  total: z.coerce.number(),
});

interface RpcError {
  code?: string | undefined;
  message?: string | undefined;
}

function failureOf(error: RpcError): UsersFailure {
  if (error.code === '42501') return 'not_admin';
  if (error.code === '28000') return 'no_session';
  // Sin código es que la petición ni llegó al servidor
  if (!error.code) return 'network';
  return 'unknown';
}

/** Una página de cuentas. query busca en el alias y en el correo, y role filtra por rol */
export async function listCloudUsers(
  cloud: Pick<SupabaseClient, 'rpc'>,
  input: { query: string; role: Role | null; page: number },
): Promise<ListUsersResult> {
  try {
    const reply = await cloud.rpc('admin_list_users', {
      p_query: input.query.trim() === '' ? null : input.query.trim(),
      p_role: input.role,
      p_limit: USERS_PAGE_SIZE,
      p_offset: Math.max(0, input.page) * USERS_PAGE_SIZE,
    });
    if (reply.error) return { ok: false, reason: failureOf(reply.error) };
    const parsed = z.array(RowSchema).safeParse(reply.data);
    if (!parsed.success) return { ok: false, reason: 'unknown' };
    return {
      ok: true,
      total: parsed.data[0]?.total ?? 0,
      users: parsed.data.map((row) => ({
        id: row.user_id,
        alias: row.alias,
        email: row.email,
        role: row.role,
        plan: row.plan,
        createdAt: row.created_at,
      })),
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export type SetRoleResult =
  { ok: true } | { ok: false; reason: RoleChangeDenied | 'no_session' | 'network' | 'unknown' };

/** Los textos con los que set_user_role rechaza un cambio, de más específico a menos */
const DENIALS: readonly [RegExp, RoleChangeDenied][] = [
  [/propio rol/i, 'self'],
  [/dueño no se asigna/i, 'owner_not_assignable'],
  [/quitar al dueño/i, 'cannot_remove_owner'],
  [/dueño nombra o quita/i, 'only_owner_manages_admins'],
  [/administrador puede cambiar roles/i, 'not_admin'],
];

export async function setCloudUserRole(
  cloud: Pick<SupabaseClient, 'rpc'>,
  target: string,
  next: Role,
): Promise<SetRoleResult> {
  try {
    const reply = await cloud.rpc('set_user_role', { target, new_role: next });
    if (!reply.error) return { ok: true };
    if (reply.error.code === '42501') {
      const match = DENIALS.find(([pattern]) => pattern.test(reply.error.message));
      return { ok: false, reason: match ? match[1] : 'not_admin' };
    }
    if (reply.error.code === '28000') return { ok: false, reason: 'no_session' };
    return { ok: false, reason: reply.error.code ? 'unknown' : 'network' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
