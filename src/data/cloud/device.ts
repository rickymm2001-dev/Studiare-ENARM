// Un solo dispositivo activo por cuenta (acuerdo del equipo del 2026-10-07). Gana el último
// dispositivo en entrar. Cada navegador tiene un id aleatorio, reclama la cuenta con claim_device
// y revisa su fila de device_sessions. Si la fila apunta a otro id, el alumno ve un aviso y sale.
// Un fallo de red nunca saca al alumno. Solo un veredicto claro del servidor lo hace, que otro
// dispositivo ganó (other) o que ya cambió demasiadas veces de dispositivo en un día (limit).
//
// La barrera del servidor (migración 20261008000001) amarra la cuenta a la sesión del token y no solo
// al dispositivo. Por eso volver a entrar en este navegador, que trae una sesión nueva, vuelve a
// reclamar. Sin esa migración aplicada nada de esto estorba, porque claim_device sigue siendo el mismo.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const DEVICE_ID_STORAGE_KEY = 'enarm.device-id.v1';
/** Cuenta que este navegador ya reclamó. Separa entrar de nuevo de solo volver a abrir la app */
export const DEVICE_CLAIM_STORAGE_KEY = 'enarm.device-claim.v1';
/** Sesión de Supabase con la que este navegador reclamó. Una sesión nueva es una entrada nueva */
export const DEVICE_SESSION_STORAGE_KEY = 'enarm.device-session.v1';
/** Código de error que lanza claim_device al pasar el límite de cambios de dispositivo */
export const DEVICE_LIMIT_ERROR_CODE = 'DV001';
/** Cuánto se espera, como máximo, a que el servidor deje asentado un reclamo rechazado */
const REPORT_TIMEOUT_MS = 3_000;
/** Largo máximo del id y de la etiqueta. El servidor rechaza lo que pase de aquí */
export const DEVICE_TEXT_MAX = 80;

type DeviceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Fila de device_sessions que le interesa al cliente */
export const DeviceRowSchema = z.object({ device_id: z.string() });
export type DeviceRow = z.infer<typeof DeviceRowSchema>;

/** mine, este navegador es el activo. other, ganó otro. unclaimed, nadie ha reclamado la cuenta */
export type DeviceVerdict = 'mine' | 'other' | 'unclaimed';

/**
 * failed, no se pudo reclamar (red, migración sin aplicar, error del servidor). limit, el servidor
 * rechazó el cambio porque pasó del tope. retryAt es la hora en que podrá volver a intentarlo, en
 * milisegundos, o null si el servidor no la dio de forma que se entienda
 */
export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: 'failed' }
  | { ok: false; reason: 'limit'; retryAt: number | null };
export type CheckResult = { ok: true; verdict: DeviceVerdict } | { ok: false; reason: 'failed' };
/**
 * Resultado de ponerse al día con el servidor. claimed, este navegador acaba de ganar la cuenta.
 * mine, ya la tenía. other, la ganó otro. failed, no se pudo saber (red, migración sin aplicar).
 * limit, el servidor no dejó cambiar de dispositivo por el tope de cambios
 */
export type DeviceOutcome =
  { status: 'claimed' | 'mine' | 'other' | 'failed' } | { status: 'limit'; retryAt: number | null };

function safeLocalStorage(): DeviceStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // El acceso mismo puede lanzar con las cookies y datos de sitios bloqueados
    return null;
  }
}

// Respaldo mientras el navegador no deja guardar. Dura lo que dure la página
let memoryDeviceId: string | undefined;
let memoryClaim: string | null = null;
let memorySession: string | null = null;

function isValidDeviceText(value: string): boolean {
  return value.trim() !== '' && value.length <= DEVICE_TEXT_MAX;
}

function randomDeviceId(): string {
  // randomUUID solo existe en páginas seguras (https y localhost). getRandomValues sirve en todas
  const webCrypto = globalThis.crypto as Crypto | undefined;
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof webCrypto?.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Id de este navegador. Se crea una vez y se guarda. Sin almacenamiento usa un id en memoria,
 * igual durante toda la página, así la revisión no se contradice sola
 */
export function getDeviceId(storage: DeviceStorage | null = safeLocalStorage()): string {
  try {
    const stored = storage?.getItem(DEVICE_ID_STORAGE_KEY);
    if (stored && isValidDeviceText(stored)) {
      memoryDeviceId = stored;
      return stored;
    }
  } catch {
    // Lectura bloqueada. Se sigue con el id en memoria
  }
  memoryDeviceId ??= randomDeviceId();
  try {
    storage?.setItem(DEVICE_ID_STORAGE_KEY, memoryDeviceId);
  } catch {
    // Ventana privada o almacenamiento lleno. El id dura solo esta página
  }
  return memoryDeviceId;
}

/** Navegador y sistema en pocas palabras a partir del user agent, como Chrome en Windows */
export function describeUserAgent(userAgent: string): string {
  const browser = /Edg(?:e|A|iOS)?\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : userAgent.includes('SamsungBrowser/')
        ? 'Samsung Internet'
        : /Firefox\/|FxiOS\//.test(userAgent)
          ? 'Firefox'
          : /Chrome\/|CriOS\//.test(userAgent)
            ? 'Chrome'
            : userAgent.includes('Safari/')
              ? 'Safari'
              : 'Navegador';
  // Android y iOS van antes que Linux y macOS porque sus user agents también los mencionan
  const system = userAgent.includes('Windows')
    ? 'Windows'
    : userAgent.includes('Android')
      ? 'Android'
      : /iPhone|iPad|iPod/.test(userAgent)
        ? 'iOS'
        : userAgent.includes('CrOS')
          ? 'ChromeOS'
          : /Macintosh|Mac OS X/.test(userAgent)
            ? 'macOS'
            : /Linux|X11/.test(userAgent)
              ? 'Linux'
              : null;
  return system ? `${browser} en ${system}` : browser;
}

/** Etiqueta corta y legible de este dispositivo. Sin versión, modelo ni datos personales */
export function deviceLabel(
  userAgent: string | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.userAgent,
): string {
  return describeUserAgent(userAgent ?? '').slice(0, DEVICE_TEXT_MAX);
}

/**
 * Qué dice la fila del servidor sobre este navegador. Sin fila nadie ha reclamado la cuenta.
 * Un id vacío en este navegador nunca cuenta como other, para no sacar a nadie por un error
 */
export function deviceVerdict(row: DeviceRow | null | undefined, deviceId: string): DeviceVerdict {
  if (!row || row.device_id === '' || deviceId === '') return 'unclaimed';
  return row.device_id === deviceId ? 'mine' : 'other';
}

/** Hora de reintento que manda el servidor en el detalle del error, en formato ISO 8601 */
function parseRetryAt(details: unknown): number | null {
  if (typeof details !== 'string') return null;
  const parsed = Date.parse(details);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Solo el código propio del límite cuenta. Cualquier otro error, o uno sin código, es un fallo */
function isLimitError(error: unknown): error is { code: string; details?: unknown } {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === DEVICE_LIMIT_ERROR_CODE
  );
}

/**
 * Pide al servidor que deje asentado el reclamo rechazado. claim_device no puede hacerlo, porque su
 * error deshace sus propias escrituras. Es de mejor esfuerzo. Si falla, el alumno ve su aviso igual
 */
async function reportRejectedClaim(
  cloud: SupabaseClient,
  deviceId: string,
  label: string,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const report = Promise.resolve(
      cloud.rpc('log_rejected_claim', { p_device_id: deviceId, p_label: label }),
    ).catch(() => undefined);
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, REPORT_TIMEOUT_MS);
    });
    await Promise.race([report, timeout]);
  } catch {
    // Es solo para la bitácora
  } finally {
    clearTimeout(timer);
  }
}

/** Reclama la cuenta para este dispositivo y reemplaza al anterior */
export async function claimDevice(
  cloud: SupabaseClient,
  deviceId: string,
  label: string,
): Promise<ClaimResult> {
  if (!isValidDeviceText(deviceId)) return { ok: false, reason: 'failed' };
  const shortLabel = label.slice(0, DEVICE_TEXT_MAX);
  try {
    const { error } = await cloud.rpc('claim_device', {
      p_device_id: deviceId,
      p_label: shortLabel,
    });
    if (!error) return { ok: true };
    if (!isLimitError(error)) return { ok: false, reason: 'failed' };
    await reportRejectedClaim(cloud, deviceId, shortLabel);
    return { ok: false, reason: 'limit', retryAt: parseRetryAt(error.details) };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** Lee la fila propia y dice si este dispositivo sigue siendo el activo */
export async function checkDevice(
  cloud: SupabaseClient,
  authId: string,
  deviceId: string,
): Promise<CheckResult> {
  try {
    const { data, error } = await cloud
      .from('device_sessions')
      .select('device_id')
      .eq('user_id', authId)
      .maybeSingle();
    if (error) return { ok: false, reason: 'failed' };
    const parsed = DeviceRowSchema.nullable().safeParse(data);
    // Una fila que no se entiende no es motivo para sacar al alumno
    if (!parsed.success) return { ok: false, reason: 'failed' };
    return { ok: true, verdict: deviceVerdict(parsed.data, deviceId) };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** true si este navegador ya reclamó esta cuenta */
export function hasClaimedDevice(
  authId: string,
  storage: DeviceStorage | null = safeLocalStorage(),
): boolean {
  try {
    const stored = storage?.getItem(DEVICE_CLAIM_STORAGE_KEY);
    if (stored !== undefined && stored !== null) return stored === authId;
  } catch {
    // Lectura bloqueada. Se usa la marca en memoria
  }
  return memoryClaim === authId;
}

export function rememberDeviceClaim(
  authId: string,
  storage: DeviceStorage | null = safeLocalStorage(),
): void {
  memoryClaim = authId;
  try {
    storage?.setItem(DEVICE_CLAIM_STORAGE_KEY, authId);
  } catch {
    // Solo dura esta página
  }
}

/** Se llama al quedar sin sesión, para que volver a entrar sí reclame la cuenta */
export function forgetDeviceClaim(storage: DeviceStorage | null = safeLocalStorage()): void {
  memoryClaim = null;
  memorySession = null;
  try {
    storage?.removeItem(DEVICE_CLAIM_STORAGE_KEY);
    storage?.removeItem(DEVICE_SESSION_STORAGE_KEY);
  } catch {
    // Nada que borrar si el almacenamiento está bloqueado
  }
}

const TokenClaimsSchema = z.object({ session_id: z.string().min(1).max(80) });

/**
 * session_id del token de acceso de Supabase, o null si el token no lo trae o no se entiende.
 * Solo lee el token propio para saber con qué sesión se reclamó. No lo verifica, eso lo hace el servidor
 */
export function sessionIdFromToken(token: string | null | undefined): string | null {
  try {
    const payload = token?.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    const parsed = TokenClaimsSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data.session_id : null;
  } catch {
    return null;
  }
}

async function currentSessionId(cloud: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await cloud.auth.getSession();
    return sessionIdFromToken(data.session?.access_token);
  } catch {
    return null;
  }
}

/**
 * Sesión con la que este navegador reclamó la cuenta. null si no se sabe, como en un navegador
 * que reclamó antes de la barrera del servidor
 */
export function claimedSessionId(
  storage: DeviceStorage | null = safeLocalStorage(),
): string | null {
  try {
    const stored = storage?.getItem(DEVICE_SESSION_STORAGE_KEY);
    if (stored !== undefined && stored !== null) return stored === '' ? null : stored;
  } catch {
    // Lectura bloqueada. Se usa la marca en memoria
  }
  return memorySession;
}

export function rememberClaimedSession(
  sessionId: string | null,
  storage: DeviceStorage | null = safeLocalStorage(),
): void {
  memorySession = sessionId;
  try {
    if (sessionId) storage?.setItem(DEVICE_SESSION_STORAGE_KEY, sessionId);
    else storage?.removeItem(DEVICE_SESSION_STORAGE_KEY);
  } catch {
    // Solo dura esta página
  }
}

/**
 * Pone este navegador al día con el servidor. Supabase avisa SIGNED_IN cada vez que la pestaña
 * vuelve a enfocarse y al abrir la app con una sesión guardada, así que reclamar en cada aviso
 * dejaría que un dispositivo viejo le quite la cuenta al nuevo. Solo se reclama al entrar, o sea
 * cuando este navegador aún no reclamó esta cuenta o entró con una sesión nueva. Después solo se revisa.
 *
 * La barrera del servidor amarra la cuenta a la sesión del token. Si este navegador es el activo pero
 * reclamó antes de la barrera, o con otra sesión, confirma el dispositivo para que el servidor guarde
 * la sesión de ahora. Confirmar el mismo dispositivo no gasta el límite de cambios
 */
export async function reconcileDevice(
  cloud: SupabaseClient,
  authId: string,
): Promise<DeviceOutcome> {
  const deviceId = getDeviceId();
  const sessionId = await currentSessionId(cloud);
  const claim = async (): Promise<DeviceOutcome> => {
    const result = await claimDevice(cloud, deviceId, deviceLabel());
    if (!result.ok) {
      return result.reason === 'limit'
        ? { status: 'limit', retryAt: result.retryAt }
        : { status: 'failed' };
    }
    rememberDeviceClaim(authId);
    rememberClaimedSession(sessionId);
    return { status: 'claimed' };
  };
  if (!hasClaimedDevice(authId)) return claim();
  const check = await checkDevice(cloud, authId, deviceId);
  if (!check.ok) return { status: 'failed' };
  // Sin fila otra vez, por ejemplo si Ricardo la borró para liberar la cuenta. El primero que revisa gana
  if (check.verdict === 'unclaimed') return claim();
  const stored = claimedSessionId();
  if (check.verdict === 'other') {
    // Entró de nuevo en este navegador con una sesión nueva. Es una entrada, así que reclama
    const enteredAgain = sessionId !== null && stored !== null && stored !== sessionId;
    return enteredAgain ? claim() : { status: 'other' };
  }
  // Es el activo. Si el servidor aún no tiene su sesión, la guarda. Si no puede, lo intenta en la siguiente revisión
  if (sessionId !== null && stored !== sessionId) await claim();
  return { status: 'mine' };
}
