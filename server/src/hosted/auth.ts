// Quién llama al proxy alojado (D-103, Fase G bloque G1). La app manda el token de la sesión de
// Supabase y aquí se verifica con Supabase mismo, sin guardar ninguna llave para validar firmas. Se
// lee el plan con my_plan, que usa la barrera del dispositivo único, así que un dispositivo que ya
// no es el activo de la cuenta tampoco usa la IA. El rol sale de user_roles. Todo se pide con el
// token del alumno y su llave pública, nunca con la llave de servicio.
import { z } from 'zod';
import { RoleSchema, type Role } from '../../../src/data/schemas/common.ts';

export type Plan = 'free' | 'founder' | 'monthly' | 'annual';

export interface CloudUser {
  id: string;
  role: Role;
  plan: Plan;
}

/**
 * unauthenticated, el token no sirve o venció. other_device, la cuenta está activa en otro
 * dispositivo. unavailable, Supabase no contestó bien y no se sabe quién es
 */
export type AuthFailure = 'unauthenticated' | 'other_device' | 'unavailable';

export type AuthResult = { ok: true; user: CloudUser } | { ok: false; failure: AuthFailure };

export type Authenticate = (token: string) => Promise<AuthResult>;

const UserSchema = z.object({ id: z.uuid() });
const PlanSchema = z.object({ plan: z.enum(['free', 'founder', 'monthly', 'annual']) });
const RoleRowsSchema = z.array(z.object({ role: z.unknown() }));

/**
 * Los alumnos usan la IA solo con un plan de pago, como pide el Tutor y la generación de tarjetas.
 * Médicos y administradores la usan siempre, porque revisan contenido con ella
 */
export const canUseEngines = (user: CloudUser): boolean =>
  user.role !== 'student' || user.plan !== 'free';

/** Ver y cambiar la configuración y el gasto de la IA es del administrador y del dueño */
export const canAdminister = (user: CloudUser): boolean =>
  user.role === 'admin' || user.role === 'owner';

/** Saca el token de un encabezado Authorization. null si no viene con la forma Bearer */
export function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/.exec((header ?? '').trim());
  return match?.[1] ?? null;
}

interface Options {
  /** Dirección del proyecto, por ejemplo https://abc.supabase.co */
  url: string;
  /** Llave pública. La misma que usa el navegador */
  anonKey: string;
  fetchImpl?: typeof fetch;
  /** Cuánto se recuerda un token ya verificado, para no preguntar a Supabase en cada llamada */
  cacheMs?: number;
  now?: () => number;
}

const MAX_CACHED = 500;

export function createSupabaseAuthenticator(options: Options): Authenticate {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Date.now());
  const cacheMs = options.cacheMs ?? 30_000;
  const cache = new Map<string, { until: number; user: CloudUser }>();

  const call = (path: string, token: string, init: RequestInit = {}) =>
    fetchImpl(`${options.url}${path}`, {
      ...init,
      headers: {
        apikey: options.anonKey,
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(init.method === 'POST' ? { 'content-type': 'application/json' } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });

  async function verify(token: string): Promise<AuthResult> {
    try {
      const who = await call('/auth/v1/user', token);
      if (who.status === 401 || who.status === 403)
        return { ok: false, failure: 'unauthenticated' };
      if (!who.ok) return { ok: false, failure: 'unavailable' };
      const user = UserSchema.safeParse(await who.json());
      if (!user.success) return { ok: false, failure: 'unavailable' };
      const id = user.data.id;

      const [planResponse, roleResponse] = await Promise.all([
        call('/rest/v1/rpc/my_plan', token, { method: 'POST', body: '{}' }),
        call(`/rest/v1/user_roles?select=role&user_id=eq.${id}`, token),
      ]);
      if (!planResponse.ok) {
        const body = (await planResponse.json().catch(() => null)) as { code?: unknown } | null;
        // 42501 es la barrera del dispositivo único. La cuenta está activa en otro dispositivo
        if (planResponse.status === 403 || body?.code === '42501') {
          return { ok: false, failure: 'other_device' };
        }
        return {
          ok: false,
          failure: planResponse.status === 401 ? 'unauthenticated' : 'unavailable',
        };
      }
      const plan = PlanSchema.safeParse(await planResponse.json());
      if (!plan.success) return { ok: false, failure: 'unavailable' };

      // Sin fila o con un valor que no se reconoce, la cuenta es de alumno
      let role: Role = 'student';
      if (roleResponse.ok) {
        const rows = RoleRowsSchema.safeParse(await roleResponse.json());
        const parsed = RoleSchema.safeParse(rows.success ? rows.data[0]?.role : undefined);
        if (parsed.success) role = parsed.data;
      }
      return { ok: true, user: { id, role, plan: plan.data.plan } };
    } catch {
      return { ok: false, failure: 'unavailable' };
    }
  }

  return async (token) => {
    const cached = cache.get(token);
    if (cached && cached.until > now()) return { ok: true, user: cached.user };
    const result = await verify(token);
    if (result.ok) {
      if (cache.size >= MAX_CACHED) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(token, { until: now() + cacheMs, user: result.user });
    } else {
      cache.delete(token);
    }
    return result;
  };
}
