import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutlinePage } from '@/data/schemas/outlines';
import { OutlineAutosaver, type SaveStatus } from './outlineAutosave';

const page = { id: 'p' } as unknown as OutlinePage;

function setup(save: () => Promise<OutlinePage>) {
  const statuses: SaveStatus[] = [];
  const onSaved = vi.fn();
  const saver = new OutlineAutosaver(100);
  saver.configure({ save, onStatus: (status) => statuses.push(status), onSaved });
  return { saver, statuses, onSaved };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('guardado automático de apuntes', () => {
  it('espera un instante después del último cambio y guarda una sola vez', async () => {
    const save = vi.fn(() => Promise.resolve(page));
    const { saver, statuses } = setup(save);
    saver.touch();
    await vi.advanceTimersByTimeAsync(60);
    saver.touch();
    await vi.advanceTimersByTimeAsync(60);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60);
    expect(save).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(['dirty', 'dirty', 'saving', 'saved']);
    expect(saver.hasPending()).toBe(false);
  });

  it('sin cambios no guarda nada', async () => {
    const save = vi.fn(() => Promise.resolve(page));
    const { saver } = setup(save);
    await saver.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it('si el alumno sigue escribiendo mientras guarda, hace otro guardado después', async () => {
    let release: () => void = () => undefined;
    const save = vi
      .fn<() => Promise<OutlinePage>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => {
              resolve(page);
            };
          }),
      )
      .mockResolvedValue(page);
    const { saver, statuses } = setup(save);
    saver.touch();
    await vi.advanceTimersByTimeAsync(110);
    expect(save).toHaveBeenCalledTimes(1);
    saver.touch();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.at(-1)).toBe('dirty');
    await vi.advanceTimersByTimeAsync(110);
    expect(save).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('nunca corre dos guardados a la vez', async () => {
    let inFlight = 0;
    let peak = 0;
    const save = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 50));
      inFlight -= 1;
      return page;
    });
    const { saver } = setup(save);
    saver.touch();
    const first = saver.flush();
    saver.touch();
    const second = saver.flush();
    await vi.advanceTimersByTimeAsync(300);
    await Promise.all([first, second]);
    expect(peak).toBe(1);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('un error deja el aviso, conserva lo pendiente y no reintenta solo en bucle', async () => {
    const save = vi.fn(() => Promise.reject(new Error('sin espacio')));
    const { saver, statuses } = setup(save);
    saver.touch();
    await vi.advanceTimersByTimeAsync(110);
    expect(statuses.at(-1)).toBe('error');
    expect(saver.hasPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    // Un cambio nuevo lo vuelve a intentar
    saver.touch();
    await vi.advanceTimersByTimeAsync(110);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('flush guarda ya, sin esperar el instante', async () => {
    const save = vi.fn(() => Promise.resolve(page));
    const { saver } = setup(save);
    saver.touch();
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('al soltarlo guarda lo pendiente y ya no avisa a la pantalla', async () => {
    const save = vi.fn(() => Promise.resolve(page));
    const { saver, statuses, onSaved } = setup(save);
    saver.touch();
    saver.dispose();
    await vi.advanceTimersByTimeAsync(10);
    expect(save).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(statuses).not.toContain('saved');
  });
});
