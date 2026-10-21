// La puerta de la calibración nocturna a la base (B14, 3.14 del plan de B14).
//
// CalibrationStore es lo único que el pipeline conoce de la base. Hay dos transportes que lo implementan,
// restStore.ts (supabase-js y la llave secreta, para la corrida real) y pgStore.ts (postgres.js por el
// socket del Postgres temporal, para el autotest). Los nombres de las RPC, sus parámetros y sus tipos
// viven en una sola lista, RPC, que los dos transportes usan igual. store.contract.test.ts la compara
// contra las firmas de la migración 20261028000002, así una función que cambia de firma rompe una prueba
// y no la corrida de la noche.
//
// Este archivo no sabe nada de la forma de lo que devuelven las funciones. Eso lo valida wire.ts.

export type RpcParamType = 'uuid' | 'bigint' | 'integer' | 'text' | 'boolean' | 'jsonb';

export interface RpcSpec {
  /** Nombre de la función en el esquema public */
  readonly name: string;
  /** Parámetros en el orden de la firma, con su tipo SQL */
  readonly params: readonly (readonly [string, RpcParamType])[];
  /**
   * Si repetir la llamada es seguro. Las exportaciones solo leen y las publicaciones guardan lo que ya
   * estaba sin duplicarlo. begin y finish cambian el estado de la corrida y no se repiten
   */
  readonly retry: boolean;
  /** Lo que devuelve la función, para saber qué esperar de un void */
  readonly returns: 'jsonb' | 'integer' | 'void';
}

const PAGE = [
  ['p_run', 'uuid'],
  ['p_after', 'bigint'],
  ['p_limit', 'integer'],
] as const;

export const RPC = {
  begin: {
    name: 'calibration_begin',
    params: [
      ['p_trigger', 'text'],
      ['p_force_dry_run', 'boolean'],
      ['p_runner', 'jsonb'],
    ],
    retry: false,
    returns: 'jsonb',
  },
  bank: { name: 'calibration_bank', params: [['p_run', 'uuid']], retry: true, returns: 'jsonb' },
  people: {
    name: 'calibration_people',
    params: [['p_run', 'uuid']],
    retry: true,
    returns: 'jsonb',
  },
  answers: { name: 'calibration_answers', params: PAGE, retry: true, returns: 'jsonb' },
  exposures: { name: 'calibration_exposures', params: PAGE, retry: true, returns: 'jsonb' },
  activity: {
    name: 'calibration_activity',
    params: [
      ['p_run', 'uuid'],
      ['p_after', 'text'],
      ['p_limit', 'integer'],
    ],
    retry: true,
    returns: 'jsonb',
  },
  motives: { name: 'calibration_motives', params: PAGE, retry: true, returns: 'jsonb' },
  labelPairs: {
    name: 'calibration_label_pairs',
    params: [['p_run', 'uuid']],
    retry: true,
    returns: 'jsonb',
  },
  publishItems: {
    name: 'calibration_publish_items',
    params: [
      ['p_run', 'uuid'],
      ['p_rows', 'jsonb'],
    ],
    retry: true,
    returns: 'integer',
  },
  publishOptions: {
    name: 'calibration_publish_options',
    params: [
      ['p_run', 'uuid'],
      ['p_rows', 'jsonb'],
    ],
    retry: true,
    returns: 'integer',
  },
  publishPopulation: {
    name: 'calibration_publish_population',
    params: [
      ['p_run', 'uuid'],
      ['p_data', 'jsonb'],
    ],
    retry: true,
    returns: 'void',
  },
  publishComparison: {
    name: 'calibration_publish_comparison',
    params: [
      ['p_run', 'uuid'],
      ['p_rows', 'jsonb'],
    ],
    retry: true,
    returns: 'integer',
  },
  publishAgreement: {
    name: 'calibration_publish_agreement',
    params: [
      ['p_run', 'uuid'],
      ['p_data', 'jsonb'],
    ],
    retry: true,
    returns: 'jsonb',
  },
  finish: {
    name: 'calibration_finish',
    params: [
      ['p_run', 'uuid'],
      ['p_status', 'text'],
      ['p_reason', 'text'],
      ['p_counts', 'jsonb'],
    ],
    retry: false,
    returns: 'jsonb',
  },
} as const satisfies Record<string, RpcSpec>;

export type RpcMethod = keyof typeof RPC;

/** Cómo un transporte ejecuta una función. Devuelve el valor ya convertido de JSON */
export type RpcCall = (
  spec: RpcSpec,
  params: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

/**
 * Un fallo de la base o de la red, sin el mensaje que dio, que puede traer valores. Lleva la función, el
 * SQLSTATE o el código de la pasarela, el estado HTTP y un tipo en una lista cerrada
 */
export class StoreError extends Error {
  readonly rpc: string;
  readonly code: string | null;
  readonly status: number | null;
  readonly kind: 'network' | 'store_error' | 'timeout';

  constructor(
    rpc: string,
    details: { code?: string | null; status?: number | null; kind?: StoreError['kind'] },
  ) {
    super(`La función ${rpc} falló`);
    this.name = 'StoreError';
    this.rpc = rpc;
    this.code = details.code ?? null;
    this.status = details.status ?? null;
    this.kind = details.kind ?? 'store_error';
  }
}

export interface BeginArgs {
  trigger: 'schedule' | 'manual' | 'selftest';
  forceDryRun: boolean;
  /** Solo el número de la corrida de GitHub y el commit */
  runner: { runId?: string; sha?: string };
}

/** Lo que el pipeline le pide a la base. Cada método es una función calibration_* */
export interface CalibrationStore {
  begin(args: BeginArgs): Promise<unknown>;
  bank(run: string): Promise<unknown>;
  people(run: string): Promise<unknown>;
  answers(run: string, after: number, limit: number): Promise<unknown>;
  exposures(run: string, after: number, limit: number): Promise<unknown>;
  activity(run: string, after: string | null, limit: number): Promise<unknown>;
  motives(run: string, after: number, limit: number): Promise<unknown>;
  labelPairs(run: string): Promise<unknown>;
  publishItems(run: string, rows: readonly unknown[]): Promise<unknown>;
  publishOptions(run: string, rows: readonly unknown[]): Promise<unknown>;
  publishPopulation(run: string, data: unknown): Promise<unknown>;
  publishComparison(run: string, rows: readonly unknown[]): Promise<unknown>;
  publishAgreement(run: string, data: unknown): Promise<unknown>;
  finish(
    run: string,
    status: 'ok' | 'partial' | 'failed',
    reason: string | null,
    counts: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
}

/** Arma el CalibrationStore sobre un transporte. Los dos usan esta misma función y la lista RPC */
export function createStore(call: RpcCall): CalibrationStore {
  const run = (method: RpcMethod, params: Record<string, unknown>) => call(RPC[method], params);
  return {
    begin: (args) =>
      run('begin', {
        p_trigger: args.trigger,
        p_force_dry_run: args.forceDryRun,
        p_runner: args.runner,
      }),
    bank: (runId) => run('bank', { p_run: runId }),
    people: (runId) => run('people', { p_run: runId }),
    answers: (runId, after, limit) =>
      run('answers', { p_run: runId, p_after: after, p_limit: limit }),
    exposures: (runId, after, limit) =>
      run('exposures', { p_run: runId, p_after: after, p_limit: limit }),
    activity: (runId, after, limit) =>
      run('activity', { p_run: runId, p_after: after, p_limit: limit }),
    motives: (runId, after, limit) =>
      run('motives', { p_run: runId, p_after: after, p_limit: limit }),
    labelPairs: (runId) => run('labelPairs', { p_run: runId }),
    publishItems: (runId, rows) => run('publishItems', { p_run: runId, p_rows: rows }),
    publishOptions: (runId, rows) => run('publishOptions', { p_run: runId, p_rows: rows }),
    publishPopulation: (runId, data) => run('publishPopulation', { p_run: runId, p_data: data }),
    publishComparison: (runId, rows) => run('publishComparison', { p_run: runId, p_rows: rows }),
    publishAgreement: (runId, data) => run('publishAgreement', { p_run: runId, p_data: data }),
    finish: (runId, status, reason, counts) =>
      run('finish', { p_run: runId, p_status: status, p_reason: reason, p_counts: counts }),
  };
}
