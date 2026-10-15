// Pruebas de la función bank-sync (B11, 3.1 a 3.10 del plan de B11). La petición, quién puede llamarla,
// el modo forzado y que ningún registro lleve texto de los Sheets de prueba. Todo con el Google de
// mentira y la base en memoria.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFakeGoogle, type FakeGoogleOptions, type FakeSheetFixture } from './fakeGoogle.ts';
import { createGoogleClient, type ServiceAccountKey } from './google.ts';
import { createMemoryStore, type MemoryStoreOptions } from './memoryStore.ts';
import {
  CRON_TOKEN_HEADER,
  handleBankSync,
  parseApplyResults,
  parseBegin,
  parseVersionsContent,
  type BankSyncDeps,
} from './sync.ts';

const FIXTURES = resolve(import.meta.dirname, '../../../../tests/fixtures/bank-sheet');
const load = (name: string) =>
  JSON.parse(readFileSync(resolve(FIXTURES, `${name}.json`), 'utf8')) as FakeSheetFixture;
const antes = load('antes');
const despues = load('despues');
const CRON_TOKEN = 'ficha-de-cron-de-prueba-con-mas-de-32-caracteres';
const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const APP = 'https://studiare.example';

interface Setup {
  fixture?: FakeSheetFixture;
  google?: FakeGoogleOptions;
  store?: MemoryStoreOptions;
  env?: Partial<BankSyncDeps['env']>;
  failBegin?: boolean;
}

async function setup(options: Setup = {}) {
  const fixture = options.fixture ?? despues;
  const google = await createFakeGoogle([fixture], options.google);
  const store = createMemoryStore(options.store);
  const logs: string[] = [];
  const pending: Promise<unknown>[] = [];
  const clients: ServiceAccountKey[] = [];
  const runs: (string | null)[] = [];
  const authorizations: string[] = [];
  if (options.failBegin) store.begin = () => Promise.reject(new Error('sin base'));
  const deps: BankSyncDeps = {
    env: {
      appUrl: APP,
      serviceAccountKey: JSON.stringify(google.key),
      sheetId: fixture.spreadsheet.spreadsheetId,
      testSheetId: fixture.spreadsheet.spreadsheetId,
      ...options.env,
    },
    log: (line) => logs.push(line),
    authorizeAdmin: (authorization) => {
      authorizations.push(authorization);
      return Promise.resolve(authorization === 'Bearer sesion-de-admin' ? ADMIN : null);
    },
    cronOk: (token) => Promise.resolve(token === CRON_TOKEN),
    store,
    google: (key) => {
      clients.push(key);
      return createGoogleClient(key, {
        fetch: google.fetch,
        now: () => Date.now(),
        sleep: () => Promise.resolve(),
      });
    },
    waitUntil: (work) => pending.push(work),
    onRun: (runId) => runs.push(runId),
  };
  const call = async (init: RequestInit & { headers?: Record<string, string> } = {}) => {
    const response = await handleBankSync(
      new Request('https://proyecto.supabase.co/functions/v1/bank-sync', {
        method: 'POST',
        ...init,
      }),
      deps,
    );
    await Promise.all(pending);
    return { response, body: (await response.json().catch(() => null)) as unknown };
  };
  return { google, store, logs, pending, clients, runs, authorizations, deps, call };
}

describe('quién puede llamar a bank-sync', () => {
  it('sin ficha ni sesión responde 401 y no toca ni la base ni Google', async () => {
    const t = await setup();
    const { response, body } = await t.call();
    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
    expect(t.store.begins).toEqual([]);
    expect(t.clients).toEqual([]);
    expect(t.google.requests).toEqual([]);
  });

  it('una ficha de Cron equivocada responde 401 aunque traiga sesión', async () => {
    const t = await setup();
    const { response } = await t.call({
      headers: { [CRON_TOKEN_HEADER]: 'otra', authorization: 'Bearer sesion-de-admin' },
    });
    expect(response.status).toBe(401);
    expect(t.authorizations).toEqual([]);
    expect(t.store.begins).toEqual([]);
  });

  it('una sesión que no es de admin responde 401', async () => {
    const t = await setup();
    const { response } = await t.call({ headers: { authorization: 'Bearer alumno' } });
    expect(response.status).toBe(401);
    expect(t.store.begins).toEqual([]);
    expect(t.google.requests).toEqual([]);
  });

  it('OPTIONS responde 204 con CORS solo para la app y otro método 405', async () => {
    const t = await setup();
    const preflight = await handleBankSync(
      new Request('https://p.supabase.co/functions/v1/bank-sync', {
        method: 'OPTIONS',
        headers: { origin: APP },
      }),
      t.deps,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(APP);
    const foreign = await handleBankSync(
      new Request('https://p.supabase.co/functions/v1/bank-sync', {
        method: 'OPTIONS',
        headers: { origin: 'https://otro.example' },
      }),
      t.deps,
    );
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();
    const get = await handleBankSync(
      new Request('https://p.supabase.co/functions/v1/bank-sync'),
      t.deps,
    );
    expect(get.status).toBe(405);
  });
});

describe('corrida', () => {
  it('Cron con su ficha responde 202 y sigue en segundo plano con waitUntil', async () => {
    const t = await setup();
    const response = await handleBankSync(
      new Request('https://p.supabase.co/functions/v1/bank-sync', {
        method: 'POST',
        headers: { [CRON_TOKEN_HEADER]: CRON_TOKEN },
      }),
      t.deps,
    );
    expect(response.status).toBe(202);
    const body = (await response.json()) as { runId: string; status: string; mode: string };
    expect(body).toEqual({ runId: expect.any(String) as string, status: 'running', mode: 'apply' });
    expect(t.store.begins).toEqual([{ trigger: 'cron', target: 'real', actorId: null }]);
    expect(t.pending).toHaveLength(1);
    expect(t.store.finished).toEqual([]);
    await Promise.all(t.pending);
    expect(t.store.finished).toHaveLength(1);
    expect(t.store.finished[0]?.runId).toBe(body.runId);
    expect(t.store.finished[0]?.input.status).toBe('partial');
    expect(t.runs).toEqual([body.runId, null]);
  });

  it('Cron salta un Sheet sin cambios salvo que una pregunta pida la siguiente corrida', async () => {
    const cron = (t: Awaited<ReturnType<typeof setup>>) =>
      handleBankSync(
        new Request('https://p.supabase.co/functions/v1/bank-sync', {
          method: 'POST',
          headers: { [CRON_TOKEN_HEADER]: CRON_TOKEN },
        }),
        t.deps,
      ).then(() => Promise.all(t.pending));
    const first = await setup();
    await cron(first);
    const hash = first.store.finished[0]?.input.summary.sheetHash;
    expect(typeof hash).toBe('string');

    const same = await setup({ store: { begin: { lastSheetHash: String(hash) } } });
    await cron(same);
    expect(same.store.finished[0]?.input).toMatchObject({
      status: 'skipped',
      reason: 'no_changes',
    });

    const forced = await setup({
      store: {
        begin: { lastSheetHash: String(hash) },
        known: [
          {
            key: 'GO-0001',
            questionId: '00000000-0000-4000-8000-000000000001',
            rowHash: null,
            metaHash: null,
            latestVersionId: '00000000-0000-4000-8000-000000000002',
            latestSource: 'app',
            appliedVersionId: null,
            forceNext: true,
            conflictRowHash: null,
            status: 'active',
          },
        ],
      },
    });
    await cron(forced);
    expect(forced.store.finished[0]?.input.status).not.toBe('skipped');
    expect(forced.store.applied.length).toBeGreaterThan(0);
  });

  it('el admin con su sesión corre contra el Sheet real o el de prueba', async () => {
    const t = await setup({ env: { sheetId: 'no-existe' } });
    const real = await t.call({ headers: { authorization: 'Bearer sesion-de-admin' } });
    expect(real.response.status).toBe(202);
    expect(t.store.finished[0]?.input).toMatchObject({
      status: 'failed',
      reason: 'sheet_error:metadata:404',
    });

    const test = await t.call({
      headers: { authorization: 'Bearer sesion-de-admin', 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'test' }),
    });
    expect(test.response.status).toBe(202);
    expect(test.body).toMatchObject({ mode: 'dry_run' });
    expect(t.store.begins).toEqual([
      { trigger: 'manual', target: 'real', actorId: ADMIN },
      { trigger: 'manual', target: 'test', actorId: ADMIN },
    ]);
    expect(t.store.finished[1]?.input.status).toBe('partial');
  });

  it('una corrida saltada por la base responde 200 sin tocar Google', async () => {
    const t = await setup({ store: { begin: { status: 'skipped', reason: 'disabled' } } });
    const { response, body } = await t.call({ headers: { [CRON_TOKEN_HEADER]: CRON_TOKEN } });
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: 'skipped', reason: 'disabled' });
    expect(t.pending).toEqual([]);
    expect(t.google.requests).toEqual([]);
  });

  it('sin la llave o sin el Sheet cierra la corrida como not_configured', async () => {
    for (const env of [
      { serviceAccountKey: undefined },
      { sheetId: undefined },
      { serviceAccountKey: '{}' },
    ]) {
      const t = await setup({ env });
      const { response, body } = await t.call({ headers: { [CRON_TOKEN_HEADER]: CRON_TOKEN } });
      expect(response.status).toBe(200);
      expect(body).toMatchObject({ status: 'skipped', reason: 'not_configured' });
      expect(t.store.finished[0]?.input).toMatchObject({
        status: 'skipped',
        reason: 'not_configured',
      });
      expect(t.clients).toEqual([]);
      expect(t.google.requests).toEqual([]);
    }
  });

  it('si la base no puede empezar la corrida responde 500 sin detalles', async () => {
    const t = await setup({ failBegin: true });
    const { response, body } = await t.call({ headers: { [CRON_TOKEN_HEADER]: CRON_TOKEN } });
    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'internal' });
    expect(t.google.requests).toEqual([]);
  });
});

describe('modo forzado', () => {
  it('en solo reporte ningún renglón lleva la pregunta', async () => {
    const t = await setup({ store: { begin: { mode: 'dry_run' } } });
    await t.call({ headers: { [CRON_TOKEN_HEADER]: CRON_TOKEN } });
    const rows = t.store.applied.flatMap((call) => call.rows);
    expect(rows.length).toBe(24);
    expect(rows.every((row) => row.question === undefined)).toBe(true);
    expect(t.store.applied.every((call) => !call.forceDryRun)).toBe(true);
  });

  it('en aplicar los renglones buenos llevan la pregunta', async () => {
    const t = await setup();
    await t.call({ headers: { [CRON_TOKEN_HEADER]: CRON_TOKEN } });
    const rows = t.store.applied.flatMap((call) => call.rows);
    expect(rows.filter((row) => row.question !== undefined)).toHaveLength(13);
    expect(t.store.finished[0]?.input.reason).toBeNull();
  });

  it('con fórmulas en la columna ID baja a solo reporte aunque la base diga aplicar', async () => {
    const t = await setup({ fixture: antes });
    await t.call({ headers: { [CRON_TOKEN_HEADER]: CRON_TOKEN } });
    const rows = t.store.applied.flatMap((call) => call.rows);
    expect(rows.length).toBe(8);
    expect(rows.every((row) => row.question === undefined)).toBe(true);
    expect(t.store.applied.every((call) => call.forceDryRun)).toBe(true);
    expect(t.store.finished[0]?.input).toMatchObject({ status: 'partial', reason: 'id_formula' });
  });

  it('una pestaña sin columnas obligatorias falla con columns_missing sin aplicar', async () => {
    const broken: FakeSheetFixture = {
      ...despues,
      values: {
        ...despues.values,
        valueRanges: [
          {
            values: [
              ['ID', 'Pregunta'],
              ['GO-0001', 'x'],
            ],
          },
        ],
      },
    };
    const t = await setup({ fixture: broken });
    await t.call({ headers: { [CRON_TOKEN_HEADER]: CRON_TOKEN } });
    expect(t.store.applied).toEqual([]);
    expect(t.store.finished[0]?.input).toMatchObject({
      status: 'failed',
      reason: 'columns_missing',
    });
  });

  it('un 429 seguido de Google deja la corrida fallida con el paso y el código', async () => {
    const t = await setup({ google: { failWith: 429 } });
    await t.call({ headers: { [CRON_TOKEN_HEADER]: CRON_TOKEN } });
    expect(t.store.finished[0]?.input).toMatchObject({
      status: 'failed',
      reason: 'sheet_error:metadata:429',
    });
  });
});

describe('registros', () => {
  it('ningún registro lleva texto de los Sheets de prueba ni la llave', async () => {
    const lines: string[] = [];
    for (const fixture of [antes, despues]) {
      for (const env of [{}, { serviceAccountKey: undefined }]) {
        const t = await setup({ fixture, env });
        await t.call({ headers: { [CRON_TOKEN_HEADER]: CRON_TOKEN } });
        await t.call({ headers: { authorization: 'Bearer sesion-de-admin' } });
        lines.push(...t.logs);
      }
      const t = await setup({ fixture, google: { failWith: 403 } });
      await t.call({ headers: { [CRON_TOKEN_HEADER]: CRON_TOKEN } });
      lines.push(...t.logs);
    }
    expect(lines.length).toBeGreaterThan(8);
    const texts = new Set<string>();
    for (const fixture of [antes, despues]) {
      const ranges = fixture.values.valueRanges as { values?: unknown[][] }[];
      for (const range of ranges) {
        for (const row of range.values ?? []) {
          for (const cell of row) {
            if (typeof cell === 'string' && cell.trim().length >= 6) texts.add(cell.trim());
          }
        }
      }
    }
    expect(texts.size).toBeGreaterThan(100);
    const joined = lines.join('\n');
    for (const text of texts) expect(joined).not.toContain(text);
    for (const id of ['GO-0001', 'GO-0016', 'GO-C001']) expect(joined).not.toContain(id);
    expect(joined).not.toContain('PRIVATE KEY');
    expect(joined).not.toContain(CRON_TOKEN);
    expect(joined).not.toContain('sesion-de-admin');
  });
});

describe('respuestas de la base', () => {
  it('parseBegin exige la corrida y limpia lo demás', () => {
    expect(() => parseBegin(null)).toThrow();
    expect(() => parseBegin({ runId: 'r', status: 'otro' })).toThrow();
    const begin = parseBegin({
      runId: 'r',
      status: 'running',
      mode: 'apply',
      target: 'test',
      settings: { tab: 'Banco', maxRows: 10 },
      known: [
        {
          key: 'GO-0001',
          questionId: 'q',
          latestVersionId: 'v',
          forceNext: true,
          status: 'retired',
        },
        { key: 'GO-0002' },
      ],
    });
    expect(begin.settings).toEqual({
      tab: 'Banco',
      maxRows: 10,
      idPattern: '^[A-Z]{2,4}-[0-9]{4,5}$',
    });
    expect(begin.known).toEqual([
      {
        key: 'GO-0001',
        questionId: 'q',
        rowHash: null,
        metaHash: null,
        latestVersionId: 'v',
        latestSource: null,
        appliedVersionId: null,
        forceNext: true,
        conflictRowHash: null,
        status: 'retired',
      },
    ]);
    expect(parseBegin({ runId: 'r', status: 'skipped', mode: 'x' }).mode).toBe('dry_run');
  });

  it('parseApplyResults y parseVersionsContent ignoran lo que no tiene forma', () => {
    expect(
      parseApplyResults([
        { rowNumber: 2, outcome: 'created', questionId: 'q' },
        { rowNumber: 3, outcome: 'raro' },
        { outcome: 'created' },
      ]),
    ).toEqual([
      { rowNumber: 2, outcome: 'created', questionId: 'q' },
      { rowNumber: 3, outcome: 'rejected', questionId: null },
    ]);
    const contents = parseVersionsContent([
      { versionId: 'v1', content: { prompt: 'x' } },
      { versionId: 'v2' },
      'nada',
    ]);
    expect([...contents.keys()]).toEqual(['v1']);
  });
});
