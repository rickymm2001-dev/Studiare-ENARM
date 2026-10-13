import { describe, expect, it, vi } from 'vitest';
import {
  clampOffset,
  clampZoom,
  coverScale,
  fitDataUrl,
  initialFrame,
  isUsableImage,
  JPEG_QUALITIES,
  MAX_ZOOM,
  MIN_ZOOM,
  moveBy,
  placement,
  sourceRect,
  zoomTo,
  type Frame,
} from './avatarCrop';

// Una foto horizontal de 800 por 600 dentro de un círculo de 224
const IMAGE = { width: 800, height: 600 };
const VIEWPORT = 224;
const base = initialFrame(VIEWPORT);
const withOffset = (frame: Frame, x: number, y: number): Frame => ({ ...frame, offset: { x, y } });

describe('encuadre de la foto de perfil', () => {
  it('al abrir cubre el círculo por el lado corto y queda centrada', () => {
    expect(coverScale(IMAGE, VIEWPORT)).toBeCloseTo(224 / 600);
    const placed = placement(IMAGE, base);
    expect(placed.height).toBeCloseTo(224);
    expect(placed.width).toBeCloseTo(800 * (224 / 600));
    expect(placed.top).toBeCloseTo(0);
    // Sobra foto a los lados, así que empieza a la izquierda del círculo
    expect(placed.left).toBeCloseTo((224 - placed.width) / 2);
  });

  it('la zona recortada es un cuadrado del lado corto, centrado', () => {
    expect(sourceRect(IMAGE, base)).toEqual({ x: 100, y: 0, width: 600, height: 600 });
    // Una foto vertical se recorta igual, por su ancho
    expect(sourceRect({ width: 600, height: 1000 }, base)).toEqual({
      x: 0,
      y: 200,
      width: 600,
      height: 600,
    });
  });

  it('la foto nunca deja un hueco en el círculo', () => {
    const maxX = (800 * (224 / 600) - 224) / 2;
    expect(clampOffset(IMAGE, withOffset(base, 1000, 500))).toEqual({ x: maxX, y: 0 });
    expect(clampOffset(IMAGE, withOffset(base, -1000, -500))).toEqual({ x: -maxX, y: -0 });
    // Arrastrar de más se detiene en el borde
    expect(moveBy(IMAGE, base, -1000, 50).offset).toEqual({ x: -maxX, y: 0 });
  });

  it('mover corre la zona recortada en sentido contrario, a escala de la foto', () => {
    const moved = moveBy(IMAGE, base, -10, 0);
    const scale = coverScale(IMAGE, VIEWPORT);
    expect(sourceRect(IMAGE, moved).x).toBeCloseTo(100 + 10 / scale);
    expect(sourceRect(IMAGE, moved).y).toBe(0);
  });

  it('acercar conserva el punto de la foto que estaba en el centro del círculo', () => {
    const before = moveBy(IMAGE, base, -20, 0);
    const after = zoomTo(IMAGE, before, 2);
    const center = (frame: Frame) => {
      const rect = sourceRect(IMAGE, frame);
      return [rect.x + rect.width / 2, rect.y + rect.height / 2];
    };
    expect(after.zoom).toBe(2);
    expect(after.offset).toEqual({ x: -40, y: 0 });
    expect(center(after)[0]).toBeCloseTo(center(before)[0] ?? Number.NaN);
    expect(center(after)[1]).toBeCloseTo(center(before)[1] ?? Number.NaN);
    // Con el doble de acercamiento se recorta la mitad del lado
    expect(sourceRect(IMAGE, after).width).toBeCloseTo(300);
  });

  it('acercar más de la cuenta, o alejar bajo el mínimo, se detiene en los límites', () => {
    expect(clampZoom(10)).toBe(MAX_ZOOM);
    expect(clampZoom(0.2)).toBe(MIN_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(MIN_ZOOM);
    expect(zoomTo(IMAGE, base, 99).zoom).toBe(MAX_ZOOM);
    // Al alejar, el desplazamiento vuelve a caber en el círculo
    const far = zoomTo(IMAGE, moveBy(IMAGE, zoomTo(IMAGE, base, 3), 0, 150), 1);
    expect(far.offset.y).toBe(0);
  });

  it('solo sirven imágenes con ancho y alto reales', () => {
    expect(isUsableImage(IMAGE)).toBe(true);
    expect(isUsableImage({ width: 0, height: 10 })).toBe(false);
    expect(isUsableImage({ width: Number.NaN, height: 10 })).toBe(false);
  });
});

describe('tamaño del JPEG guardado', () => {
  it('baja la calidad hasta que la foto cabe en el esquema', () => {
    const encode = vi.fn((quality: number) => 'x'.repeat(Math.round(quality * 100)));
    expect(fitDataUrl(encode, 70)).toBe('x'.repeat(60));
    expect(encode.mock.calls.map(([quality]) => quality)).toEqual(JPEG_QUALITIES.slice(0, 3));
  });

  it('si ni la calidad más baja cabe, no guarda nada', () => {
    expect(fitDataUrl(() => 'x'.repeat(10), 5)).toBeNull();
  });
});
