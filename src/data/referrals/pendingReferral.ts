// Código del enlace de invitación (respuesta 77 y 4.3 del plan del cambio, B7). Quien abre el enlace de
// un compañero, /bienvenida?ref=CODIGO, llega a la bienvenida, que guarda el código en este navegador.
// Cuando su cuenta en la nube queda conectada el código se canjea solo con redeem_referral_code y se
// borra. Si la red falla se queda para el siguiente intento. El mes gratis lo sigue dando el servidor
// con el primer cobro del referido, así que aquí nunca se otorga nada. Solo viaja el código, que es
// seudónimo, nunca un nombre ni un correo.
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeReferralCode, redeemReferralCode, type RedeemResult } from './referrals';

/** El parámetro del enlace de invitación */
export const REFERRAL_PARAM = 'ref';
export const PENDING_REFERRAL_KEY = 'enarm.referral-pending.v1';

const CODE = /^[A-Z0-9]{8}$/;

type CodeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): CodeStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // El navegador puede negar el acceso, por ejemplo en una ventana privada
    return null;
  }
}

/** El código de la dirección, ya limpio. null si no viene o no tiene la forma de un código */
export function referralCodeFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get(REFERRAL_PARAM);
  if (raw === null) return null;
  const code = normalizeReferralCode(raw);
  return CODE.test(code) ? code : null;
}

export function storePendingReferral(code: string, storage = browserStorage()): void {
  try {
    if (CODE.test(code)) storage?.setItem(PENDING_REFERRAL_KEY, code);
  } catch {
    // Almacenamiento lleno o bloqueado. El alumno todavía puede escribir el código en Party
  }
}

/** El código guardado. null si no hay o si no tiene la forma de un código */
export function readPendingReferral(storage = browserStorage()): string | null {
  try {
    const code = storage?.getItem(PENDING_REFERRAL_KEY) ?? null;
    return code !== null && CODE.test(code) ? code : null;
  } catch {
    return null;
  }
}

export function clearPendingReferral(storage = browserStorage()): void {
  try {
    storage?.removeItem(PENDING_REFERRAL_KEY);
  } catch {
    // Nada que borrar
  }
}

// Un solo canje a la vez. La nube vuelve a sincronizar varias veces seguidas al entrar
let inFlight: Promise<RedeemResult | null> | null = null;

async function redeemOnce(
  cloud: SupabaseClient,
  storage: CodeStorage | null,
): Promise<RedeemResult | null> {
  const code = readPendingReferral(storage);
  if (!code) return null;
  const result = await redeemReferralCode(cloud, code);
  if (result !== 'failed') clearPendingReferral(storage);
  return result;
}

/**
 * Canjea el código guardado, si hay. Con cualquier respuesta del servidor lo borra, también si lo
 * rechaza, porque repetirlo daría lo mismo. Solo lo deja si no hubo respuesta, para el siguiente
 * intento. Devuelve lo que contestó el servidor, o null si no había código
 */
export function redeemPendingReferral(
  cloud: SupabaseClient,
  storage = browserStorage(),
): Promise<RedeemResult | null> {
  inFlight ??= redeemOnce(cloud, storage).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
