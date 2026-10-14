// Desplazamiento continuo de Buscar tarjetas, en lugar de páginas (B4 del plan del cambio). La lista
// pinta las primeras tarjetas y suma más cuando el final se acerca a la vista, así abrir la pantalla
// con miles de tarjetas no pinta miles de filas. Sin IntersectionObserver, como en jsdom, queda el
// botón Mostrar más de la lista.
import { useEffect, useEffectEvent, type RefObject } from 'react';

/** Cuántas filas se suman cada vez */
export const ROWS_STEP = 60;

/**
 * Llama a onMore cuando sentinel se acerca a la vista. shown es cuántas filas hay pintadas, para
 * volver a mirar después de cada carga por si el final sigue a la vista
 */
export function useLoadMore(
  sentinel: RefObject<HTMLElement | null>,
  enabled: boolean,
  shown: number,
  onMore: () => void,
): void {
  const more = useEffectEvent(onMore);
  useEffect(() => {
    const node = sentinel.current;
    if (!enabled || !node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) more();
      },
      { rootMargin: '0px 0px 600px 0px' },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [sentinel, enabled, shown]);
}
