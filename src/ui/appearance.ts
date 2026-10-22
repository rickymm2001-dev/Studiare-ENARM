// Apariencia que elige el alumno (D-060, D-061). Fuente de lectura, tamaño del texto y movimiento.
// Se aplica como atributos en <html> y el CSS de src/index.css hace el resto. Los fondos con
// degradados, color o foto se quitaron en B2 del plan del cambio (comentario 10, D-121); un ajuste
// guardado con fondo se ignora al leerlo.
import { useEffect } from 'react';
import { z } from 'zod';

export const FONT_CHOICES = ['jakarta', 'atkinson', 'lexend', 'serif'] as const;
export const SIZE_CHOICES = ['sm', 'md', 'lg', 'xl'] as const;

export type FontChoice = (typeof FONT_CHOICES)[number];
export type SizeChoice = (typeof SIZE_CHOICES)[number];

export const AppearanceSchema = z.object({
  font: z.enum(FONT_CHOICES).catch('jakarta'),
  size: z.enum(SIZE_CHOICES).catch('md'),
  /** Transiciones y animaciones de la interfaz */
  animations: z.boolean().catch(true),
  /** Confeti al ganar. Depende también de animations */
  confetti: z.boolean().catch(true),
  /** Sonidos al ganar y del Pomodoro */
  sounds: z.boolean().catch(true),
  /**
   * Modo enfoque (respuesta 82 del plan del cambio). Oculta en toda la app las tablas, el XP, el nivel,
   * la racha y los retos, no solo durante la sesión. Empieza apagado
   */
  focusMode: z.boolean().catch(false),
});
export type Appearance = z.infer<typeof AppearanceSchema>;

export const DEFAULT_APPEARANCE: Appearance = AppearanceSchema.parse({});

/** Nombre CSS de cada fuente. Deben coincidir con las fuentes importadas en src/main.tsx */
export const FONT_FAMILIES: Record<FontChoice, string> = {
  jakarta: "'Plus Jakarta Sans Variable'",
  atkinson: "'Atkinson Hyperlegible'",
  lexend: "'Lexend Variable'",
  serif: "'Source Serif 4 Variable'",
};

/**
 * Los títulos van en serif. Quien elige Atkinson o Lexend, fuentes hechas para leer mejor, las pide
 * en todo el texto y los títulos las siguen (V4-B2)
 */
const HEADING_FOLLOWS_BODY: ReadonlySet<FontChoice> = new Set(['atkinson', 'lexend']);

/** Donde una versión anterior guardaba la foto del fondo personalizado. Se borra para liberar espacio */
const OLD_BACKGROUND_IMAGE_KEY = 'enarm.background-image.v1';

export function applyAppearance(root: HTMLElement, appearance: Appearance): void {
  root.dataset.font = appearance.font;
  root.dataset.size = appearance.size;
  root.dataset.motion = appearance.animations ? 'on' : 'off';
  root.style.setProperty('--enarm-font-body', FONT_FAMILIES[appearance.font]);
  root.style.setProperty(
    '--enarm-font-heading',
    HEADING_FOLLOWS_BODY.has(appearance.font)
      ? FONT_FAMILIES[appearance.font]
      : FONT_FAMILIES.serif,
  );
}

export function useApplyAppearance(appearance: Appearance): void {
  useEffect(() => {
    applyAppearance(document.documentElement, appearance);
  }, [appearance]);
  useEffect(() => {
    try {
      localStorage.removeItem(OLD_BACKGROUND_IMAGE_KEY);
    } catch {
      // Almacenamiento bloqueado. No pasa nada
    }
  }, []);
}

/** Si se pueden mostrar animaciones, según el ajuste y la preferencia del sistema */
export function motionAllowed(appearance: Pick<Appearance, 'animations'>): boolean {
  if (!appearance.animations) return false;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
