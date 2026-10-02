// Apariencia que elige el alumno (D-060, D-061). Fuente de lectura, tamaño del texto, fondo y
// movimiento. Se aplica como atributos en <html> y el CSS de src/index.css hace el resto.
import { useEffect } from 'react';
import { z } from 'zod';
import { loadBackgroundImage } from './backgroundImage';

export const FONT_CHOICES = ['jakarta', 'atkinson', 'lexend', 'serif'] as const;
export const SIZE_CHOICES = ['sm', 'md', 'lg', 'xl'] as const;
export const BACKGROUND_CHOICES = ['plain', 'glow', 'mesh', 'dots', 'custom'] as const;

export type FontChoice = (typeof FONT_CHOICES)[number];
export type SizeChoice = (typeof SIZE_CHOICES)[number];
export type BackgroundChoice = (typeof BACKGROUND_CHOICES)[number];

export const AppearanceSchema = z.object({
  font: z.enum(FONT_CHOICES).catch('jakarta'),
  size: z.enum(SIZE_CHOICES).catch('md'),
  background: z.enum(BACKGROUND_CHOICES).catch('glow'),
  /** Transiciones y animaciones de la interfaz */
  animations: z.boolean().catch(true),
  /** Confeti al ganar. Depende también de animations */
  confetti: z.boolean().catch(true),
  /** Sonidos al ganar y del Pomodoro */
  sounds: z.boolean().catch(true),
  /** Color del fondo personalizado. La foto, si hay, se guarda aparte (src/ui/backgroundImage.ts) */
  customColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .catch('#0e5a6b'),
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

export function applyAppearance(
  root: HTMLElement,
  appearance: Appearance,
  /** Foto del fondo personalizado como data URL, o null */
  image: string | null = null,
): void {
  root.dataset.font = appearance.font;
  root.dataset.size = appearance.size;
  root.dataset.bg = appearance.background;
  root.dataset.motion = appearance.animations ? 'on' : 'off';
  root.style.setProperty('--enarm-font-body', FONT_FAMILIES[appearance.font]);
  root.style.setProperty('--enarm-custom-color', appearance.customColor);
  if (appearance.background === 'custom' && image?.startsWith('data:image/')) {
    root.style.setProperty('--enarm-custom-image', `url("${image}")`);
  } else {
    root.style.removeProperty('--enarm-custom-image');
  }
}

export function useApplyAppearance(appearance: Appearance): void {
  useEffect(() => {
    applyAppearance(document.documentElement, appearance, loadBackgroundImage());
  }, [appearance]);
}

/** Si se pueden mostrar animaciones, según el ajuste y la preferencia del sistema */
export function motionAllowed(appearance: Pick<Appearance, 'animations'>): boolean {
  if (!appearance.animations) return false;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
