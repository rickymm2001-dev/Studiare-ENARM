// Los casos de lectura en inglés del banco simulado (B13, paquete B). Comprueba sin navegador que
// seedEnglishCases deja casos que la app entiende igual que los de la nube, con la forma que pide el plan
// (7.5 y 6.3 de b13.md), para que las e2e de inglés fallen por la app y no por el doble. Todo el texto
// lleva [Prueba] y es simulado.
import { describe, expect, it } from 'vitest';
import { bodyEntitiesOf } from '@/data/bank/bodies';
import { uuidToUlid } from '@/data/cloud/cloudIds';
import { parsePassageSource } from '@/data/content/passageSource';
import { bodyOf } from '../e2e/support/fakeBank';
import {
  FAKE_ENGLISH_SOURCE,
  createFakeBankStore,
  seedEnglishCases,
} from '../e2e/support/fakeBankStore';

describe('seedEnglishCases', () => {
  it('siembra casos completos, publicados, con la fuente como primera referencia', () => {
    const store = createFakeBankStore();
    const seeded = seedEnglishCases(store, 2, { itemsPerCase: 3 });
    expect(seeded).toHaveLength(6);
    expect(store.cases.size).toBe(2);
    expect(store.catalog.size).toBe(6);
    for (const row of store.catalog.values()) {
      expect(row).toMatchObject({
        branch: 'medical_english',
        topic: 'reading_comprehension',
        language: 'en',
        task: 'data_interpretation',
        format: 'serial_case',
        caseSize: 3,
        status: 'published',
      });
      expect(row.subtopic.startsWith('english_')).toBe(true);
      expect(row.optionCount).toBe(4);
    }
    // El texto es la viñeta del caso, en inglés y marcado como simulado
    for (const clinicalCase of store.cases.values()) {
      expect(clinicalCase.vignette.startsWith('[Prueba] Simulated reading passage')).toBe(true);
    }
    // La referencia tiene la forma fija del plan y la lee la misma función de la app
    expect(FAKE_ENGLISH_SOURCE).toBe(
      'Fuente del texto. [Prueba] Texto simulado. Texto propio del equipo Studiare.',
    );
    for (const version of store.versions.values()) {
      expect(version.gpcRefs[0]?.title).toBe(FAKE_ENGLISH_SOURCE);
      expect(parsePassageSource(version.gpcRefs)).toEqual({
        ok: true,
        source: { title: '[Prueba] Texto simulado', license: 'team', url: null },
      });
    }
  });

  it('alterna 2 y 3 preguntas por caso, que es como suman los 30 reactivos de 12 casos', () => {
    const store = createFakeBankStore();
    seedEnglishCases(store, 12, { itemsPerCase: [2, 3] });
    const orders = new Map<string, number[]>();
    for (const version of store.versions.values()) {
      const list = orders.get(version.caseId ?? '') ?? [];
      list.push(version.caseOrder ?? 0);
      orders.set(version.caseId ?? '', list);
    }
    expect(orders.size).toBe(12);
    expect(store.versions.size).toBe(30);
    for (const list of orders.values()) {
      expect(list.sort()).toEqual(list.length === 2 ? [1, 2] : [1, 2, 3]);
    }
    expect(() => seedEnglishCases(store, 1, { itemsPerCase: 0 })).toThrow();
  });

  it('los cuerpos pasan los esquemas de la app y siguen contando entre una siembra y otra', () => {
    const store = createFakeBankStore();
    seedEnglishCases(store, 1, { itemsPerCase: 2 });
    seedEnglishCases(store, 1, { itemsPerCase: 2 });
    expect(store.cases.size).toBe(2);
    expect(new Set([...store.cases.values()].map((item) => item.caseKey)).size).toBe(2);
    expect(new Set([...store.questions.values()].map((item) => item.sourceKey)).size).toBe(4);
    for (const version of store.versions.values()) {
      const raw = bodyOf(version);
      expect(raw.language).toBe('en');
      expect(bodyEntitiesOf(raw)).not.toBeNull();
      expect(uuidToUlid(raw.versionId)).not.toBeNull();
    }
  });

  it('un caso en borrador no se publica', () => {
    const store = createFakeBankStore();
    seedEnglishCases(store, 1, { status: 'draft' });
    expect(store.catalog.size).toBe(0);
    expect(store.versions.size).toBe(3);
  });
});
