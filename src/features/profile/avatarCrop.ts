// Encuadre de la foto de perfil (B2 del plan del cambio, comentario 15). Funciones puras que calculan
// cómo se ve la foto dentro del círculo de vista previa y qué zona de la original se recorta. Sin
// React ni DOM, para probarlas en Node. AvatarCropper las usa y dibuja el resultado en un canvas.
import { AVATAR_DATA_URL_MAX } from '@/data/schemas/people';

/** Lado del JPEG que se guarda, en píxeles */
export const OUTPUT_SIZE = 256;
/** Acercamiento. 1 muestra la foto completa por su lado corto y 3 la triplica */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 0.05;
/** Cuánto se mueve la foto con cada flecha, en píxeles de pantalla */
export const NUDGE_PX = 8;
/** Calidades JPEG que se prueban en orden hasta que la foto quepa en el esquema */
export const JPEG_QUALITIES = [0.85, 0.72, 0.6, 0.45];

export interface ImageSize {
  width: number;
  height: number;
}

export interface Offset {
  x: number;
  y: number;
}

/**
 * Cómo está encuadrada la foto. viewport es el lado del círculo en píxeles de pantalla y offset
 * cuánto se corrió el centro de la foto respecto al centro del círculo, también en pantalla
 */
export interface Frame {
  viewport: number;
  zoom: number;
  offset: Offset;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tamaño y posición de la foto en pantalla, relativos a la esquina superior izquierda del círculo */
export interface Placement {
  width: number;
  height: number;
  left: number;
  top: number;
}

/** Una imagen sirve si tiene ancho y alto reales */
export function isUsableImage(size: ImageSize): boolean {
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width >= 1 &&
    size.height >= 1
  );
}

export function initialFrame(viewport: number): Frame {
  return { viewport, zoom: MIN_ZOOM, offset: { x: 0, y: 0 } };
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Escala con la que la foto cubre el círculo justo por su lado corto */
export function coverScale(image: ImageSize, viewport: number): number {
  return viewport / Math.min(image.width, image.height);
}

/** Escala total de la foto en pantalla, el ajuste de cobertura por el acercamiento */
export function displayScale(image: ImageSize, frame: Frame): number {
  return coverScale(image, frame.viewport) * frame.zoom;
}

/** Limita el desplazamiento para que la foto siempre cubra el círculo completo */
export function clampOffset(image: ImageSize, frame: Frame): Offset {
  const scale = displayScale(image, frame);
  const maxX = Math.max(0, (image.width * scale - frame.viewport) / 2);
  const maxY = Math.max(0, (image.height * scale - frame.viewport) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, frame.offset.x)),
    y: Math.min(maxY, Math.max(-maxY, frame.offset.y)),
  };
}

export function placement(image: ImageSize, frame: Frame): Placement {
  const scale = displayScale(image, frame);
  const offset = clampOffset(image, frame);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    width,
    height,
    left: (frame.viewport - width) / 2 + offset.x,
    top: (frame.viewport - height) / 2 + offset.y,
  };
}

/** Zona de la foto original que cae dentro del círculo. Es lo que se dibuja en el JPEG final */
export function sourceRect(image: ImageSize, frame: Frame): Rect {
  const scale = displayScale(image, frame);
  const offset = clampOffset(image, frame);
  const side = frame.viewport / scale;
  return {
    x: (image.width - side) / 2 - offset.x / scale,
    y: (image.height - side) / 2 - offset.y / scale,
    width: side,
    height: side,
  };
}

/** Encuadre después de arrastrar o de pulsar una flecha */
export function moveBy(image: ImageSize, frame: Frame, dx: number, dy: number): Frame {
  const moved = { ...frame, offset: { x: frame.offset.x + dx, y: frame.offset.y + dy } };
  return { ...moved, offset: clampOffset(image, moved) };
}

/** Cambia el acercamiento y conserva el punto de la foto que estaba en el centro del círculo */
export function zoomTo(image: ImageSize, frame: Frame, zoom: number): Frame {
  const next = clampZoom(zoom);
  const factor = next / frame.zoom;
  const scaled = {
    ...frame,
    zoom: next,
    offset: { x: frame.offset.x * factor, y: frame.offset.y * factor },
  };
  return { ...scaled, offset: clampOffset(image, scaled) };
}

/** Prueba las calidades en orden y devuelve el primer dataUrl que cabe en el esquema, o null */
export function fitDataUrl(
  encode: (quality: number) => string,
  limit = AVATAR_DATA_URL_MAX,
  qualities = JPEG_QUALITIES,
): string | null {
  for (const quality of qualities) {
    const dataUrl = encode(quality);
    if (dataUrl.length <= limit) return dataUrl;
  }
  return null;
}
