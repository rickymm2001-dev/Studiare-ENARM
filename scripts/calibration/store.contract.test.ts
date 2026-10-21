import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPgStore, type PgSql } from './pgStore.ts';
import { createRestStore } from './restStore.ts';
import {
  RPC,
  createStore,
  type CalibrationStore,
  type RpcCall,
  type RpcMethod,
  type RpcSpec,
} from './store.ts';

const MIGRATION = readFileSync(
  new URL('../../supabase/migrations/20261028000002_calibration_job.sql', import.meta.url),
  'utf8',
);

const RUN = '0b1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8';

/** Una llamada de ejemplo a cada método, con lo que haría la pipeline */
const CALLS: Record<RpcMethod, (store: CalibrationStore) => Promise<unknown>> = {
  begin: (s) =>
    s.begin({ trigger: 'selftest', forceDryRun: true, runner: { runId: '9', sha: 'abcdef0' } }),
  bank: (s) => s.bank(RUN),
  people: (s) => s.people(RUN),
  answers: (s) => s.answers(RUN, 10, 500),
  exposures: (s) => s.exposures(RUN, 10, 500),
  activity: (s) => s.activity(RUN, 'a1b2c3d4e5f60718:3', 500),
  motives: (s) => s.motives(RUN, 10, 500),
  labelPairs: (s) => s.labelPairs(RUN),
  publishItems: (s) => s.publishItems(RUN, [{ v: RUN }]),
  publishOptions: (s) => s.publishOptions(RUN, [{ v: RUN }]),
  publishPopulation: (s) => s.publishPopulation(RUN, { items: { calibrated: 1 } }),
  publishComparison: (s) => s.publishComparison(RUN, [{ cohort: 'all' }]),
  publishAgreement: (s) => s.publishAgreement(RUN, { pairs: 0 }),
  finish: (s) => s.finish(RUN, 'ok', null, { itemRows: 3 }),
};

const METHODS = Object.keys(RPC) as RpcMethod[];

/** Las firmas de las funciones calibration_* de la migración, con sus parámetros y lo que devuelven */
function sqlSignatures() {
  const signatures = new Map<string, { params: [string, string][]; returns: string }>();
  const pattern =
    /create or replace function public\.(calibration_[a-z_]+)\(([^)]*)\)\s*returns\s+(table\s*\([^)]*\)|\w+)/g;
  for (const match of MIGRATION.matchAll(pattern)) {
    const [, name, rawParams, returns] = match as unknown as [string, string, string, string];
    const params = rawParams
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .map((part) => {
        const parsed = /^(p_\w+)\s+(\w+)(?:\s+default\s+.+)?$/s.exec(part);
        if (!parsed) throw new Error(`No se entiende el parámetro ${part}`);
        return [parsed[1], parsed[2]] as [string, string];
      });
    signatures.set(name, { params, returns: returns.startsWith('table') ? 'table' : returns });
  }
  return signatures;
}

describe('la lista de RPC contra la migración', () => {
  const signatures = sqlSignatures();

  it('cada función de la lista existe en la migración con los mismos parámetros, tipos y retorno', () => {
    for (const method of METHODS) {
      const spec: RpcSpec = RPC[method];
      const sql = signatures.get(spec.name);
      expect(sql, `Falta ${spec.name} en la migración`).toBeDefined();
      expect(sql?.params, `Parámetros de ${spec.name}`).toEqual(
        spec.params.map(([name, type]) => [name, type]),
      );
      expect(sql?.returns, `Retorno de ${spec.name}`).toBe(spec.returns);
    }
  });

  it('las funciones que la llave de servicio ejecuta son exactamente las de la lista', () => {
    const granted = [
      ...MIGRATION.matchAll(
        /grant execute on function public\.(calibration_[a-z_]+)\([^)]*\) to service_role;/g,
      ),
    ]
      .map((match) => match[1])
      .sort();
    expect(granted).toEqual(METHODS.map((method) => RPC[method].name).sort());
  });

  it('las que cambian el estado de la corrida no se repiten y las demás sí', () => {
    expect(METHODS.filter((method) => !RPC[method].retry).sort()).toEqual(['begin', 'finish']);
  });

  it('las funciones de lectura de páginas llevan statement_timeout de 50 s en la migración', () => {
    for (const name of ['calibration_bank', 'calibration_answers', 'calibration_finish']) {
      const start = MIGRATION.indexOf(`create or replace function public.${name}(`);
      const header = MIGRATION.slice(start, MIGRATION.indexOf('as $$', start));
      expect(header).toContain("statement_timeout = '50s'");
    }
  });
});

describe('createStore', () => {
  it('cada método llama a su función con los parámetros de la lista, ni más ni menos', async () => {
    const seen = new Map<string, string[]>();
    const call: RpcCall = (spec, params) => {
      seen.set(spec.name, Object.keys(params));
      return Promise.resolve(null);
    };
    const store = createStore(call);
    for (const method of METHODS) await CALLS[method](store);
    for (const method of METHODS) {
      const spec: RpcSpec = RPC[method];
      expect(seen.get(spec.name), spec.name).toEqual(spec.params.map(([name]) => name));
    }
    expect(seen.size).toBe(METHODS.length);
  });
});

describe('los dos transportes usan la misma lista', () => {
  it('supabase-js llama a /rest/v1/rpc/{función} con los parámetros de la lista y la llave en apikey', async () => {
    const requests: {
      path: string;
      body: Record<string, unknown>;
      apikey: string | null;
      method: string;
    }[] = [];
    const fetcher: typeof fetch = (input, init) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      );
      const headers = new Headers(init?.headers);
      requests.push({
        path: url.pathname,
        body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
          string,
          unknown
        >,
        apikey: headers.get('apikey'),
        method: init?.method ?? 'GET',
      });
      return Promise.resolve(
        new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
    };
    const store = createRestStore({
      url: 'https://proyecto.supabase.co',
      key: 'sb_secret_llave_de_prueba',
      fetch: fetcher,
    });
    for (const method of METHODS) await CALLS[method](store);
    expect(requests).toHaveLength(METHODS.length);
    METHODS.forEach((method, index) => {
      const spec: RpcSpec = RPC[method];
      const request = requests[index];
      expect(request?.path).toBe(`/rest/v1/rpc/${spec.name}`);
      expect(request?.method).toBe('POST');
      expect(request?.apikey).toBe('sb_secret_llave_de_prueba');
      expect(Object.keys(request?.body ?? {})).toEqual(spec.params.map(([name]) => name));
    });
  });

  it('postgres.js ejecuta select public.{función}($1::tipo, ...) con el rol de servicio en cada llamada', async () => {
    const statements: { text: string; values: unknown[] | undefined }[] = [];
    const tx = {
      unsafe: (text: string, values?: unknown[]) => {
        statements.push({ text, values });
        return Promise.resolve([{ result: null }]);
      },
    };
    const sql = {
      begin: (work: (t: typeof tx) => Promise<unknown>) => work(tx),
    } as unknown as PgSql;
    const store = createPgStore(sql);
    for (const method of METHODS) await CALLS[method](store);
    expect(statements).toHaveLength(METHODS.length * 2);
    METHODS.forEach((method, index) => {
      const spec: RpcSpec = RPC[method];
      expect(statements[index * 2]?.text).toBe('set local role service_role');
      const call = statements[index * 2 + 1];
      const casts = spec.params
        .map(([, type], position) => `$${position + 1}::${type === 'jsonb' ? 'text::jsonb' : type}`)
        .join(', ');
      expect(call?.text).toBe(`select public.${spec.name}(${casts}) as result`);
      expect(call?.values).toHaveLength(spec.params.length);
    });
    // jsonb viaja como texto JSON y null como null
    const begin = statements[1];
    expect(begin?.values).toEqual(['selftest', true, '{"runId":"9","sha":"abcdef0"}']);
    const finish = statements.at(-1);
    expect(finish?.values).toEqual([RUN, 'ok', null, '{"itemRows":3}']);
  });
});
