// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLAGS_KEY, readStoredFlags, writeStoredFlags } from '../../config/featureFlags';
import {
  FLAGS_SETTING_KEY,
  fetchRemoteFlags,
  mirrorRemoteFlags,
  sameFlags,
  saveRemoteFlags,
} from './featureFlags';

/** Un from() falso con el encadenado de select().eq().maybeSingle() y el de delete().eq() */
function fakeCloud(reply: { data?: unknown; error?: unknown } | 'throws') {
  const settle = () =>
    reply === 'throws' ? Promise.reject(new Error('red')) : Promise.resolve(reply);
  const eq = vi.fn().mockImplementation(settle);
  const maybeSingle = vi.fn().mockImplementation(settle);
  const table = {
    select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
    delete: vi.fn().mockReturnValue({ eq }),
    upsert: vi.fn().mockImplementation(settle),
  };
  const from = vi.fn().mockReturnValue(table);
  return { cloud: { from } as never, from, table, eq };
}

afterEach(() => {
  localStorage.clear();
});

describe('leer las banderas del servidor', () => {
  it('lee la clave feature_flags de platform_settings', async () => {
    const { cloud, from, table } = fakeCloud({
      data: { value: { demoTools: false } },
      error: null,
    });
    expect(await fetchRemoteFlags(cloud)).toEqual({ ok: true, flags: { demoTools: false } });
    expect(from).toHaveBeenCalledWith('platform_settings');
    expect(table.select).toHaveBeenCalledWith('value');
  });

  it('sin fila no hay cambios y valen los valores del entorno', async () => {
    expect(await fetchRemoteFlags(fakeCloud({ data: null, error: null }).cloud)).toEqual({
      ok: true,
      flags: null,
    });
  });

  it('un valor que no cumple el formato se ignora completo, y una bandera desconocida se descarta', async () => {
    expect(
      await fetchRemoteFlags(
        fakeCloud({ data: { value: { demoTools: 'sí' } }, error: null }).cloud,
      ),
    ).toEqual({ ok: true, flags: null });
    expect(
      await fetchRemoteFlags(
        fakeCloud({ data: { value: { demoTools: true, delFuturo: false } }, error: null }).cloud,
      ),
    ).toEqual({ ok: true, flags: { demoTools: true } });
  });

  it('un error del servidor o de red no se confunde con "no hay cambios"', async () => {
    expect(await fetchRemoteFlags(fakeCloud({ error: { message: 'x' } }).cloud)).toEqual({
      ok: false,
    });
    expect(await fetchRemoteFlags(fakeCloud('throws').cloud)).toEqual({ ok: false });
  });
});

describe('guardar las banderas en el servidor', () => {
  it('hace upsert de la clave con el valor validado', async () => {
    const { cloud, table } = fakeCloud({ error: null });
    expect(await saveRemoteFlags(cloud, { demoTools: false })).toBe(true);
    expect(table.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ key: FLAGS_SETTING_KEY, value: { demoTools: false } }),
    );
  });

  it('null borra la clave', async () => {
    const { cloud, table, eq } = fakeCloud({ error: null });
    expect(await saveRemoteFlags(cloud, null)).toBe(true);
    expect(table.delete).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('key', FLAGS_SETTING_KEY);
  });

  it('dice que no pudo si el servidor falla o el valor no cumple el formato', async () => {
    expect(await saveRemoteFlags(fakeCloud({ error: { message: 'x' } }).cloud, {})).toBe(false);
    expect(await saveRemoteFlags(fakeCloud('throws').cloud, {})).toBe(false);
    expect(
      await saveRemoteFlags(fakeCloud({ error: null }).cloud, { demoTools: 'no' } as never),
    ).toBe(false);
  });
});

describe('copiar al navegador', () => {
  it('guarda la copia cuando cambia y avisa que hay que recargar', async () => {
    const { cloud } = fakeCloud({ data: { value: { demoTools: false } }, error: null });
    expect(await mirrorRemoteFlags(cloud)).toBe('changed');
    expect(readStoredFlags()).toEqual({ demoTools: false });
    expect(await mirrorRemoteFlags(cloud)).toBe('same');
  });

  it('si el servidor no tiene la clave, borra la copia local', async () => {
    writeStoredFlags({ demoTools: false });
    expect(await mirrorRemoteFlags(fakeCloud({ data: null, error: null }).cloud)).toBe('changed');
    expect(localStorage.getItem(FLAGS_KEY)).toBeNull();
  });

  it('con el servidor caído no toca la copia', async () => {
    writeStoredFlags({ demoTools: false });
    expect(await mirrorRemoteFlags(fakeCloud('throws').cloud)).toBe('unavailable');
    expect(readStoredFlags()).toEqual({ demoTools: false });
  });

  it('compara sin importar el orden ni las banderas sin valor', () => {
    expect(sameFlags({ demoTools: undefined }, {})).toBe(true);
    expect(sameFlags(null, {})).toBe(true);
    expect(sameFlags({ demoTools: true }, { demoTools: false })).toBe(false);
  });
});
