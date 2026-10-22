// Dónde va el globo del recorrido (B15, 4.3 del plan de B15)
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { placeBalloon, type Rect, type Side, type Size } from './placement';

const VIEWPORT: Size = { width: 1280, height: 800 };
const BALLOON: Size = { width: 352, height: 200 };
const overlaps = (a: Rect, b: Rect) =>
  a.left < b.left + b.width &&
  b.left < a.left + a.width &&
  a.top < b.top + b.height &&
  b.top < a.top + a.height;
const boxOf = (placement: { left: number; top: number }, size: Size): Rect => ({
  ...placement,
  ...size,
});

describe('colocación del globo', () => {
  it('junto a un elemento del riel va a su derecha, centrado en su alto', () => {
    const target: Rect = { left: 8, top: 120, width: 80, height: 56 };
    const placed = placeBalloon({ target, size: BALLOON, viewport: VIEWPORT, prefer: 'right' });
    expect(placed).toEqual({ side: 'right', left: 100, top: 48 });
  });

  it('alineado con start, el globo cuelga desde el borde de arriba del elemento', () => {
    const target: Rect = { left: 8, top: 120, width: 80, height: 56 };
    const placed = placeBalloon({
      target,
      size: BALLOON,
      viewport: VIEWPORT,
      prefer: 'right',
      align: 'start',
    });
    expect(placed).toEqual({ side: 'right', left: 100, top: 120 });
    // Arriba y abajo siempre va centrado en el otro eje, aunque se pida start
    const bar: Rect = { left: 600, top: 760, width: 90, height: 40 };
    const above = placeBalloon({
      target: bar,
      size: BALLOON,
      viewport: VIEWPORT,
      prefer: 'top',
      align: 'start',
    });
    expect(above.left).toBe(600 + 45 - BALLOON.width / 2);
  });

  it('con start, un elemento abajo en el riel hace subir el globo hasta caber en la pantalla', () => {
    const target: Rect = { left: 0, top: 740, width: 88, height: 60 };
    const placed = placeBalloon({
      target,
      size: BALLOON,
      viewport: VIEWPORT,
      prefer: 'right',
      align: 'start',
    });
    expect(placed.top).toBe(VIEWPORT.height - 12 - BALLOON.height);
  });

  it('con un elemento abajo en la barra del teléfono prefiere ir encima', () => {
    const target: Rect = { left: 100, top: 760, width: 90, height: 40 };
    const placed = placeBalloon({ target, size: BALLOON, viewport: VIEWPORT, prefer: 'top' });
    expect(placed.side).toBe('top');
    expect(placed.top).toBe(760 - 12 - 200);
  });

  it('si no cabe del lado preferido prueba el contrario', () => {
    const target: Rect = { left: 1230, top: 300, width: 40, height: 40 };
    const placed = placeBalloon({ target, size: BALLOON, viewport: VIEWPORT, prefer: 'right' });
    expect(placed.side).toBe('left');
  });

  it('el engrane de abajo a la izquierda no deja el globo fuera de la pantalla', () => {
    const target: Rect = { left: 0, top: 740, width: 88, height: 60 };
    const placed = placeBalloon({ target, size: BALLOON, viewport: VIEWPORT, prefer: 'right' });
    expect(placed.side).toBe('right');
    expect(placed.top + BALLOON.height).toBeLessThanOrEqual(VIEWPORT.height - 12);
    expect(placed.top).toBeGreaterThanOrEqual(12);
  });

  it('con un globo más grande que la pantalla lo pega al margen superior izquierdo', () => {
    const placed = placeBalloon({
      target: { left: 10, top: 10, width: 20, height: 20 },
      size: { width: 2000, height: 2000 },
      viewport: VIEWPORT,
      prefer: 'right',
    });
    expect(placed.left).toBe(12);
    expect(placed.top).toBe(12);
  });

  it('con cualquier elemento y cualquier lado preferido el globo queda dentro de la pantalla', () => {
    const sides: Side[] = ['right', 'left', 'top', 'bottom'];
    fc.assert(
      fc.property(
        fc.record({
          left: fc.integer({ min: -100, max: 1400 }),
          top: fc.integer({ min: -100, max: 900 }),
          width: fc.integer({ min: 1, max: 400 }),
          height: fc.integer({ min: 1, max: 300 }),
        }),
        fc.record({
          width: fc.integer({ min: 100, max: 500 }),
          height: fc.integer({ min: 80, max: 600 }),
        }),
        fc.constantFrom(...sides),
        fc.constantFrom<'center' | 'start'>('center', 'start'),
        (target, size, prefer, align) => {
          const placed = placeBalloon({ target, size, viewport: VIEWPORT, prefer, align });
          expect(placed.left).toBeGreaterThanOrEqual(12);
          expect(placed.top).toBeGreaterThanOrEqual(12);
          expect(placed.left + size.width).toBeLessThanOrEqual(VIEWPORT.width - 12);
          expect(placed.top + size.height).toBeLessThanOrEqual(VIEWPORT.height - 12);
        },
      ),
    );
  });

  it('si hay un lado donde cabe, el globo no tapa el elemento que señala', () => {
    const sides: Side[] = ['right', 'left', 'top', 'bottom'];
    fc.assert(
      fc.property(
        fc.record({
          left: fc.integer({ min: 300, max: 700 }),
          top: fc.integer({ min: 300, max: 500 }),
          width: fc.integer({ min: 20, max: 120 }),
          height: fc.integer({ min: 20, max: 80 }),
        }),
        fc.constantFrom(...sides),
        fc.constantFrom<'center' | 'start'>('center', 'start'),
        (target, prefer, align) => {
          const placed = placeBalloon({ target, size: BALLOON, viewport: VIEWPORT, prefer, align });
          expect(overlaps(boxOf(placed, BALLOON), target)).toBe(false);
        },
      ),
    );
  });
});
