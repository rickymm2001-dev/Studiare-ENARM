// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OVERRIDES_KEY,
  readStoredOverrides,
  writeStoredOverrides,
  type StoredOverrides,
} from './overridesStore';
import { FACTORY_THRESHOLDS, mergeThresholds } from './thresholds';

afterEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe('cambios guardados del admin', () => {
  it('sin nada guardado no hay cambios', () => {
    expect(readStoredOverrides()).toBeNull();
  });

  it('guarda, lee y borra', () => {
    const value: StoredOverrides = {
      thresholds: { bias: { minTaggedErrors: 30 } },
      aiCostEstimateUsd: 1.5,
    };
    expect(writeStoredOverrides(value)).toBe(true);
    expect(readStoredOverrides()).toEqual(value);
    expect(writeStoredOverrides(null)).toBe(true);
    expect(readStoredOverrides()).toBeNull();
  });

  it('un valor roto, de otro formato o con pesos no positivos se ignora completo', () => {
    for (const raw of [
      '{ no es json',
      '[]',
      JSON.stringify({ otraCosa: 1 }),
      JSON.stringify({ weights: { branches: { internal_medicine: 0 }, topics: {} } }),
    ]) {
      localStorage.setItem(OVERRIDES_KEY, raw);
      expect(readStoredOverrides(), raw).toBeNull();
    }
  });

  it('no guarda lo que no cumple el formato', () => {
    expect(writeStoredOverrides({ aiCostEstimateUsd: -5 })).toBe(false);
    expect(readStoredOverrides()).toBeNull();
  });
});

describe('mezcla de umbrales', () => {
  it('cambia solo lo que se manda y deja el resto de fábrica', () => {
    const merged = mergeThresholds(FACTORY_THRESHOLDS, { bias: { minTaggedErrors: 25 } });
    expect(merged.ok && merged.value.bias.minTaggedErrors).toBe(25);
    expect(merged.ok && merged.value.bias.doubleLabelShare).toBe(
      FACTORY_THRESHOLDS.bias.doubleLabelShare,
    );
    expect(merged.ok && merged.value.fsrs).toEqual(FACTORY_THRESHOLDS.fsrs);
  });

  it('rechaza un valor fuera de rango y dice cuál', () => {
    const merged = mergeThresholds(FACTORY_THRESHOLDS, { fsrs: { desiredRetention: 0.5 } });
    expect(merged.ok).toBe(false);
    expect(!merged.ok && merged.issues[0]).toContain('fsrs.desiredRetention');
  });

  it('rechaza un grupo o un nombre que no existe', () => {
    expect(mergeThresholds(FACTORY_THRESHOLDS, { inventado: { x: 1 } }).ok).toBe(false);
    expect(mergeThresholds(FACTORY_THRESHOLDS, { bias: { inventado: 1 } }).ok).toBe(false);
  });
});

describe('al abrir la app', () => {
  it('los umbrales guardados se aplican', async () => {
    writeStoredOverrides({ thresholds: { bias: { minTaggedErrors: 25 } } });
    const { DEFAULT_THRESHOLDS } = await import('./thresholds');
    expect(DEFAULT_THRESHOLDS.bias.minTaggedErrors).toBe(25);
  });

  it('unos umbrales guardados inválidos se ignoran y quedan los de fábrica', async () => {
    writeStoredOverrides({ thresholds: { fsrs: { desiredRetention: 0.2 } } });
    const { DEFAULT_THRESHOLDS, FACTORY_THRESHOLDS: factory } = await import('./thresholds');
    expect(DEFAULT_THRESHOLDS).toBe(factory);
  });

  it('los pesos guardados se aplican y los de fábrica quedan a la mano', async () => {
    const { factoryWeights, topicTaxonomy } = await import('@/demo/content');
    const branch = topicTaxonomy.branches[0];
    const topic = branch?.topics[0];
    if (!branch || !topic) throw new Error('Taxonomía vacía');
    vi.resetModules();
    writeStoredOverrides({
      weights: {
        branches: { [branch.key]: 3, rama_que_no_existe: 9 },
        topics: { [`${branch.key}/${topic.key}`]: 2.5 },
      },
    });
    const changed = await import('@/demo/content');
    const changedBranch = changed.topicTaxonomy.branches[0];
    expect(changedBranch?.weight).toBe(3);
    expect(changedBranch?.topics[0]?.weight).toBe(2.5);
    // Las demás ramas y los demás temas quedan como estaban
    expect(changed.topicTaxonomy.branches[1]?.weight).toBe(topicTaxonomy.branches[1]?.weight);
    // Los pesos de fábrica no cambian
    expect(changed.factoryWeights.branches[branch.key]).toBe(factoryWeights.branches[branch.key]);
  });
});
