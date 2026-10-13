// Ajustes del repaso se abren con ?ajustes en la dirección de Repasar (B3 del plan del cambio). Así se
// pueden enlazar, sobreviven a recargar y los enlaces viejos a Configuración, Estudio y Pomodoro
// llegan directo al panel. ?ajustes=pomodoro lo abre en la parte del Pomodoro. Abrir deja un paso en
// el historial, así el botón de atrás del teléfono cierra el panel y no saca al alumno de Repasar.
import { useLocation, useNavigate, useSearchParams, type Location } from 'react-router';
import { screenPath } from '@/app/screens';

export const REVIEW_SETTINGS_PARAM = 'ajustes';

/** A qué parte del panel se va al abrirlo */
export type ReviewSettingsFocus = 'all' | 'pomodoro';

/** Qué parte pide la dirección, o null con el panel cerrado */
export function focusFromParam(value: string | null): ReviewSettingsFocus | null {
  if (value === null) return null;
  return value === 'pomodoro' ? 'pomodoro' : 'all';
}

const paramValue = (focus: ReviewSettingsFocus) => (focus === 'pomodoro' ? 'pomodoro' : '1');

/** Dirección de Repasar con el panel abierto */
export function reviewSettingsPath(focus: ReviewSettingsFocus = 'all'): string {
  return `${screenPath('review')}?${REVIEW_SETTINGS_PARAM}=${paramValue(focus)}`;
}

const OPENED_OVER = 'reviewSettingsOpenedOver';

/**
 * Marca del paso del historial que abrió el panel encima de otra dirección, como el botón de Repasar o
 * el enlace de Simular. Con ella, cerrar el panel es volver a esa dirección
 */
export const reviewSettingsLinkState = { [OPENED_OVER]: true } as const;

/** Si el panel se abrió encima de otra dirección y no llegó directo, con un enlace pegado */
export function openedOverAnotherPage(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as Record<string, unknown>)[OPENED_OVER] === true
  );
}

/**
 * Cerrar el panel es salir de la dirección con ?ajustes o cambiar de pantalla. Lo usa el aviso de
 * cambios sin guardar para preguntar antes de cerrar con Escape, la X, el fondo o el botón de atrás
 */
export function leavesReviewSettings(current: Location, next: Location): boolean {
  return (
    current.pathname !== next.pathname ||
    !new URLSearchParams(next.search).has(REVIEW_SETTINGS_PARAM)
  );
}

/** El panel abierto o cerrado según la dirección */
export function useReviewSettingsPanel() {
  const [params, setParams] = useSearchParams();
  const state: unknown = useLocation().state;
  const navigate = useNavigate();
  const focus = focusFromParam(params.get(REVIEW_SETTINGS_PARAM));
  const open = (next: ReviewSettingsFocus = 'all') => {
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        copy.set(REVIEW_SETTINGS_PARAM, paramValue(next));
        return copy;
      },
      { state: reviewSettingsLinkState },
    );
  };
  const close = () => {
    // Abierto encima de otra dirección, cerrar es volver atrás, así no quedan dos pasos iguales en el
    // historial. Si llegó directo, con un enlace o con una dirección vieja, solo se quita ?ajustes
    if (openedOverAnotherPage(state)) {
      void navigate(-1);
      return;
    }
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        copy.delete(REVIEW_SETTINGS_PARAM);
        return copy;
      },
      { replace: true },
    );
  };
  return { focus, open, close };
}
