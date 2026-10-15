// Los casos de lectura en inglés del banco simulado (B13, paquete B). Comprueba sin navegador que
// seedEnglishCases deja casos que la app entiende igual que los de la nube, con la forma que pide el plan
// (7.5 y 6.3 de b13.md), para que las e2e de inglés fallen por la app y no por el doble. Todo el texto
// lleva [Prueba] y es simulado.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { bodyEntitiesOf } from '@/data/bank/bodies';
import { createCloudSource } from '@/data/bank/cloudSource';
import { uuidToUlid } from '@/data/cloud/cloudIds';
import { parsePassageSource } from '@/data/content/passageSource';
import { testApi } from '@/data/testing/fixtures';
import { bodyOf, fakeBankRpc, seedBank, setQuota } from '../e2e/support/fakeBank';
import {
  FAKE_ENGLISH_SOURCE,
  createFakeBankStore,
  seedEnglishCases,
  type BankStudentRpc,
  type FakeBankCaller,
  type FakeBankStore,
} from '../e2e/support/fakeBankStore';

const disposers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

const student: FakeBankCaller = {
  userId: 'alumno',
  role: 'student',
  alias: 'Ana',
  activeDevice: true,
  plan: 'free',
  flags: { cloudBank: true },
};

/** Un cliente de Supabase que contesta con el banco simulado, como lo hace fakeSupabase.ts */
function clientOf(store: FakeBankStore, who: FakeBankCaller) {
  return {
    rpc(name: string, args?: Record<string, unknown>) {
      const reply = fakeBankRpc(store, name as BankStudentRpc, who, args ?? {});
      if (!('json' in reply)) throw new Error('Respuesta sin JSON');
      return Promise.resolve(
        reply.status === 200
          ? { data: reply.json, error: null }
          : { data: null, error: reply.json as { code: string } },
      );
    },
  } as unknown as Pick<SupabaseClient, 'rpc'>;
}

function setup(who: FakeBankCaller = student) {
  const api = testApi('real');
  disposers.push(api.dispose);
  const store = createFakeBankStore();
  const client = clientOf(store, who);
  return { api, store, source: createCloudSource({ repos: api.repos, cloud: () => client }) };
}

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

describe('la app del alumno y los casos de inglés del banco simulado hablan lo mismo', () => {
  it('el pool separa el español del inglés y los casos de lectura llegan completos', async () => {
    const { api, store, source } = setup();
    seedBank(store, 25);
    seedEnglishCases(store, 2, { itemsPerCase: [2, 3] });
    expect(await source.prepare()).toBe('ready');
    const pool = await source.pool();
    expect(pool.practice).toHaveLength(25);
    expect(pool.english.practice).toHaveLength(5);
    expect(pool.english.exam).toHaveLength(5);
    expect(pool.practice.every((question) => question.language === 'es')).toBe(true);
    expect(pool.english.practice.every((question) => question.language === 'en')).toBe(true);

    // Los cuerpos bajan con el texto del caso, la fuente como primera referencia y el idioma
    const ids = pool.english.practice.map((question) => question.id);
    const result = await source.ensureBodies(ids, 'practice');
    expect(result.ready).toEqual(ids);
    const saved = await Promise.all(ids.map((id) => api.repos.questions.get(id)));
    expect(saved.every((question) => question?.language === 'en')).toBe(true);
    expect(parsePassageSource(saved[0]?.gpcRefs ?? [])).toMatchObject({ ok: true });
    const clinicalCase = await api.repos.cases.get(saved[0]?.caseId ?? '');
    expect(clinicalCase?.vignette).toContain('Simulated reading passage');
  });

  it('Gratis recibe un caso completo o nada, y no gasta del tope cuando se lo niegan', async () => {
    const { store, source } = setup();
    seedEnglishCases(store, 1, { itemsPerCase: 3 });
    // Quedan 2 y el texto trae 3
    setQuota(store, { freeDaily: 2 });
    await source.prepare();
    const ids = (await source.pool()).english.practice.map((question) => question.id);
    const denied = await source.ensureBodies(ids, 'practice');
    expect(denied.ready).toEqual([]);
    expect(denied.denied.map((item) => item.reason)).toEqual(Array(3).fill('daily_limit'));
    expect(denied.quota).toMatchObject({ used: 0, left: 2 });
    expect(store.reads).toHaveLength(0);

    // Con 3 libres gasta los 3
    setQuota(store, { freeDaily: 3 });
    const granted = await source.ensureBodies(ids, 'practice');
    expect(granted.ready).toEqual(ids);
    expect(granted.quota).toMatchObject({ used: 3, left: 0 });
    expect(store.reads).toHaveLength(3);
  });
});
