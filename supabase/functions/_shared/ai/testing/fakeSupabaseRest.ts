// La API REST de Supabase (PostgREST) simulada para el núcleo de IA (B12, 8.2). Es un fetch que contesta
// las funciones de la base que usa la Edge Function (ai_whoami, el libro v2, la cola de lotes, el
// secreto del ciclo) y las tablas platform_settings (clave ai_gate) y ai_config, sobre los puertos en
// memoria de memory.ts, que siguen las reglas de las migraciones 20261026000001 a 20261026000003.
// Revisa las llaves como el proyecto real. Las funciones del servidor piden la llave de servicio y
// ai_whoami el token del alumno con la llave pública. Contesta los errores con su código de Postgres.
import type { AiEngine, AiErrorCode, BatchEngine } from '../engines/aiContracts.ts';
import type { FinishPayload } from '../jobStore.ts';
import type {
  AiRole,
  BatchRowStatus,
  CallMode,
  CallOutcome,
  JobFinish,
  RequeueReason,
} from '../ports.ts';
import type { MemoryAi } from './memory.ts';

export interface FakeAccount {
  userId: string;
  /** El rol que da current_app_role, ya con el segundo factor de B9 */
  role: AiRole;
  /** user_plan(uid) distinto de free */
  paid: boolean;
  /** other es una cuenta activa en otro dispositivo, que la barrera rechaza con 42501 */
  device?: 'active' | 'other';
}

export interface FakeRestCall {
  method: string;
  /** Ruta sin la consulta, como /rest/v1/rpc/ai_admit_v2 */
  path: string;
  /** La llave que llegó en apikey */
  key: 'anon' | 'service' | 'other';
  /** El token que llegó en authorization */
  bearer: 'anon' | 'service' | 'user' | 'none';
}

export interface FakeSupabaseRest {
  url: string;
  anonKey: string;
  serviceKey: string;
  fetch: typeof fetch;
  calls: FakeRestCall[];
  /** Con true todo contesta 503, como Supabase caído */
  down: boolean;
  /** Los tokens de sesión. Un token que no está aquí, o expired, es una sesión vencida */
  accounts: Record<string, FakeAccount | 'expired'>;
  /** El valor de la fila de ai_config, o null si no hay fila */
  configRow: unknown;
  /** El secreto del ciclo de lotes en Vault, o null si Vault no lo tiene */
  tickSecret: string | null;
}

const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const pgError = (status: number, code: string) =>
  json({ code, message: 'error simulado', details: null, hint: null }, status);

type Args = Record<string, unknown>;
const str = (args: Args, name: string) => args[name] as string;
const num = (args: Args, name: string) => Number(args[name]);

export function createFakeSupabaseRest(options: {
  memory: MemoryAi;
  accounts?: Record<string, FakeAccount | 'expired'>;
  url?: string;
  anonKey?: string;
  serviceKey?: string;
  tickSecret?: string | null;
  configRow?: unknown;
}): FakeSupabaseRest {
  const { memory } = options;
  const fake: FakeSupabaseRest = {
    url: options.url ?? 'https://simulado.supabase.co',
    anonKey: options.anonKey ?? 'llave-publica-simulada-0000000000',
    serviceKey: options.serviceKey ?? 'llave-de-servicio-simulada-000000',
    calls: [],
    down: false,
    accounts: { ...options.accounts },
    configRow: options.configRow ?? null,
    tickSecret: options.tickSecret ?? null,
    fetch: (input, init) => handle(input, init),
  };

  const serviceRpc: Record<string, (args: Args) => Promise<unknown>> = {
    ai_admit_v2: async (args) => {
      const admission = await memory.ledger.admit({
        userId: str(args, 'p_user'),
        engine: str(args, 'p_engine') as AiEngine,
        staff: args.p_staff === true,
        perStudentPerDay: num(args, 'p_per_student'),
        dailyBudgetUsd: num(args, 'p_budget'),
        engineShare: num(args, 'p_engine_share'),
        perUserDailyUsd: num(args, 'p_user_budget'),
        generationRef: (args.p_generation as string | null) ?? null,
        maxGenerations: num(args, 'p_max_generations'),
        maxSections: num(args, 'p_max_sections'),
      });
      return admission.ok ? 'ok' : admission.reason;
    },
    ai_settle_v2: async (args) => {
      await memory.ledger.settle({
        userId: (args.p_user as string | null) ?? null,
        engine: str(args, 'p_engine') as AiEngine,
        model: str(args, 'p_model'),
        real: args.p_real === true,
        ok: args.p_ok === true,
        costUsd: num(args, 'p_cost'),
        inputTokens: num(args, 'p_input'),
        outputTokens: num(args, 'p_output'),
        cacheReadTokens: num(args, 'p_cache_read'),
        cacheWriteTokens: num(args, 'p_cache_write'),
        latencyMs: num(args, 'p_latency'),
        mode: str(args, 'p_mode') as CallMode,
        outcome: str(args, 'p_outcome') as CallOutcome,
        promptVersion: (args.p_prompt_version as string | null) ?? null,
        refusalCategory: (args.p_refusal as string | null) ?? null,
        jobId: (args.p_job as string | null) ?? null,
      });
      return undefined;
    },
    ai_release_v2: async (args) => {
      await memory.ledger.release({
        userId: str(args, 'p_user'),
        engine: str(args, 'p_engine') as AiEngine,
        generationRef: (args.p_generation as string | null) ?? null,
      });
      return undefined;
    },
    ai_usage_summary_v2: () => memory.ledger.summary(),
    ai_job_enqueue: (args) => {
      const result = memory.jobs.enqueueRow({
        userId: (args.p_user as string | null) ?? null,
        engine: str(args, 'p_engine') as BatchEngine,
        jobKey: str(args, 'p_job_key'),
        input: args.p_input,
        inputHash: str(args, 'p_input_hash'),
        promptVersion: str(args, 'p_prompt_version'),
        model: str(args, 'p_model'),
        maxPending: num(args, 'p_max_pending'),
      });
      return Promise.resolve(
        result.outcome === 'too_many_pending'
          ? { outcome: result.outcome, job: null }
          : { outcome: result.outcome, job: result.row },
      );
    },
    ai_job_status: (args) =>
      Promise.resolve(memory.jobs.statusRows(str(args, 'p_user'), args.p_job_keys as string[])),
    ai_jobs_claim: (args) => memory.jobs.claim(num(args, 'p_limit')),
    ai_jobs_submitted: async (args) => {
      await memory.jobs.submitted(
        str(args, 'p_claim'),
        str(args, 'p_batch_id'),
        args.p_estimates as Record<string, number>,
      );
      return undefined;
    },
    ai_jobs_unclaim: async (args) => {
      await memory.jobs.unclaim(str(args, 'p_claim'));
      return undefined;
    },
    ai_batches_due: (args) => memory.jobs.due(num(args, 'p_min_minutes')),
    ai_batch_mark: async (args) => {
      await memory.jobs.mark(str(args, 'p_batch_id'), str(args, 'p_status') as BatchRowStatus);
      return undefined;
    },
    ai_jobs_pending: (args) =>
      memory.jobs.pending(str(args, 'p_batch_id'), args.p_job_ids as string[]),
    ai_job_finish: async (args) => {
      const meta = args.p_meta as FinishPayload;
      const job = memory.jobs.rows.find((row) => row.id === str(args, 'p_job'));
      const result: JobFinish =
        args.p_status === 'ready' && meta.callMeta
          ? { status: 'ready', output: args.p_output, meta: meta.callMeta, costUsd: meta.costUsd }
          : {
              status: 'failed',
              error: str(args, 'p_error') as AiErrorCode,
              costUsd: meta.costUsd,
              refusalCategory: meta.refusalCategory,
              usage: {
                model: meta.model ?? job?.model ?? '',
                real: meta.real,
                inputTokens: meta.inputTokens,
                outputTokens: meta.outputTokens,
                cacheReadTokens: meta.cacheReadTokens,
                cacheWriteTokens: meta.cacheWriteTokens,
              },
            };
      await memory.jobs.finish(str(args, 'p_job'), result);
      return undefined;
    },
    ai_job_requeue: (args) =>
      memory.jobs.requeue(
        str(args, 'p_job'),
        args.p_issues as string[],
        str(args, 'p_reason') as RequeueReason,
      ),
    ai_jobs_scrub: () => memory.jobs.scrub(),
    ai_tick_lease_take: (args) => memory.jobs.lease(str(args, 'p_holder'), num(args, 'p_seconds')),
    ai_jobs_stale: (args) => memory.jobs.stale(num(args, 'p_min_minutes')),
    ai_tick_secret_ok: (args) =>
      Promise.resolve(fake.tickSecret !== null && args.p_candidate === fake.tickSecret),
  };

  const keyOf = (value: string | null): FakeRestCall['key'] =>
    value === fake.anonKey ? 'anon' : value === fake.serviceKey ? 'service' : 'other';
  const bearerOf = (header: string | null): FakeRestCall['bearer'] => {
    const token = /^Bearer (.+)$/.exec(header ?? '')?.[1];
    if (token === undefined) return 'none';
    if (token === fake.serviceKey) return 'service';
    if (token === fake.anonKey) return 'anon';
    return 'user';
  };

  async function handle(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const call: FakeRestCall = {
      method: request.method,
      path: url.pathname,
      key: keyOf(request.headers.get('apikey')),
      bearer: bearerOf(request.headers.get('authorization')),
    };
    fake.calls.push(call);
    if (fake.down) return json({ message: 'Supabase simulado caído' }, 503);
    if (!url.href.startsWith(fake.url)) return json({ message: 'otro sitio' }, 404);
    if (call.key === 'other') return json({ message: 'Invalid API key' }, 401);

    const rpc = /^\/rest\/v1\/rpc\/([a-z0-9_]+)$/.exec(url.pathname)?.[1];
    if (rpc !== undefined) {
      const args = (await request.json().catch(() => ({}))) as Args;
      if (rpc === 'ai_whoami') return whoami(request);
      const handler = serviceRpc[rpc];
      if (!handler) return pgError(404, 'PGRST202');
      if (call.key !== 'service' || call.bearer !== 'service') return pgError(401, '42501');
      try {
        return json(await handler(args));
      } catch {
        return pgError(400, '22023');
      }
    }

    if (url.pathname === '/rest/v1/platform_settings' && request.method === 'GET') {
      if (url.searchParams.get('key') !== 'eq.ai_gate') return json([]);
      return json([{ value: memory.gate.state }]);
    }

    if (url.pathname === '/rest/v1/ai_config') {
      if (call.key !== 'service' || call.bearer !== 'service') return pgError(401, '42501');
      if (request.method === 'GET')
        return json(fake.configRow === null ? [] : [{ value: fake.configRow }]);
      if (request.method === 'POST') {
        const body = (await request.json()) as { value?: unknown };
        fake.configRow = body.value ?? null;
        return new Response(null, { status: 201 });
      }
    }
    return json({ message: 'ruta simulada desconocida' }, 404);
  }

  function whoami(request: Request): Response {
    const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
    const account = token === undefined ? undefined : fake.accounts[token];
    if (account === undefined || account === 'expired') return pgError(401, 'PGRST301');
    if (account.device === 'other') return pgError(403, '42501');
    return json({ userId: account.userId, role: account.role, paid: account.paid });
  }

  return fake;
}
