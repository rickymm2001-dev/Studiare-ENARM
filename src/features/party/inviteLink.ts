// Enlace de invitación a un grupo de Party (B7 del plan del cambio). Abre Party con el código en
// ?codigo= y el formulario de entrar ya escrito. Entrar sigue siendo un toque del alumno. El código
// se recuerda un día en este navegador, por si antes tiene que entrar con su correo, que lo deja en
// Inicio. Es una comodidad del dispositivo, no un dato del alumno, y nada se rompe sin almacenamiento.
import { screenPath } from '@/app/screens';
import { normalizeInviteCode } from '@/data/cloud/party';
import { isValidInviteCode } from '@/engines/party';

export const INVITE_PARAM = 'codigo';
export const INVITE_STORAGE_KEY = 'studiare.party.invite';
const REMEMBER_MS = 86_400_000;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** El enlace que se comparte. Respeta la ruta base de la app publicada */
export function inviteLink(code: string, origin: string, base: string): string {
  const url = new URL(screenPath('party').replace(/^\//, ''), new URL(base, origin));
  url.searchParams.set(INVITE_PARAM, code);
  return url.toString();
}

/** El almacenamiento local, o null si el navegador no lo deja usar */
export function inviteStore(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * El código del enlace con que se abrió la pantalla, que además se recuerda, o el que se recordó hace
 * menos de un día. null si no hay uno válido
 */
export function readInviteCode(search: string, store: Store | null, now: number): string | null {
  const fromLink = normalizeInviteCode(new URLSearchParams(search).get(INVITE_PARAM) ?? '');
  if (isValidInviteCode(fromLink)) {
    try {
      store?.setItem(INVITE_STORAGE_KEY, JSON.stringify({ code: fromLink, at: now }));
    } catch {
      // Sin almacenamiento el código igual se usa en esta visita
    }
    return fromLink;
  }
  try {
    const raw = store?.getItem(INVITE_STORAGE_KEY);
    if (!raw) return null;
    const saved: unknown = JSON.parse(raw);
    if (typeof saved !== 'object' || saved === null) return null;
    const { code, at } = saved as { code?: unknown; at?: unknown };
    if (typeof code !== 'string' || typeof at !== 'number' || now - at > REMEMBER_MS) return null;
    return isValidInviteCode(code) ? code : null;
  } catch {
    return null;
  }
}

/** Ya entró, así que el código deja de ofrecerse */
export function forgetInviteCode(store: Store | null): void {
  try {
    store?.removeItem(INVITE_STORAGE_KEY);
  } catch {
    // Sin almacenamiento no hay nada que olvidar
  }
}
