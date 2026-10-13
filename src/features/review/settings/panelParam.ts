// Ajustes del repaso se abren con ?ajustes en la dirección de Repasar (B3 del plan del cambio). Así se
// pueden enlazar, sobreviven a recargar y los enlaces viejos a Configuración, Estudio y Pomodoro
// llegan directo al panel. ?ajustes=pomodoro lo abre en la parte del Pomodoro.
import { useSearchParams } from 'react-router';
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

/** El panel abierto o cerrado según la dirección. Abrir y cerrar no deja pasos en el historial */
export function useReviewSettingsPanel() {
  const [params, setParams] = useSearchParams();
  const focus = focusFromParam(params.get(REVIEW_SETTINGS_PARAM));
  const open = (next: ReviewSettingsFocus = 'all') => {
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        copy.set(REVIEW_SETTINGS_PARAM, paramValue(next));
        return copy;
      },
      { replace: true },
    );
  };
  const close = () => {
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
