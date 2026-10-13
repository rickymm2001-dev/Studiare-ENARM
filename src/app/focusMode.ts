// Modo enfoque (respuesta 82 del plan del cambio, bloque B7). Un solo lugar para saber si el alumno
// pidió ocultar tablas, XP, nivel, racha y retos. Vive en la apariencia de este dispositivo.
import { usePreferences } from './preferences';

/** true cuando el alumno prendió el modo enfoque en Configuración, sección Apariencia */
export function useFocusMode(): boolean {
  return usePreferences((state) => state.appearance.focusMode);
}
