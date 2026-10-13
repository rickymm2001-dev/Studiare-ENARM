// Secciones de Configuración, una sola página (B3 del plan del cambio, comentario 5). Cada sección
// tiene su ancla en español, como las rutas (D-035). Los enlaces viejos con ?seccion= siguen
// funcionando. Los de Cuenta, Apariencia y Privacidad llevan a su sección, el de Estudio a Ajustes del
// repaso, en Repasar, donde vive ahora, y el de Pomodoro a la parte del Pomodoro de ese panel.
import { screenPath } from '@/app/screens';
import { reviewSettingsPath, type ReviewSettingsFocus } from '../review/settings/panelParam';

export const SETTINGS_SECTIONS = ['perfil', 'apariencia', 'privacidad'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** Las pestañas de antes y la sección donde quedó lo que tenían */
const LEGACY_SECTIONS: ReadonlyMap<string, SettingsSection> = new Map([
  ['account', 'perfil'],
  ['appearance', 'apariencia'],
  ['privacy', 'privacidad'],
]);

/** Pestañas de antes cuyo contenido pasó a Ajustes del repaso, con la parte del panel que abren */
const MOVED_TO_REVIEW: ReadonlyMap<string, ReviewSettingsFocus> = new Map([
  ['study', 'all'],
  ['pomodoro', 'pomodoro'],
]);

/** Dirección de Configuración, con el ancla de una sección si se pide */
export function settingsPath(section?: SettingsSection): string {
  return section ? `${screenPath('settings')}#${section}` : screenPath('settings');
}

/** Adónde manda un enlace viejo con ?seccion=, o null si se queda en Configuración */
export function legacyRedirect(seccion: string | null): string | null {
  const focus = seccion === null ? undefined : MOVED_TO_REVIEW.get(seccion);
  return focus ? reviewSettingsPath(focus) : null;
}

/** La sección que pide la dirección. Manda el ancla y, sin ella, el ?seccion= de antes */
export function requestedSection(hash: string, seccion: string | null): SettingsSection | null {
  const anchor = decodeURIComponent(hash.replace(/^#/, ''));
  if ((SETTINGS_SECTIONS as readonly string[]).includes(anchor)) return anchor as SettingsSection;
  return seccion === null ? null : (LEGACY_SECTIONS.get(seccion) ?? null);
}
