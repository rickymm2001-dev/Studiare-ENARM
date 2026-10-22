// Cuándo aparece el recorrido guiado (B15, 4.1 y 4.6 del plan de B15). Las decisiones son funciones puras
// sobre lo que recuerda el navegador (steps.ts), para probarlas sin pantalla. Va en el JavaScript inicial
// junto con TourLauncher, así que no importa nada del recorrido en sí.
import { isFeatureEnabled } from '@/config/featureFlags';
import type { Role } from '@/data/schemas/common';
import { readTourState, withHandled, writeTourState, type TourStoredState } from './steps';

/** Quién ve el recorrido, solo o desde Configuración. Los alumnos. El menú del médico es otro (8.18) */
export const tourIsForRole = (role: Role): boolean => role === 'student';

/** Si el recorrido existe para este rol con la configuración de hoy. Sin la bandera guidedTour no hay nada */
export function tourAvailable(
  role: Role,
  enabled: boolean = isFeatureEnabled('guidedTour'),
): boolean {
  return enabled && tourIsForRole(role);
}

/**
 * Si el recorrido debe empezar solo para este alumno en este navegador. Solo si lo dejó marcado el
 * registro (markTourPending), no lo ha terminado ni saltado aquí y autoOffer no lo apagó. Las cuentas que
 * ya existían nunca están marcadas, así que lo ven desde Configuración y no solas (8.15)
 */
export function shouldAutoStart(state: TourStoredState, userId: string): boolean {
  return (
    state.autoOffer && (state.pending?.includes(userId) ?? false) && !state.handled.includes(userId)
  );
}

/** Deja al alumno como visto en este navegador, haya terminado el recorrido o lo haya saltado */
export function markTourHandled(userId: string): void {
  writeTourState(withHandled(readTourState(), userId));
}
