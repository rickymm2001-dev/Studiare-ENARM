// Dónde va el globo del recorrido junto al elemento que señala (B15, 4.3 del plan de B15). Pura, para
// probarla sin navegador. Prefiere un lado del elemento, prueba los demás si no cabe y al final lo acomoda
// dentro de la pantalla con un margen, así nunca choca con los bordes. La hoja del teléfono y el globo al
// centro no pasan por aquí.

/** Un rectángulo en coordenadas de la ventana, como lo da getBoundingClientRect */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Side = 'right' | 'left' | 'top' | 'bottom';

export interface Placement {
  left: number;
  top: number;
  /** El lado del elemento donde quedó el globo */
  side: Side;
}

/** Los lados que prueba, en orden, según el que prefiere. Primero el opuesto y luego los de los costados */
const SIDES_TO_TRY: Record<Side, readonly Side[]> = {
  right: ['right', 'left', 'bottom', 'top'],
  left: ['left', 'right', 'bottom', 'top'],
  top: ['top', 'bottom', 'right', 'left'],
  bottom: ['bottom', 'top', 'right', 'left'],
};

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/** Cómo se alinea el globo con el elemento a lo largo del otro eje. Arriba y abajo siempre va centrado */
export type Align = 'center' | 'start';

/** La esquina de arriba a la izquierda del globo si va de ese lado, alineado en el otro eje */
function cornerAt(side: Side, target: Rect, size: Size, gap: number, align: Align) {
  const centerX = target.left + target.width / 2;
  const centerY = target.top + target.height / 2;
  // Con start, el borde de arriba del globo queda a la altura del borde de arriba del elemento, así un globo
  // alto cuelga hacia abajo y no tapa lo que hay arriba del elemento
  const top = align === 'start' ? target.top : centerY - size.height / 2;
  switch (side) {
    case 'right':
      return { left: target.left + target.width + gap, top };
    case 'left':
      return { left: target.left - gap - size.width, top };
    case 'top':
      return { left: centerX - size.width / 2, top: target.top - gap - size.height };
    case 'bottom':
      return { left: centerX - size.width / 2, top: target.top + target.height + gap };
  }
}

export function placeBalloon({
  target,
  size,
  viewport,
  prefer,
  align = 'center',
  gap = 12,
  margin = 12,
}: {
  target: Rect;
  size: Size;
  viewport: Size;
  prefer: Side;
  /** A los lados del elemento, si el globo va centrado en su alto o alineado con su borde de arriba */
  align?: Align;
  /** Aire entre el elemento y el globo */
  gap?: number;
  /** Lo mínimo que debe quedar entre el globo y el borde de la pantalla */
  margin?: number;
}): Placement {
  const fits = (side: Side) => {
    const corner = cornerAt(side, target, size, gap, align);
    return side === 'right' || side === 'left'
      ? corner.left >= margin && corner.left + size.width <= viewport.width - margin
      : corner.top >= margin && corner.top + size.height <= viewport.height - margin;
  };
  // Si ningún lado cabe, se queda con el preferido y lo acomoda encima del elemento
  const side = SIDES_TO_TRY[prefer].find(fits) ?? prefer;
  const corner = cornerAt(side, target, size, gap, align);
  return {
    side,
    left: clamp(corner.left, margin, Math.max(margin, viewport.width - margin - size.width)),
    top: clamp(corner.top, margin, Math.max(margin, viewport.height - margin - size.height)),
  };
}
