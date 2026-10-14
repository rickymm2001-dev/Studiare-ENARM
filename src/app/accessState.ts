// Lo que falta para entrar de lleno (B9 del plan del cambio). Lo pone CloudBridge y lo leen el marco de
// la app y la bienvenida. El segundo factor del equipo, el registro que un perfil que nació sin
// formulario todavía no completa y el aviso de por qué no se pudo entrar con Google o con el enlace del
// correo. No guarda nada en el navegador.
import { create } from 'zustand';
import type { OAuthRedirectError } from '@/data/cloud/oauth';

/**
 * Segundo factor de esta sesión. not-required para el alumno o con la bandera apagada. checking
 * mientras se pregunta a Supabase. enroll y challenge piden la pantalla del código. verified ya tiene
 * aal2. unknown no se pudo saber, o Supabase tardó demasiado, y no se bloquea, porque la protección
 * real está en el servidor
 */
export type MfaGateState =
  | { status: 'not-required' }
  | { status: 'checking' }
  | { status: 'enroll' }
  | { status: 'challenge'; factorId: string }
  | { status: 'verified' }
  | { status: 'unknown' };

/**
 * Registro de un perfil que nació sin formulario, por ejemplo al entrar por primera vez desde Ya tengo
 * cuenta con el correo o con Google. none, no falta nada. checking, se pregunta a la nube si la cuenta
 * ya lo completó en otro lado. required, pide Completa tu registro. unknown, la nube no se pudo leer y
 * no se deja pasar hasta volver a intentarlo
 */
export type SignupGateState =
  | { status: 'none' }
  | { status: 'checking'; userId: string }
  | { status: 'required'; userId: string }
  | { status: 'unknown'; userId: string };

interface AccessStore {
  mfa: MfaGateState;
  signup: SignupGateState;
  /** Por qué Supabase regresó con un error de Google o del enlace del correo, para el aviso global */
  oauthError: OAuthRedirectError | null;
  /**
   * Vuelve a revisar con la nube, como al entrar. Lo pone CloudBridge mientras hay una cuenta conectada
   * y lo usan Intentar de nuevo y Completa tu registro al guardar
   */
  recheck: (() => void) | null;
  setMfa: (mfa: MfaGateState) => void;
  setSignup: (signup: SignupGateState) => void;
  setOAuthError: (error: OAuthRedirectError | null) => void;
  setRecheck: (recheck: (() => void) | null) => void;
  /** Completa tu registro ya guardó. Deja entrar y pide al puente que suba la cuenta y sincronice */
  finishSignup: () => void;
  /** Al salir de la cuenta no queda nada pendiente, salvo el aviso de Google o del enlace */
  resetSession: () => void;
}

export const NO_SIGNUP_PENDING: SignupGateState = { status: 'none' };

export const useAccess = create<AccessStore>()((set, get) => ({
  mfa: { status: 'not-required' },
  signup: NO_SIGNUP_PENDING,
  oauthError: null,
  recheck: null,
  setMfa: (mfa) => {
    set({ mfa });
  },
  setSignup: (signup) => {
    set({ signup });
  },
  setOAuthError: (oauthError) => {
    set({ oauthError });
  },
  setRecheck: (recheck) => {
    set({ recheck });
  },
  finishSignup: () => {
    set({ signup: NO_SIGNUP_PENDING });
    get().recheck?.();
  },
  resetSession: () => {
    set({ mfa: { status: 'not-required' }, signup: NO_SIGNUP_PENDING });
  },
}));

/** Si la pantalla del segundo factor debe tapar la app */
export const mfaBlocks = (mfa: MfaGateState) =>
  mfa.status === 'checking' || mfa.status === 'enroll' || mfa.status === 'challenge';
