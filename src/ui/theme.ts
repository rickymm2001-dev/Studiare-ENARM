// Aplica el tema visual a <html>. Con system sigue al sistema y escucha sus cambios.
import { useEffect } from 'react';
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

export function applyTheme(root: HTMLElement, theme: ResolvedTheme): void {
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
}

export function useApplyTheme(preference: ThemePreference): void {
  useEffect(() => {
    // Algunos entornos (navegadores viejos, jsdom) no tienen matchMedia. Entonces se usa claro
    const media = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;
    const update = () => {
      applyTheme(document.documentElement, resolveTheme(preference, media?.matches ?? false));
    };
    update();
    media?.addEventListener('change', update);
    return () => {
      media?.removeEventListener('change', update);
    };
  }, [preference]);
}
