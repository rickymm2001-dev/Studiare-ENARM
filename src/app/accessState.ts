// Lo que falta para entrar de lleno (B9 del plan del cambio). Lo pone CloudBridge y lo leen el marco de
// la app y la bienvenida. El segundo factor del equipo, el registro que una cuenta de Google todavía no
// completa y el aviso de por qué Google no dejó entrar. No guarda nada en el navegador.
import { create } from 'zustand';
import type { OAuthRedirectError } from '@/data/cloud/oauth';

/**
 * Segundo factor de esta sesión. not-required para el alumno o con la bandera apagada. checking
 * mientras se pregunta a Supabase. enroll y challenge piden la pantalla del código. verified ya tiene
 * aal2. unknown no se pudo saber y no se bloquea, porque la protección real está en el servidor
 */
export type MfaGateState =
  | { status: 'not-required' }
  | { status: 'checking' }
  | { status: 'enroll' }
  | { status: 'challenge'; factorId: string }
  | { status: 'verified' }
  | { status: 'unknown' };

interface AccessStore {
  mfa: MfaGateState;
  /** Perfil local que debe completar el registro, una cuenta de Google que no pasó por Crear cuenta */
  signupFor: string | null;
  /** Por qué Google no dejó entrar, para el aviso del marco de la app */
  oauthError: OAuthRedirectError | null;
  setMfa: (mfa: MfaGateState) => void;
  setSignupFor: (userId: string | null) => void;
  setOAuthError: (error: OAuthRedirectError | null) => void;
  /** Al salir de la cuenta no queda nada pendiente, salvo el aviso de Google */
  resetSession: () => void;
}

export const useAccess = create<AccessStore>()((set) => ({
  mfa: { status: 'not-required' },
  signupFor: null,
  oauthError: null,
  setMfa: (mfa) => {
    set({ mfa });
  },
  setSignupFor: (signupFor) => {
    set({ signupFor });
  },
  setOAuthError: (oauthError) => {
    set({ oauthError });
  },
  resetSession: () => {
    set({ mfa: { status: 'not-required' }, signupFor: null });
  },
}));

/** Si la pantalla del segundo factor debe tapar la app */
export const mfaBlocks = (mfa: MfaGateState) =>
  mfa.status === 'checking' || mfa.status === 'enroll' || mfa.status === 'challenge';
