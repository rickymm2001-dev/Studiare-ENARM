// El identificador seudónimo de la analítica y su permiso en el servidor (B15, 1.3). El servidor crea, la
// primera vez, un uuid al azar que no se deriva del id de la cuenta y que vale igual en todos los
// dispositivos del alumno. Es el distinct_id de PostHog. Al retirar el permiso, el servidor descarta lo
// pendiente de la cola de dinero y cambia el identificador, así lo que se mida si el alumno vuelve a dar el
// permiso no se une con lo de antes (8.7). Aquí solo se llaman las dos funciones y se leen sus respuestas.
//
// Va en el JavaScript inicial, así que no importa zod ni engagementContracts.ts (que arma sus esquemas al
// cargar). Los nombres de las funciones y la forma de la respuesta se repiten aquí con satisfies, que
// revisa el nombre al compilar, y identity.test.ts compara la lectura con AnalyticsIdentitySchema
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnalyticsIdentity, ENGAGEMENT_RPC } from '@/data/cloud/engagementContracts';

const IDENTITY_RPC = 'analytics_identity' satisfies typeof ENGAGEMENT_RPC.analyticsIdentity;
const CONSENT_RPC = 'set_analytics_consent' satisfies typeof ENGAGEMENT_RPC.setAnalyticsConsent;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lo que contestó el servidor si tiene la forma buena. null si no. Una respuesta de más campos se acepta */
export function readIdentity(value: unknown): AnalyticsIdentity | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { analyticsId, consent } = value as Record<string, unknown>;
  if (typeof analyticsId !== 'string' || !UUID.test(analyticsId)) return null;
  return typeof consent === 'boolean' ? { analyticsId, consent } : null;
}

type Rpc = Pick<SupabaseClient, 'rpc'>;

/**
 * Pide el identificador, y el servidor lo crea si es la primera vez. null si no contestó, si la función no
 * existe todavía (la migración sin aplicar) o si la respuesta no tiene la forma. Nunca lanza
 */
export async function fetchAnalyticsIdentity(cloud: Rpc): Promise<AnalyticsIdentity | null> {
  try {
    const reply = await cloud.rpc(IDENTITY_RPC);
    return reply.error ? null : readIdentity(reply.data);
  } catch {
    return null;
  }
}

/**
 * Le dice al servidor que el alumno dio o retiró el permiso Medición de uso, para los eventos de dinero. Al
 * dar el permiso devuelve el identificador. Al retirarlo, el servidor ya cambió el identificador por otro.
 * null si no se pudo, y quien llama lo reintenta. Nunca lanza
 */
export async function sendAnalyticsConsent(
  cloud: Rpc,
  granted: boolean,
): Promise<AnalyticsIdentity | null> {
  try {
    const reply = await cloud.rpc(CONSENT_RPC, { p_granted: granted });
    return reply.error ? null : readIdentity(reply.data);
  } catch {
    return null;
  }
}
