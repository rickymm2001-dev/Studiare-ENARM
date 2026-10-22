// La función analytics-flush (B15 del plan del cambio, 1.7). Cron la llama cada 5 minutos con la ficha
// analytics_tick, solo si analytics está prendido y hay eventos de dinero pendientes. Toma hasta 100 con
// claim_analytics_batch, los manda a PostHog con la llave del proyecto y los cierra con
// finish_analytics_batch. Es el único lugar de las funciones que habla con PostHog; una prueba de
// arquitectura (externalExits.test.ts) revisa que nadie más lo haga.
//
// Qué sale. Solo los ocho eventos de dinero de 1.7, con propiedades que son valores de listas cerradas o
// sí y no, y el ID seudónimo del alumno como distinct_id. Nunca un correo, un nombre, el id de la cuenta ni
// un texto. Cada evento se vuelve a revisar contra la lista antes de salir, aunque la base ya lo revisó. Va
// con $process_person_profile en false (sin perfiles de persona, 8.8) y $geoip_disable, porque la IP que
// vería PostHog es la del servidor de las funciones y no dice nada del alumno (por confirmar al construir,
// 8.26)
//
// Documentación vigente que se siguió (PostHog en GitHub, contents/docs/api/capture.mdx, leída el
// 2026-10-21). POST {host}/batch/ con Content-Type application/json y { api_key, batch: [{ event,
// distinct_id, properties, timestamp }] }. El cuerpo mide menos de 20 MB. PostHog responde 200 aunque
// descarte un evento mal formado, por eso se revisan antes. Los hosts son us.i.posthog.com y
// eu.i.posthog.com. La llave es la del proyecto (phc_), pública; la personal (phx_) nunca se usa.
//
// Sin la llave o el host responde que falta la configuración y no reclama nada, así los eventos esperan.
// Nunca registra la llave ni el contenido de un evento. No depende de Deno, así se prueba con Vitest
// (D-096).
import { json, readJsonRecord } from './http.ts';
import type { QueuedAnalyticsEvent } from './supabase.ts';

export const ANALYTICS_TICK_HEADER = 'x-analytics-tick';
export const ANALYTICS_BATCH_SIZE = 100;

/** Los únicos servidores de captura que acepta, nube de EE. UU. y de la UE */
export const POSTHOG_HOSTS: readonly string[] = [
  'https://us.i.posthog.com',
  'https://eu.i.posthog.com',
];
/** La llave de proyecto de PostHog. La personal (phx_) y cualquier otra forma no valen */
const PROJECT_KEY = /^phc_[A-Za-z0-9]{20,100}$/;

const PLANS = ['founder', 'founder_annual', 'monthly', 'annual'] as const;
const METHODS = ['card', 'oxxo', 'spei', 'mercadopago'] as const;
const PURPOSES = ['subscription', 'pass'] as const;
const FLAG = [true, false] as const;

/**
 * Las propiedades que admite cada evento de dinero y los valores de cada una (1.5 y 1.7). Es la misma
 * lista que SERVER_ANALYTICS_EVENTS de src/data/analytics/catalog.ts y que la restricción de
 * analytics_outbox.event; analyticsFlush.test.ts las compara. Una propiedad puede faltar, porque un cobro
 * viejo puede no traer el método, pero nunca sobrar ni traer otro valor
 */
export const SERVER_EVENT_PROPS: Readonly<
  Record<string, Readonly<Record<string, readonly (string | boolean)[]>>>
> = {
  trial_started: { plan: PLANS },
  trial_converted: { plan: PLANS },
  trial_canceled: { plan: PLANS },
  payment_succeeded: { plan: PLANS, purpose: PURPOSES, method: METHODS, first: FLAG },
  subscription_cancel_scheduled: { plan: PLANS },
  subscription_canceled: { plan: PLANS },
  plan_changed: { from_plan: PLANS, to_plan: PLANS },
  refund_issued: { purpose: PURPOSES },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PosthogEvent {
  event: string;
  distinct_id: string;
  properties: Record<string, string | boolean>;
  timestamp: string;
}

/**
 * El evento como lo recibe PostHog, o null si no cumple la lista cerrada. No deja pasar nada que no esté
 * en SERVER_EVENT_PROPS ni un ID que no sea un uuid
 */
export function toPosthogEvent(queued: QueuedAnalyticsEvent): PosthogEvent | null {
  const allowed = SERVER_EVENT_PROPS[queued.event];
  if (allowed === undefined || !UUID.test(queued.analyticsId)) return null;
  const time = Date.parse(queued.occurredAt);
  if (Number.isNaN(time)) return null;
  const properties: Record<string, string | boolean> = {};
  for (const [name, value] of Object.entries(queued.properties)) {
    const values = allowed[name];
    if (
      values === undefined ||
      (typeof value !== 'string' && typeof value !== 'boolean') ||
      !values.includes(value)
    ) {
      return null;
    }
    properties[name] = value;
  }
  return {
    event: queued.event,
    distinct_id: queued.analyticsId,
    properties: {
      ...properties,
      $lib: 'studiare-server',
      // Sin perfiles de persona (8.8) y sin geolocalizar la IP del servidor de las funciones
      $process_person_profile: false,
      $geoip_disable: true,
    },
    timestamp: new Date(time).toISOString(),
  };
}

export interface AnalyticsFlushDeps {
  /** POSTHOG_PROJECT_KEY y POSTHOG_HOST, secretos de las funciones. Nunca se registran */
  env: { projectKey: string | undefined; host: string | undefined };
  fetch: typeof fetch;
  /** analytics_tick_ok, que compara contra el secreto de Vault */
  tickOk: (token: string) => Promise<boolean>;
  claim: (limit: number) => Promise<QueuedAnalyticsEvent[]>;
  finish: (
    ids: readonly string[],
    status: 'sent' | 'dropped' | 'failed' | 'queued',
  ) => Promise<void>;
  log: (line: string) => void;
}

export interface FlushSummary {
  claimed: number;
  sent: number;
  dropped: number;
  failed: number;
  /** Devueltos a la cola sin gastar el intento, porque PostHog rechazó la llave */
  returned: number;
}

type Posted = 'sent' | 'dropped' | 'failed' | 'rejected_key';

/** El único POST a PostHog. 200 salió bien; 400 y 413 no se arreglan reintentando; 401 y 403 son la llave */
async function postBatch(
  deps: AnalyticsFlushDeps,
  host: string,
  key: string,
  events: readonly PosthogEvent[],
): Promise<Posted> {
  let response: Response;
  try {
    response = await deps.fetch(`${host}/batch/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: key, batch: events }),
    });
  } catch {
    return 'failed';
  }
  if (response.ok) return 'sent';
  if (response.status === 401 || response.status === 403) return 'rejected_key';
  if (response.status === 400 || response.status === 413) return 'dropped';
  return 'failed';
}

export async function handleAnalyticsFlush(
  request: Request,
  deps: AnalyticsFlushDeps,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method' }, 405, {});
  // Solo Cron, con la ficha de Vault. Sin ella no se toca la cola
  const token = request.headers.get(ANALYTICS_TICK_HEADER) ?? '';
  if (token === '' || !(await deps.tickOk(token))) return json({ error: 'unauthorized' }, 401, {});
  await readJsonRecord(request);

  const { projectKey, host } = deps.env;
  if (
    projectKey === undefined ||
    host === undefined ||
    !PROJECT_KEY.test(projectKey) ||
    !POSTHOG_HOSTS.includes(host)
  ) {
    deps.log(
      'analytics-flush sin configuración. Falta POSTHOG_PROJECT_KEY (phc_) o POSTHOG_HOST (us.i.posthog.com o eu.i.posthog.com), y no se manda nada',
    );
    return json({ error: 'missing_configuration' }, 503, {});
  }

  const queued = await deps.claim(ANALYTICS_BATCH_SIZE);
  const summary: FlushSummary = {
    claimed: queued.length,
    sent: 0,
    dropped: 0,
    failed: 0,
    returned: 0,
  };
  if (queued.length === 0) return json(summary, 200, {});

  // Lo que no cumple la lista cerrada no sale nunca: se descarta
  const good: { id: string; event: PosthogEvent }[] = [];
  const invalid: string[] = [];
  for (const item of queued) {
    const event = toPosthogEvent(item);
    if (event === null) invalid.push(item.id);
    else good.push({ id: item.id, event });
  }
  if (invalid.length > 0) {
    await deps.finish(invalid, 'dropped');
    summary.dropped += invalid.length;
  }

  let status = 200;
  if (good.length > 0) {
    const ids = good.map((item) => item.id);
    const posted = await postBatch(
      deps,
      host,
      projectKey,
      good.map((item) => item.event),
    );
    if (posted === 'sent') {
      await deps.finish(ids, 'sent');
      summary.sent += ids.length;
    } else if (posted === 'dropped') {
      await deps.finish(ids, 'dropped');
      summary.dropped += ids.length;
    } else if (posted === 'rejected_key') {
      // El problema es la llave y no los eventos. Vuelven a la cola y la función avisa con un 503
      await deps.finish(ids, 'queued');
      summary.returned += ids.length;
      status = 503;
    } else {
      await deps.finish(ids, 'failed');
      summary.failed += ids.length;
    }
  }
  deps.log(
    `analytics-flush reclamó ${summary.claimed}, mandó ${summary.sent}, descartó ${summary.dropped}, falló ${summary.failed}, devolvió ${summary.returned}`,
  );
  return json(status === 503 ? { ...summary, error: 'posthog_rejected_key' } : summary, status, {});
}
