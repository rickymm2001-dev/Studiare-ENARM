// Las llaves de Supabase que usan las funciones (B17, 4.2 del plan). Supabase anuncia que las llaves anon y
// service_role se retiran a fin de 2026 y que las reemplazan sb_publishable_ y sb_secret_. Las dos formas
// conviven, así que se cambia sin cortes. Este archivo es el único que sabe de la diferencia
//   - Qué llave toma cada función. Las nuevas si Supabase las pone (SUPABASE_SECRET_KEYS y
//     SUPABASE_PUBLISHABLE_KEYS, un JSON con la llave default) y, si no, las de siempre (SUPABASE_SERVICE_ROLE_KEY
//     y SUPABASE_ANON_KEY). Mientras Ricardo no cree las nuevas, todo sigue con las viejas
//   - Cómo se manda. Una llave sb_secret_ no es un JWT. Va solo en apikey y nunca como authorization Bearer, que
//     la plataforma intenta leer como JWT y rechaza. La llave vieja va en las dos, como hasta hoy
// Nunca imprime ni devuelve un valor en un mensaje. Sin Deno, para probarlo con Vitest.

/** Los cuatro nombres de donde salen las llaves. Los index.ts y runtime.ts los leen con Deno.env.get */
export const KEY_ENV_NAMES = [
  'SUPABASE_SECRET_KEYS',
  'SUPABASE_PUBLISHABLE_KEYS',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
] as const;

export type KeySource = Readonly<
  Partial<Record<(typeof KEY_ENV_NAMES)[number], string | undefined>>
>;

const SECRET_PREFIX = 'sb_secret_';
const PUBLISHABLE_PREFIX = 'sb_publishable_';
/** La forma de una llave nueva. Letras, números, guion y guion bajo después del prefijo */
const NEW_KEY_TAIL = /^[A-Za-z0-9_-]{16,256}$/;

/** Qué puede hacer una llave. service salta las reglas de acceso a las filas (RLS), public no */
export type KeyLevel = 'service' | 'public' | 'unknown';

/** El rol que dice un JWT de las llaves anteriores de Supabase, o null si no es un JWT */
function jwtRole(key: string): string | null {
  const parts = key.split('.');
  const payload = parts[1];
  if (parts.length !== 3 || !payload) return null;
  try {
    const text = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const role = (JSON.parse(text) as { role?: unknown }).role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}

/** Si una llave es de servicio o pública, de las dos formas. unknown si no es de ninguna que se reconozca */
export function keyLevel(key: string): KeyLevel {
  if (key.startsWith(SECRET_PREFIX)) return 'service';
  if (key.startsWith(PUBLISHABLE_PREFIX)) return 'public';
  const role = jwtRole(key);
  if (role === 'service_role') return 'service';
  if (role === 'anon') return 'public';
  return 'unknown';
}

/**
 * Una llave de las nuevas, que no es un JWT. Va en apikey y no se manda como authorization Bearer. Cualquier
 * texto que empiece con sb_ cuenta, también uno mal formado, porque lo peor que puede pasar con él es que la
 * plataforma lo rechace en apikey, y no que se mande como Bearer a un lugar que lo lee como JWT
 */
export const isOpaqueKey = (key: string): boolean => key.startsWith('sb_');

/**
 * Los encabezados para llamar a Supabase con una llave. La nueva (sb_secret_) solo en apikey. La anterior
 * (service_role, un JWT) en apikey y en authorization, que es como PostgREST y Auth la reconocen. Los cinco
 * lugares de las funciones que llaman con la llave de servicio lo usan, y ninguno arma un Bearer por su cuenta
 */
export function serviceHeaders(key: string): Record<string, string> {
  return isOpaqueKey(key) ? { apikey: key } : { apikey: key, authorization: `Bearer ${key}` };
}

/**
 * La llave default de un JSON como {"default":"sb_secret_..."}, que es como Supabase pone SUPABASE_SECRET_KEYS y
 * SUPABASE_PUBLISHABLE_KEYS. Sin default toma la primera que tenga la forma. null si no hay JSON, no es un
 * objeto o ninguna tiene la forma que toca, y entonces se usa la llave de siempre
 */
function newKeyFrom(raw: string | undefined, prefix: string): string | null {
  const text = (raw ?? '').trim();
  if (text === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const valid = Object.entries(parsed).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === 'string' &&
      entry[1].startsWith(prefix) &&
      NEW_KEY_TAIL.test(entry[1].slice(prefix.length)),
  );
  return (valid.find(([name]) => name === 'default') ?? valid[0])?.[1] ?? null;
}

export interface ResolvedKeys {
  /** La llave pública, o '' si falta */
  anonKey: string;
  /** La llave de servicio, o '' si falta */
  serviceKey: string;
  /** De dónde salió cada una. Sirve para el registro y las pruebas, nunca lleva el valor */
  anonFrom: 'new' | 'legacy' | 'missing';
  serviceFrom: 'new' | 'legacy' | 'missing';
}

/**
 * Elige la llave pública y la de servicio de una función. Cada una por su lado, así una función puede tener
 * la nueva de servicio y la pública de siempre mientras Ricardo termina el cambio. Las nuevas ganan sobre las
 * viejas apenas Supabase las pone, y no se pierde nada porque funcionan igual (4.2 del plan)
 */
export function resolveSupabaseKeys(source: KeySource): ResolvedKeys {
  const newSecret = newKeyFrom(source.SUPABASE_SECRET_KEYS, SECRET_PREFIX);
  const newPublic = newKeyFrom(source.SUPABASE_PUBLISHABLE_KEYS, PUBLISHABLE_PREFIX);
  const legacySecret = (source.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const legacyPublic = (source.SUPABASE_ANON_KEY ?? '').trim();
  const pick = (
    fresh: string | null,
    legacy: string,
  ): { key: string; from: ResolvedKeys['anonFrom'] } => {
    if (fresh !== null) return { key: fresh, from: 'new' };
    return legacy === '' ? { key: '', from: 'missing' } : { key: legacy, from: 'legacy' };
  };
  const anon = pick(newPublic, legacyPublic);
  const service = pick(newSecret, legacySecret);
  return {
    anonKey: anon.key,
    serviceKey: service.key,
    anonFrom: anon.from,
    serviceFrom: service.from,
  };
}
