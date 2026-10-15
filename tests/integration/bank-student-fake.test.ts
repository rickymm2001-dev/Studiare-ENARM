// La app del alumno contra el banco simulado de Playwright (B11, paquete B). Comprueba sin navegador que
// la fuente de la nube, los reportes y el catálogo de mazos de la app hablan el mismo formato que
// tests/e2e/support/fakeBank.ts, que imita las funciones de 20261023000002 y 20261023000005. Así las
// e2e de la nube fallan por la app y no por el doble.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCloudSource } from '@/data/bank/cloudSource';
import { uuidToUlid } from '@/data/cloud/cloudIds';
import { DeckFileError } from '@/data/cloud/deckCatalog';
import { fetchDeckCatalog } from '@/data/cloud/deckCatalog';
import { makeUser, newId, testApi } from '@/data/testing/fixtures';
import { downloadCatalogSubject } from '@/data/usecases/catalogDecks';
import { cloudReporter, submitQuestionReport } from '@/data/usecases/contentReports';
import {
  advanceStudyDay,
  fakeBankDownload,
  fakeBankRpc,
  seedBank,
  seedCatalogDeck,
  setQuota,
} from '../e2e/support/fakeBank';
import {
  createFakeBankStore,
  seedPairs,
  type BankStudentRpc,
  type FakeBankCaller,
  type FakeBankStore,
} from '../e2e/support/fakeBankStore';

const disposers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

const caller = (overrides: Partial<FakeBankCaller> = {}): FakeBankCaller => ({
  userId: 'alumno',
  role: 'student',
  alias: 'Ana',
  activeDevice: true,
  plan: 'free',
  flags: { cloudBank: true },
  ...overrides,
});

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

function setup(who: FakeBankCaller = caller()) {
  const api = testApi('real');
  disposers.push(api.dispose);
  const store = createFakeBankStore();
  const client = clientOf(store, who);
  const source = createCloudSource({ repos: api.repos, cloud: () => client });
  return { api, store, source, client };
}

describe('la app del alumno y el banco simulado hablan lo mismo', () => {
  it('Gratis baja el catálogo y sus 20 preguntas del día, y al día siguiente se renueva', async () => {
    const { api, store, source } = setup();
    seedBank(store, 25);
    expect(await source.prepare()).toBe('ready');
    const pool = await source.pool();
    expect(pool.practice).toHaveLength(25);
    const ids = pool.practice.map((question) => question.id);
    const first = await source.ensureBodies(ids, 'practice');
    expect(first.ready).toHaveLength(20);
    expect(first.denied.map((item) => item.reason)).toEqual(Array(5).fill('daily_limit'));
    expect(first.quota).toMatchObject({ plan: 'free', used: 20, left: 0 });
    // Los cuerpos pasan los esquemas de la app, con su explicación
    const body = await api.repos.questions.get(first.ready[0] as string);
    expect(body?.explanation).toContain('[Prueba]');
    expect(await api.repos.options.listForQuestionVersion(first.ready[0] as string)).toHaveLength(
      4,
    );
    advanceStudyDay(store);
    const next = await source.ensureBodies(ids, 'practice');
    expect(next.ready).toHaveLength(25);
    expect(next.quota).toMatchObject({ used: 5, left: 15 });
  });

  it('con el banco cerrado no hay catálogo y un plan de pago frena con su hora', async () => {
    const closed = setup(caller({ flags: { cloudBank: false } }));
    seedBank(closed.store, 3);
    expect(await closed.source.prepare()).toBe('closed');

    const paid = setup(caller({ plan: 'monthly' }));
    seedBank(paid.store, 6);
    setQuota(paid.store, { perMinute: 4 });
    await paid.source.prepare();
    const ids = (await paid.source.pool()).practice.map((question) => question.id);
    const result = await paid.source.ensureBodies(ids, 'practice');
    expect(result.ready).toHaveLength(4);
    expect(result.denied.map((item) => item.reason)).toEqual(['brake', 'brake']);
    expect(result.quota?.limit).toBeNull();
    expect(Date.parse(result.quota?.brake.retryAt ?? '')).toBeGreaterThan(Date.now());
  });

  it('el reporte llega con la versión y un correo para el equipo, y el acuerdo dice sesgos con 30 pares', async () => {
    const { api, store, source, client } = setup();
    seedBank(store, 1);
    await source.prepare();
    const [question] = (await source.pool()).practice;
    await source.ensureBodies([question?.id ?? ''], 'practice');
    const sent = await submitQuestionReport(
      api,
      { reporterId: newId(), targetId: question?.id ?? '', reason: 'typo' },
      cloudReporter(client),
    );
    expect(sent).toMatchObject({ outcome: 'created', remote: 'sent' });
    expect(store.reports).toHaveLength(1);
    expect(store.outbox).toEqual([
      expect.objectContaining({ kind: 'content_report', recipientRole: 'team' }),
    ]);
    seedPairs(store, 30, 0.9, 'revisor');
    await source.refresh();
    expect(await api.repos.bankState.get('agreement')).toMatchObject({
      summary: { pairs: 30, vocabulary: 'bias', calibrating: false },
    });
  });

  it('un plan de pago baja una materia del catálogo con sus imágenes y Gratis no puede', async () => {
    const { api, store } = setup(caller({ plan: 'monthly' }));
    const seeded = seedCatalogDeck(store);
    const user = makeUser();
    await api.repos.users.put(user);
    const paidCaller = caller({ plan: 'monthly' });
    const list = await fetchDeckCatalog(clientOf(store, paidCaller));
    if (!list.ok) throw new Error('Sin catálogo');
    expect(list.value.canDownload).toBe(true);
    const deck = list.value.decks[0];
    if (!deck) throw new Error('Sin mazo');
    const files = {
      download(path: string) {
        const reply = fakeBankDownload(store, paidCaller, path);
        if ('bytes' in reply) return Promise.resolve(new Uint8Array(reply.bytes));
        return Promise.reject(
          new DeckFileError({ message: 'Object not found', status: reply.status }),
        );
      },
      record: () => true,
    };
    const result = await downloadCatalogSubject({
      api,
      user,
      deck,
      subject: deck.subjects[0] as NonNullable<(typeof deck.subjects)[0]>,
      files,
    });
    expect(result).toMatchObject({ notes: 3, images: 1 });
    expect(await api.repos.deckMedia.get(seeded.image)).toBeDefined();

    const free = await fetchDeckCatalog(clientOf(store, caller()));
    expect(free.ok && free.value.canDownload).toBe(false);
    expect(free.ok && free.value.decks[0]?.preview).toHaveLength(1);
    expect(
      fakeBankDownload(store, caller(), `${deck.deckKey}/v1/materia-simulada.json`),
    ).toMatchObject({ status: 400 });
    expect(uuidToUlid(deck.deckKey)).toBeNull();
  });
});
