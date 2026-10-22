import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImportParseResult } from './importApi';
import { createImportClient, type ImportWorkerHandle } from './importClient';

const file = (size = 10) => ({
  name: 'mazo.apkg',
  size,
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(size)),
});
const parsed = { ok: true, parsed: { source: 'csv' } } as unknown as ImportParseResult;

afterEach(() => {
  vi.useRealTimers();
});

describe('cliente del worker del importador', () => {
  it('un archivo más grande de lo permitido ni se lee ni crea el worker', async () => {
    const spawn = vi.fn();
    const arrayBuffer = vi.fn();
    const client = createImportClient({ spawn, maxFileBytes: 100 });
    expect(await client.parse({ name: 'enorme.apkg', size: 101, arrayBuffer })).toEqual({
      ok: false,
      code: 'too_large',
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('crea el worker una vez y lo reutiliza', async () => {
    const parse = vi.fn(() => Promise.resolve(parsed));
    const spawn = vi.fn((): ImportWorkerHandle => ({ remote: { parse }, terminate: vi.fn() }));
    const client = createImportClient({ spawn });
    expect(await client.parse(file())).toBe(parsed);
    expect(await client.parse(file())).toBe(parsed);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it('una lectura atorada se cancela, el worker se termina y el siguiente archivo usa uno nuevo', async () => {
    vi.useFakeTimers();
    const terminated: number[] = [];
    let spawned = 0;
    const spawn = (): ImportWorkerHandle => {
      spawned += 1;
      const id = spawned;
      return {
        // El primero se atora para siempre, como con un archivo hecho a propósito
        remote: {
          parse: () => (id === 1 ? new Promise(() => undefined) : Promise.resolve(parsed)),
        },
        terminate: () => terminated.push(id),
      };
    };
    const client = createImportClient({ spawn, timeoutMs: 5000 });
    const stuck = client.parse(file());
    await vi.advanceTimersByTimeAsync(5000);
    expect(await stuck).toEqual({ ok: false, code: 'too_slow' });
    expect(terminated).toEqual([1]);
    expect(await client.parse(file())).toBe(parsed);
    expect(spawned).toBe(2);
  });

  it('un worker que falla se descarta y el error sigue su camino', async () => {
    const terminate = vi.fn();
    let spawned = 0;
    const client = createImportClient({
      spawn: () => {
        spawned += 1;
        return {
          remote: { parse: () => Promise.reject(new Error('se cayó')) },
          terminate,
        };
      },
    });
    await expect(client.parse(file())).rejects.toThrow('se cayó');
    expect(terminate).toHaveBeenCalledTimes(1);
    await expect(client.parse(file())).rejects.toThrow('se cayó');
    expect(spawned).toBe(2);
  });
});
