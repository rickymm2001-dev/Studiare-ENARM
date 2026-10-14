import { useCallback, useSyncExternalStore } from 'react';

/** El ancho desde el que la app se ve como en computadora, el lg de Tailwind */
export const DESKTOP_QUERY = '(min-width: 64rem)';

/**
 * Si la ventana cumple una media query, y se actualiza cuando deja de cumplirla. Sin matchMedia,
 * como en jsdom, responde false y la pantalla se ve como en el teléfono
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}
