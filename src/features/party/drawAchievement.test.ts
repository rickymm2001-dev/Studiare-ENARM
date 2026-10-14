import { describe, expect, it } from 'vitest';
import { tileBoxes } from './drawAchievement';

const area = { top: 348, bottom: 1008 };

describe('cuadros de la imagen de la semana', () => {
  it('cuatro cifras van en dos filas de dos, del mismo tamaño y sin salirse del área', () => {
    const boxes = tileBoxes(4, area);
    expect(boxes).toHaveLength(4);
    const [first, second, third, fourth] = boxes;
    expect(first?.width).toBe(second?.width);
    expect(first?.y).toBe(second?.y);
    expect(third?.y).toBe(fourth?.y);
    expect((third?.y ?? 0) > (first?.y ?? 0)).toBe(true);
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(72);
      expect(box.x + box.width).toBeLessThanOrEqual(1080 - 72);
      expect(box.y).toBeGreaterThanOrEqual(area.top);
      expect(box.y + box.height).toBeLessThanOrEqual(area.bottom + 0.001);
    }
  });

  it('en modo enfoque, con tres cifras, la primera ocupa todo el ancho', () => {
    const [first, second, third] = tileBoxes(3, area);
    expect(first?.width).toBe(1080 - 72 * 2);
    expect(second?.y).toBe(third?.y);
    expect((second?.width ?? 0) + (third?.width ?? 0)).toBeLessThan(first?.width ?? 0);
  });
});
