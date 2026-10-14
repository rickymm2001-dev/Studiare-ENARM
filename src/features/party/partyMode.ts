// Dónde vive Party para quien la abre (B7 del plan del cambio, respuesta 77). La base de demostración
// conserva la Party simulada del navegador, con sus compañeros simulados. Una cuenta real usa la nube
// cuando este navegador está conectado a ella. Sin nube, Party solo explica qué hace falta. Sin React.
import type { CloudState } from '@/app/cloudState';

export type PartyMode =
  /** Base de demostración. Grupos, compañeros y rivales simulados, marcados como tales */
  | 'demo'
  /** Cuenta real con la nube conectada */
  | 'cloud'
  /** La app todavía revisa la cuenta en la nube */
  | 'checking'
  /** La nube no respondió. El puente lo vuelve a intentar solo */
  | 'cloud_error'
  /** La nube está configurada, pero este navegador no está conectado a la cuenta */
  | 'signed_out'
  /** Esta versión no tiene nube. Todo vive en el navegador */
  | 'local_only';

export function partyModeOf(isDemo: boolean, cloud: CloudState['status']): PartyMode {
  if (isDemo) return 'demo';
  switch (cloud) {
    case 'linked':
      return 'cloud';
    case 'checking':
      return 'checking';
    case 'error':
      return 'cloud_error';
    case 'signed-out':
      return 'signed_out';
    case 'off':
      return 'local_only';
  }
}
