// Borrar la copia en la nube (D-101, Fase E bloque E6). Las dos funciones del servidor hacen el
// trabajo y aquí solo se llaman y se traduce su error. Borrar mis datos deja la cuenta y el plan.
// Borrar la cuenta quita además el correo, los pagos de la plataforma y los referidos. Ninguna se
// puede deshacer, así que quien llama pide confirmación antes.
import type { SupabaseClient } from '@supabase/supabase-js';

export type EraseFailure =
  'not_active_device' | 'owner' | 'active_subscription' | 'no_session' | 'network' | 'unknown';

export type EraseResult = { ok: true } | { ok: false; reason: EraseFailure };

/** Una falla de borrado, para que la pantalla diga por qué sin repetir el código de la base */
export class CloudEraseError extends Error {
  readonly reason: EraseFailure;
  constructor(reason: EraseFailure) {
    super(reason);
    this.name = 'CloudEraseError';
    this.reason = reason;
  }
}

interface RpcError {
  code?: string | undefined;
  message?: string | undefined;
}

export function failureOf(error: RpcError): EraseFailure {
  if (error.code === '42501') {
    return /dueño/i.test(error.message ?? '') ? 'owner' : 'not_active_device';
  }
  // La base se niega a eliminar la cuenta mientras haya una suscripción con tarjeta activa (D-106)
  if (error.code === 'FR002') return 'active_subscription';
  if (error.code === '28000') return 'no_session';
  // Sin código es que la petición ni llegó al servidor
  if (!error.code) return 'network';
  return 'unknown';
}

async function call(
  cloud: Pick<SupabaseClient, 'rpc'>,
  name: 'delete_my_data' | 'delete_my_account',
): Promise<EraseResult> {
  try {
    const { error } = await cloud.rpc(name);
    return error ? { ok: false, reason: failureOf(error) } : { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Borra el estudio del alumno en la nube. La cuenta, el plan y los pagos se quedan */
export const eraseCloudData = (cloud: Pick<SupabaseClient, 'rpc'>) => call(cloud, 'delete_my_data');

/** Borra la cuenta completa. Después de esto el correo queda libre */
export const deleteCloudAccount = (cloud: Pick<SupabaseClient, 'rpc'>) =>
  call(cloud, 'delete_my_account');
