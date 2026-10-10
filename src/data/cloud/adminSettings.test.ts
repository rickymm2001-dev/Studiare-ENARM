// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OVERRIDES_SETTING_KEY,
  fetchRemoteOverrides,
  mirrorRemoteOverrides,
  sameOverrides,
  saveRemoteOverrides,
} from './adminSettings';
import {
  OVERRIDES_KEY,
  readStoredOverrides,
  writeStoredOverrides,
} from '../../config/overridesStore';

const STORED = { thresholds: { bias: { minTaggedErrors: 9 } }, aiCostEstimateUsd: 3.5 };

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

describe('leer los cambios del servidor', () => {
  it('lee la clave admin_overrides de platform_settings', async () => {
    const { cloud, from, table } = fakeCloud({ data: { value: STORED }, error: null });
    expect(await fetchRemoteOverrides(cloud)).toEqual({ ok: true, overrides: STORED });
    expect(from).toHaveBeenCalledWith('platform_settings');
    expect(table.select).toHaveBeenCalledWith('value');
  });

  it('sin fila no hay cambios y todo va de fábrica', async () => {
    const { cloud } = fakeCloud({ data: null, error: null });
    expect(await fetchRemoteOverrides(cloud)).toEqual({ ok: true, overrides: null });
  });

  it('un valor que no cumple el formato se ignora completo', async () => {
    const { cloud } = fakeCloud({ data: { value: { thresholds: 'mal', extra: 1 } }, error: null });
    expect(await fetchRemoteOverrides(cloud)).toEqual({ ok: true, overrides: null });
  });

  it('un error del servidor o de red no se confunde con "no hay cambios"', async () => {
    expect(await fetchRemoteOverrides(fakeCloud({ error: { message: 'x' } }).cloud)).toEqual({
      ok: false,
    });
    expect(await fetchRemoteOverrides(fakeCloud('throws').cloud)).toEqual({ ok: false });
  });
});

describe('guardar los cambios en el servidor', () => {
  it('hace upsert de la clave con el valor validado', async () => {
    const { cloud, table } = fakeCloud({ error: null });
    expect(await saveRemoteOverrides(cloud, STORED)).toBe(true);
    expect(table.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ key: OVERRIDES_SETTING_KEY, value: STORED }),
    );
  });

  it('con null borra la clave y deja todo de fábrica', async () => {
    const { cloud, table, eq } = fakeCloud({ error: null });
    expect(await saveRemoteOverrides(cloud, null)).toBe(true);
    expect(table.delete).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('key', OVERRIDES_SETTING_KEY);
    expect(table.upsert).not.toHaveBeenCalled();
  });

  it('devuelve false si el servidor lo rechaza, por ejemplo si no es admin, o si falla la red', async () => {
    expect(await saveRemoteOverrides(fakeCloud({ error: { code: '42501' } }).cloud, STORED)).toBe(
      false,
    );
    expect(await saveRemoteOverrides(fakeCloud('throws').cloud, STORED)).toBe(false);
  });

  it('no manda al servidor un valor que no cumple el formato', async () => {
    const { cloud, table } = fakeCloud({ error: null });
    expect(await saveRemoteOverrides(cloud, { weights: { branches: { a: -1 }, topics: {} } })).toBe(
      false,
    );
    expect(table.upsert).not.toHaveBeenCalled();
  });
});

describe('comparar', () => {
  it('no importa el orden de las claves y null es lo mismo que vacío', () => {
    expect(
      sameOverrides(
        { thresholds: { a: { x: 1, y: 2 } }, aiCostEstimateUsd: 1 },
        { aiCostEstimateUsd: 1, thresholds: { a: { y: 2, x: 1 } } },
      ),
    ).toBe(true);
    expect(sameOverrides(null, {})).toBe(true);
    expect(sameOverrides(STORED, null)).toBe(false);
  });
});

describe('copiar al navegador lo que dice el servidor', () => {
  it('con cambios nuevos los guarda y avisa que cambió', async () => {
    const { cloud } = fakeCloud({ data: { value: STORED }, error: null });
    expect(await mirrorRemoteOverrides(cloud)).toBe('changed');
    expect(readStoredOverrides()).toEqual(STORED);
  });

  it('si ya coinciden no toca nada ni avisa', async () => {
    writeStoredOverrides(STORED);
    const { cloud } = fakeCloud({ data: { value: STORED }, error: null });
    expect(await mirrorRemoteOverrides(cloud)).toBe('same');
  });

  it('si el servidor no tiene cambios, borra los del navegador', async () => {
    writeStoredOverrides(STORED);
    const { cloud } = fakeCloud({ data: null, error: null });
    expect(await mirrorRemoteOverrides(cloud)).toBe('changed');
    expect(localStorage.getItem(OVERRIDES_KEY)).toBeNull();
  });

  it('sin servidor conserva lo que ya había en el navegador', async () => {
    writeStoredOverrides(STORED);
    expect(await mirrorRemoteOverrides(fakeCloud('throws').cloud)).toBe('unavailable');
    expect(readStoredOverrides()).toEqual(STORED);
  });
});
