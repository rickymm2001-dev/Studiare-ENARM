import { describe, expect, it } from 'vitest';
import { renderCloze, reviewEndReason } from './study';

describe('cloze', () => {
  it('oculta el hueco activo al frente y lo resalta al revelar', () => {
    const html = 'El {{c1::DIU de cobre}} es el método más {{c2::eficaz::calidad}}';
    expect(renderCloze(html, 1, false)).toBe('El <mark>[…]</mark> es el método más eficaz');
    expect(renderCloze(html, 2, false)).toBe(
      'El DIU de cobre es el método más <mark>[calidad]</mark>',
    );
    expect(renderCloze(html, 1, true)).toBe('El <mark>DIU de cobre</mark> es el método más eficaz');
  });
});

describe('reviewEndReason', () => {
  it('permite marcar completada la sesión aunque React todavía no haya actualizado la posición', () => {
    expect(reviewEndReason(4, 5, 'completed')).toBe('completed');
  });

  it('deduce abandono cuando se cierra antes del final', () => {
    expect(reviewEndReason(2, 5)).toBe('abandoned');
  });

  it('deduce completada cuando la posición ya llegó al final', () => {
    expect(reviewEndReason(5, 5)).toBe('completed');
  });
});
