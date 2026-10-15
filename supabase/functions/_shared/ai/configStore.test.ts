import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config.ts';
import { cachedConfig, configFromRow, createRestConfigStore } from './configStore.ts';
import { createFakeSupabaseRest } from './testing/fakeSupabaseRest.ts';
import { createMemoryAi, memoryConfigStore } from './testing/memory.ts';

const restStore = (configRow: unknown = null) => {
  const rest = createFakeSupabaseRest({ memory: createMemoryAi(), configRow });
  const store = createRestConfigStore({
    url: rest.url,
    serviceKey: rest.serviceKey,
    fetchImpl: rest.fetch,
  });
  return { rest, store };
};

describe('configuración en ai_config', () => {
  it('sin fila usa la de fábrica y con una fila la mezcla', async () => {
    expect(await restStore().store.load()).toEqual(DEFAULT_CONFIG);
    const { store } = restStore({ limits: { dailyBudgetUsd: 7 } });
    expect((await store.load()).limits.dailyBudgetUsd).toBe(7);
  });

  it('una fila dañada o que rompe las reglas del modelo cae a la de fábrica y lo registra', () => {
    const codes: string[] = [];
    const log = (code: string) => {
      codes.push(code);
    };
    expect(configFromRow({ basura: true }, log)).toEqual(DEFAULT_CONFIG);
    expect(
      configFromRow(
        {
          models: {
            forgetting: { id: 'claude-opus-5-5', effort: 'low', thinking: 'off', maxTokens: 900 },
          },
        },
        log,
      ),
    ).toEqual(DEFAULT_CONFIG);
    expect(codes).toEqual(['ai.config.invalid', 'ai.config.invalid']);
  });

  it('guarda con la llave de servicio en una sola fila, y si no puede leer falla', async () => {
    const { rest, store } = restStore();
    await store.save({
      ...DEFAULT_CONFIG,
      limits: { ...DEFAULT_CONFIG.limits, dailyBudgetUsd: 9 },
    });
    expect(rest.configRow).toMatchObject({ limits: { dailyBudgetUsd: 9 } });
    expect(rest.calls.every((call) => call.key === 'service' && call.bearer === 'service')).toBe(
      true,
    );
    rest.down = true;
    await expect(store.load()).rejects.toThrow('503');
    await expect(store.save(DEFAULT_CONFIG)).rejects.toThrow('503');
  });
});

describe('caché de 60 s de la función', () => {
  it('lee una vez por minuto, se queda con la última si falla y no arranca a ciegas', async () => {
    let now = 0;
    const store = memoryConfigStore({
      ...DEFAULT_CONFIG,
      limits: { ...DEFAULT_CONFIG.limits, dailyBudgetUsd: 4 },
    });
    let failing = true;
    const load = store.load.bind(store);
    store.load = () => (failing ? Promise.reject(new Error('caída')) : load());
    const cache = cachedConfig(store, 60_000, () => now);
    await expect(cache.refresh()).rejects.toThrow('caída');
    failing = false;
    await cache.refresh();
    expect(cache.get().limits.dailyBudgetUsd).toBe(4);
    store.current = { ...store.current, limits: { ...store.current.limits, dailyBudgetUsd: 6 } };
    now = 59_000;
    await cache.refresh();
    expect(cache.get().limits.dailyBudgetUsd).toBe(4);
    now = 61_000;
    failing = true;
    await cache.refresh();
    expect(cache.get().limits.dailyBudgetUsd).toBe(4);
    failing = false;
    await cache.refresh();
    expect(cache.get().limits.dailyBudgetUsd).toBe(6);
    cache.set({ ...DEFAULT_CONFIG, limits: { ...DEFAULT_CONFIG.limits, dailyBudgetUsd: 8 } });
    await cache.refresh();
    expect(cache.get().limits.dailyBudgetUsd).toBe(8);
  });
});
