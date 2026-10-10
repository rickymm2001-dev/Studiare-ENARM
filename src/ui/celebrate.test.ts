// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const confetti = vi.hoisted(() => vi.fn(() => Promise.resolve(null)));
vi.mock('canvas-confetti', () => ({ default: confetti }));

/**
 * El módulo recuerda si hay lienzo, así que cada prueba lo carga limpio, junto con los ajustes que
 * lee, para que los cambios de la prueba lleguen a la misma copia
 */
async function freshCelebrate(confettiOn = true) {
  vi.resetModules();
  const { usePreferences } = await import('@/app/preferences');
  usePreferences.setState({
    appearance: { ...usePreferences.getState().appearance, confetti: confettiOn, sounds: false },
  });
  return (await import('./celebrate')).celebrate;
}

describe('celebrate', () => {
  beforeEach(() => {
    confetti.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('con lienzo disponible lanza el confeti', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as CanvasRenderingContext2D,
    );
    const celebrate = await freshCelebrate();
    celebrate('badge');
    await vi.waitFor(() => {
      expect(confetti).toHaveBeenCalled();
    });
  });

  it('sin lienzo, que algunos navegadores bloquean, no lo intenta y no falla', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const celebrate = await freshCelebrate();
    expect(() => {
      celebrate('badge');
    }).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(confetti).not.toHaveBeenCalled();
  });

  it('si el navegador lanza al pedir el lienzo tampoco falla', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const celebrate = await freshCelebrate();
    expect(() => {
      celebrate('small');
    }).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(confetti).not.toHaveBeenCalled();
  });

  it('con el confeti apagado en los ajustes no pide el lienzo', async () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const celebrate = await freshCelebrate(false);
    celebrate('goal');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getContext).not.toHaveBeenCalled();
    expect(confetti).not.toHaveBeenCalled();
  });
});
