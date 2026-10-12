import { useLayoutEffect, useState, type RefObject } from 'react';

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Mide un elemento y se actualiza cuando cambia de tamaño, para dibujar una gráfica que llena su
 * espacio sin estirar el texto (D-117). Sin ResizeObserver, como en jsdom, se queda con la medida de
 * reserva
 */
export function useElementSize(
  ref: RefObject<HTMLElement | null>,
  fallback: ElementSize,
): ElementSize {
  const [size, setSize] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      const next = { width: Math.round(width), height: Math.round(height) };
      setSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    };
    const rect = element.getBoundingClientRect();
    measure(rect.width, rect.height);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) measure(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return size;
}
