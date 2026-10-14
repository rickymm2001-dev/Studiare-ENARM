import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uuidToUlid } from '../cloud/cloudIds';
import { cloudId, fakeBankServer, wireBody, wireRow } from '../testing/bankCloud';
import { testApi } from '../testing/fixtures';
import type { CatalogRow } from './contracts';
import { CATALOG_REFRESH_MS, createCloudSource, fetchBatches } from './cloudSource';

const disposers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

const ulid = (uuid: string) => uuidToUlid(uuid) ?? '';

function setup(rows: CatalogRow[], options: Parameters<typeof fakeBankServer>[1] = {}) {
  const api = testApi('real');
  disposers.push(api.dispose);
  const bank = fakeBankServer(rows, options);
  const clock = { now: new Date('2026-10-20T18:00:00.000Z') };
  const discarded = vi.fn();
  const client: { current: typeof bank.server | null } = { current: bank.server };
  const source = createCloudSource({
    repos: api.repos,
    cloud: () => client.current,
    now: () => clock.now,
    onDiscarded: discarded,
  });
  return { api, source, bank, clock, client, discarded };
}

const rowsOf = (count: number, start = 1) =>
  Array.from({ length: count }, (_, index) => wireRow({ seq: start + index }));

describe('fuente de la nube (5.1 a 5.5)', () => {
  it('baja el catálogo por páginas hasta done y arma el pool sin texto y sin inglés', async () => {
    const rows = [
      ...rowsOf(3),
      wireRow({ seq: 4, examEligible: false, variantOf: cloudId() }),
      wireRow({
        seq: 5,
        language: 'en',
        branch: 'medical_english',
        topic: 'reading_comprehension',
      }),
      wireRow({ seq: 6, status: 'retired' }),
    ];
    const { source, bank, api } = setup(rows);
    expect(await source.prepare()).toBe('ready');
    expect(await api.repos.catalog.count()).toBe(6);
    expect(await api.repos.bankState.get('catalog')).toMatchObject({
      since: 6,
      complete: true,
      open: true,
    });
    const pool = await source.pool();
    expect(pool.practice).toHaveLength(4);
    expect(pool.exam.map((question) => question.id)).toEqual(
      rows.slice(0, 3).map((row) => ulid(row.versionId)),
    );
    expect(pool.practice[0]).toMatchObject({ isDemo: false, language: 'es', examEligible: true });
    // Una sola página y nada de cuerpos todavía
    expect(bank.server.calls.filter((call) => call.name === 'fetch_questions')).toHaveLength(0);
    expect(await api.repos.bankState.get('agreement')).toMatchObject({
      summary: { vocabulary: 'bias', pairs: 31 },
    });
  });

  it('pide desde el último seq y solo cambia lo nuevo', async () => {
    const rows = rowsOf(2);
    const { source, bank, api, clock } = setup(rows);
    await source.prepare();
    rows.push(wireRow({ seq: 3 }));
    rows.push({ ...(rows[0] as CatalogRow), status: 'retired', seq: 4 });
    clock.now = new Date(clock.now.getTime() + CATALOG_REFRESH_MS);
    expect(await source.prepare()).toBe('ready');
    await source.refresh();
    const sinces = bank.server.calls
      .filter((call) => call.name === 'catalog_changes')
      .map((call) => call.args?.p_since);
    expect(sinces).toEqual([0, 2]);
    expect((await source.pool()).practice.map((question) => question.id)).toEqual([
      ulid((rows[1] as CatalogRow).versionId),
      ulid((rows[2] as CatalogRow).versionId),
    ]);
    expect(await api.repos.catalog.count()).toBe(3);
  });

  it('sin conexión y sin catálogo bajado no cae al banco de demostración', async () => {
    const { source, bank, client } = setup(rowsOf(3));
    bank.state.offline = true;
    expect(await source.prepare()).toBe('never_downloaded');
    client.current = null;
    expect(await source.prepare()).toBe('never_downloaded');
    expect(await source.pool()).toEqual({ practice: [], exam: [] });
  });

  it('con el banco cerrado no hay nada que elegir', async () => {
    const { source } = setup(rowsOf(3), { open: false });
    expect(await source.prepare()).toBe('closed');
    expect(await source.pool()).toEqual({ practice: [], exam: [] });
  });

  it('Gratis baja hasta su tope, lo ya bajado no se vuelve a pedir y la cuota queda guardada', async () => {
    const rows = rowsOf(25);
    const { source, bank, api } = setup(rows);
    await source.prepare();
    const ids = rows.map((row) => ulid(row.versionId));
    const first = await source.ensureBodies(ids.slice(0, 10), 'practice');
    expect(first.ready).toEqual(ids.slice(0, 10));
    expect(first.denied).toEqual([]);
    expect(first.quota).toMatchObject({ used: 10, left: 10 });
    const saved = await api.repos.questions.get(ids[0] as string);
    expect(saved).toMatchObject({ editorialStatus: 'approved', isDemo: false });
    expect(await api.repos.options.listForQuestionVersion(ids[0] as string)).toHaveLength(4);

    // Las mismas otra vez no viajan al servidor
    const calls = bank.server.calls.length;
    const again = await source.ensureBodies(ids.slice(0, 10), 'review');
    expect(again.ready).toEqual(ids.slice(0, 10));
    expect(bank.server.calls).toHaveLength(calls);

    // Pedir 15 más da 10 y 5 negadas por el tope, y la sesión sigue con lo concedido
    const more = await source.ensureBodies(ids.slice(10, 25), 'practice');
    expect(more.ready).toEqual(ids.slice(10, 20));
    expect(more.denied).toEqual(ids.slice(20).map((id) => ({ id, reason: 'daily_limit' })));
    expect(more.quota).toMatchObject({ used: 20, left: 0 });
    expect((await api.repos.bankState.get('quota'))?.quota.left).toBe(0);
    expect(await source.quota()).toMatchObject({ left: 0 });
  });

  it('un caso seriado se pide en la misma tanda y se concede completo o nada', async () => {
    const caseId = cloudId();
    const caseRows = [1, 2, 3].map((order) =>
      wireRow({ seq: order, caseId, caseOrder: order, caseSize: 3, format: 'serial_case' }),
    );
    const loose = rowsOf(18, 4);
    const { source, api } = setup([...caseRows, ...loose]);
    await source.prepare();
    const looseIds = loose.map((row) => ulid(row.versionId));
    await source.ensureBodies(looseIds, 'practice');
    const caseIds = caseRows.map((row) => ulid(row.versionId));
    const denied = await source.ensureBodies(caseIds, 'practice');
    expect(denied.ready).toEqual([]);
    expect(denied.denied.map((item) => item.reason)).toEqual(Array(3).fill('daily_limit'));
    expect(await api.repos.cases.list()).toEqual([]);
  });

  it('una tanda nunca parte un caso y no pasa de 100', () => {
    const caseOf = (id: string) => (id.startsWith('c') ? 'caso' : null);
    const ids = [...Array.from({ length: 99 }, (_, index) => `q${index}`), 'c1', 'c2', 'c3'];
    const batches = fetchBatches(ids, caseOf);
    expect(batches.map((batch) => batch.length)).toEqual([99, 3]);
    expect(fetchBatches([], caseOf)).toEqual([]);
    expect(fetchBatches(['a', 'b', 'c'], () => null, 2)).toEqual([['a', 'b'], ['c']]);
  });

  it('un examen de 280 baja en tandas de 100 sin pasar del máximo del servidor', async () => {
    const rows = rowsOf(280);
    const { source, bank } = setup(rows, { freeLimit: 1000 });
    await source.prepare();
    const result = await source.ensureBodies(
      rows.map((row) => ulid(row.versionId)),
      'exam',
    );
    expect(result.ready).toHaveLength(280);
    const fetches = bank.server.calls.filter((call) => call.name === 'fetch_questions');
    expect(fetches.map((call) => (call.args?.p_version_ids as string[]).length)).toEqual([
      100, 100, 80,
    ]);
    expect(fetches.every((call) => call.args?.p_purpose === 'exam')).toBe(true);
  });

  it('sin conexión estudia con lo bajado y dice que faltó lo demás', async () => {
    const rows = rowsOf(6);
    const { source, bank, client } = setup(rows);
    await source.prepare();
    const ids = rows.map((row) => ulid(row.versionId));
    await source.ensureBodies(ids.slice(0, 3), 'practice');
    bank.state.offline = true;
    const result = await source.ensureBodies(ids, 'practice');
    expect(result.ready).toEqual(ids.slice(0, 3));
    expect(result.offline).toBe(true);
    expect(result.quota).toMatchObject({ used: 3 });
    client.current = null;
    expect((await source.ensureBodies(ids, 'practice')).offline).toBe(true);
    expect(await source.quota()).toMatchObject({ used: 3 });
    // Lo ya bajado no necesita conexión
    expect((await source.ensureBodies(ids.slice(0, 3), 'practice')).offline).toBe(false);
  });

  it('un cuerpo inválido se descarta completo y una retirada pide otra vez el catálogo', async () => {
    const rows = rowsOf(3);
    const { source, bank, discarded } = setup(rows);
    await source.prepare();
    const broken = rows[0] as CatalogRow;
    bank.bodies.set(broken.versionId, { ...wireBody(broken), prompt: '' });
    bank.state.deny.set((rows[1] as CatalogRow).versionId, 'retired');
    const ids = rows.map((row) => ulid(row.versionId));
    const catalogCalls = () =>
      bank.server.calls.filter((call) => call.name === 'catalog_changes').length;
    const before = catalogCalls();
    const result = await source.ensureBodies(ids, 'practice');
    expect(result.ready).toEqual([ids[2]]);
    expect(result.denied).toEqual([{ id: ids[1], reason: 'retired' }]);
    expect(discarded).toHaveBeenCalledWith('bodies', 1);
    await source.refresh();
    expect(catalogCalls()).toBeGreaterThan(before);
  });

  it('el catálogo descarta las filas que no puede guardar y avisa cuántas', async () => {
    const rows = [...rowsOf(2), { ...wireRow({ seq: 3 }), questionId: 'roto' }];
    const { source, api, discarded } = setup(rows);
    await source.prepare();
    expect(await api.repos.catalog.count()).toBe(2);
    expect(discarded).toHaveBeenCalledWith('catalog', 1);
  });

  it('dos pantallas que piden el catálogo a la vez comparten una sola bajada', async () => {
    const { source, bank } = setup(rowsOf(2));
    await Promise.all([source.refresh(), source.refresh()]);
    expect(bank.server.calls.filter((call) => call.name === 'catalog_changes')).toHaveLength(1);
  });
});
