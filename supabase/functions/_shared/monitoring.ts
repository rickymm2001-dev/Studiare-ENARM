// Alertas de errores de las Edge Functions con Sentry (B15 del plan del cambio, 2.2 y 8.5). withMonitoring
// envuelve cada función: atrapa lo que lanza y las respuestas 5xx, responde igual que antes y avisa a Sentry
// con un evento que lleva el nombre de la función, el método, la ruta sin consulta, el estado, el mensaje
// limpio, la región y la versión. Es el único lugar de las funciones que habla con Sentry; una prueba de
// arquitectura (externalExits.test.ts) revisa que nadie más lo haga.
//
// Es un emisor propio y sin npm, porque @sentry/deno está en beta, Supabase advierte que comparte el
// contexto entre peticiones y las funciones no usan npm (D-096). Lo que se pierde son las trazas de
// rendimiento, que no se piden.
//
// Lo que nunca manda. El cuerpo, los encabezados, la consulta de la dirección (puede traer la ficha de baja),
// ids de personas ni datos de pago. El mensaje y la traza pasan por scrub, la copia generada de la limpieza
// del navegador (generated/scrub.ts), más una limpieza propia de las claves y los ids de los servicios que
// usan las funciones (Stripe, Resend, PostHog y Sentry), y al final se revisa el evento entero: si todavía
// trae un correo o un token, no sale.
//
// Documentación vigente que se siguió (sentry-docs en GitHub, develop-docs/sdk/foundations, leída el
// 2026-10-21). El DSN es https://{llave pública}@{host}/{proyecto}; el envío va a
// {host}/api/{proyecto}/envelope/ con X-Sentry-Auth versión 7 y Content-Type application/x-sentry-envelope.
// Un sobre son líneas JSON, la cabecera con event_id (32 caracteres hexadecimales) y sent_at, la cabecera del
// ítem con type y length y el evento, cada una con su salto de línea. El evento pide event_id, timestamp y
// platform. Sentry responde 200 con el id y 429 con Retry-After cuando se pasa de la cuota.
//
// Sin SENTRY_DSN no manda nada y deja una sola línea en el registro, sin datos. No depende de Deno, así se
// prueba con Vitest (D-096): quien lee el entorno es monitoringRuntime.ts, o el index.ts de admin-reset-mfa, y
// le pasa a withMonitoring las dependencias ya armadas con monitoringDepsFrom.
import { scrub } from './generated/scrub.ts';

/** Un DSN de Sentry en la nube. Solo https, la nube de Sentry (con us o de en medio si los trae) y sin llave secreta */
const DSN = /^https:\/\/([0-9a-f]{16,64})@(o\d+\.ingest(?:\.(?:us|de))?\.sentry\.io)\/(\d+)$/;

export interface SentryTarget {
  /** La dirección a la que va el sobre */
  endpoint: string;
  /** La llave pública del DSN, que va en X-Sentry-Auth */
  publicKey: string;
}

/** Lee un DSN. null si falta o no tiene la forma de uno de Sentry en la nube */
export function parseSentryDsn(dsn: string | undefined): SentryTarget | null {
  const match = DSN.exec((dsn ?? '').trim());
  if (match === null) return null;
  const [, publicKey, host, project] = match;
  if (publicKey === undefined || host === undefined || project === undefined) return null;
  return { endpoint: `https://${host}/api/${project}/envelope/`, publicKey };
}

export interface MonitoringDeps {
  /** SENTRY_DSN, el DSN del proyecto de funciones. Nunca se registra */
  dsn: string | undefined;
  fetch: typeof fetch;
  now: () => number;
  /** Un uuid nuevo, de donde sale el id del evento */
  uuid: () => string;
  /** SB_REGION */
  region: string;
  /** La versión desplegada de la función, DENO_DEPLOYMENT_ID */
  version: string;
  environment: string;
  log: (line: string) => void;
  /** Para no retrasar la respuesta mientras sale el aviso. Sin ella el aviso sale suelto, sin esperarlo */
  waitUntil?: ((work: Promise<unknown>) => void) | undefined;
  /** Cuánto se espera a Sentry antes de rendirse, en milisegundos. 3000 si falta */
  timeoutMs?: number | undefined;
}

/** Sentry contesta en una fracción de segundo. Si tarda más, el aviso se pierde y no se queda colgado */
export const SENTRY_TIMEOUT_MS = 3000;

/**
 * Las dependencias ya armadas o una función que las arma. La función se llama al avisar y no al cargar la
 * función, así un SENTRY_DSN que Ricardo pone después se nota sin volver a desplegar
 */
export type MonitoringSource = MonitoringDeps | (() => MonitoringDeps);
const depsOf = (source: MonitoringSource): MonitoringDeps =>
  typeof source === 'function' ? source() : source;

/**
 * Arma las dependencias desde un lector de variables de entorno, que quien llama saca de Deno. SENTRY_DSN es
 * el secreto de las funciones, SB_REGION y DENO_DEPLOYMENT_ID los pone Supabase. Una variable vacía cuenta
 * como ausente
 */
export function monitoringDepsFrom(
  read: (name: string) => string | undefined,
  waitUntil?: (work: Promise<unknown>) => void,
): MonitoringDeps {
  const value = (name: string): string | undefined => {
    const text = read(name)?.trim();
    return text === undefined || text === '' ? undefined : text;
  };
  return {
    dsn: value('SENTRY_DSN'),
    fetch,
    now: () => Date.now(),
    uuid: () => crypto.randomUUID(),
    region: value('SB_REGION') ?? 'desconocida',
    version: value('DENO_DEPLOYMENT_ID') ?? 'dev',
    environment: 'production',
    log: (line) => {
      console.error(line);
    },
    waitUntil,
  };
}

// ---------------------------------------------------------------------------------------------
// Limpieza

/**
 * Claves e ids de los servicios que usan las funciones, que la limpieza del navegador no conoce. Van antes
 * de scrub, que cambia los números largos por [n] y dejaría una clave a medias
 */
const SERVER_REDACTIONS: readonly [RegExp, string][] = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [clave]'],
  [/\b(?:re|phc|phx|sntrys|sntryu)_[A-Za-z0-9_-]{8,}/g, '[clave]'],
  // Los ids de Stripe llevan al menos un dígito, así una palabra como in_progress no se toma por uno
  [
    /\b(?:cus|sub|pi|in|ch|evt|price|prod|cs|si|pm|txn|py|seti|bpc|acct)_(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{6,}/g,
    '[id]',
  ],
  // Un host de proyecto de Supabase dice a qué proyecto pertenece, nada que sirva en un aviso
  [/\b[a-z0-9]{20}\.supabase\.co\b/g, '[proyecto]'],
];

/** Un texto sin datos de personas ni claves de servicios, recortado. keepLines conserva los saltos de línea */
export function scrubServerText(text: string, max: number, keepLines = false): string {
  let result = text;
  for (const [pattern, replacement] of SERVER_REDACTIONS) {
    result = result.replace(pattern, replacement);
  }
  return scrub(result, max, keepLines);
}

/** Lo último que se revisa antes de salir. Si el evento todavía trae un correo, un token o una clave, no sale */
const LEAKS: readonly RegExp[] = [
  /[\p{L}\p{N}._%+-]+(?:@|%40|＠)[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/u,
  // Una ficha o una huella larga. El event_id del sobre mide justo 32, por eso el piso es 33
  /[0-9a-f]{33,}/i,
  /eyJ[\w-]+\.[\w-]+\.[\w-]+/,
  /\bBearer\s+(?!\[clave\])\S+/i,
  /\b(?:re|phc|phx|sntrys|sntryu|sk|pk|rk|whsec)_[A-Za-z0-9_-]{8,}/,
];
export const leaksData = (text: string): boolean => LEAKS.some((pattern) => pattern.test(text));

// ---------------------------------------------------------------------------------------------
// El evento

const SDK = { name: 'studiare.edge', version: '1' } as const;
const MESSAGE_MAX = 300;
const STACK_MAX = 1500;
const STACK_LINES = 8;
const NAME_MAX = 60;

export interface FunctionErrorInput {
  /** El nombre de la función, como supabase/functions/{nombre} */
  name: string;
  method: string;
  /** La ruta sin consulta */
  path: string;
  /** El estado de la respuesta, o 500 si la función lanzó */
  status: number;
  /** Lo que lanzó la función, o null si fue una respuesta 5xx */
  error: unknown;
}

function describe(error: unknown): { type: string; message: string; stack: string | null } {
  if (error instanceof Error) {
    return {
      type: scrubServerText(error.name || 'Error', NAME_MAX),
      message: scrubServerText(error.message, MESSAGE_MAX),
      stack:
        typeof error.stack === 'string' && error.stack !== ''
          ? scrubServerText(
              error.stack.split('\n').slice(0, STACK_LINES).join('\n'),
              STACK_MAX,
              true,
            )
          : null,
    };
  }
  return {
    type: 'NonError',
    message:
      typeof error === 'string'
        ? scrubServerText(error, MESSAGE_MAX)
        : 'Se lanzó un valor que no es un Error',
    stack: null,
  };
}

/** El evento de una función que falló. Sin cuerpo, encabezados, consulta, usuario ni cookies */
export function buildFunctionEvent(
  deps: MonitoringDeps,
  input: FunctionErrorInput,
): Record<string, unknown> {
  const name = scrubServerText(input.name, NAME_MAX);
  const method = scrubServerText(input.method, 10);
  const path = scrubServerText(input.path, 80);
  const base = {
    event_id: deps.uuid().replace(/-/g, ''),
    timestamp: deps.now() / 1000,
    platform: 'javascript',
    level: 'error',
    logger: 'edge-function',
    release: scrubServerText(deps.version, 40) || 'dev',
    environment: scrubServerText(deps.environment, 20) || 'production',
    sdk: SDK,
    tags: {
      function: name,
      method,
      status: String(input.status),
      region: scrubServerText(deps.region, 20) || 'desconocida',
    },
    request: { method, url: path },
  };
  if (input.error === null) {
    const message = `Respuesta ${input.status} de la función ${name}`;
    return {
      ...base,
      message,
      fingerprint: ['edge-function', name, 'response', String(input.status)],
    };
  }
  const { type, message, stack } = describe(input.error);
  return {
    ...base,
    exception: { values: [{ type, value: message }] },
    ...(stack ? { extra: { stack } } : {}),
    fingerprint: ['edge-function', name, 'exception', type],
  };
}

/** El mensaje fijo de la prueba de alertas de las funciones. Sin datos de nadie, para reconocerlo en el correo */
export const MONITORING_TEST_MESSAGE = 'Prueba de alertas de Studiare, funciones';

/**
 * El evento del botón Mandar error de prueba del admin. Lleva el mensaje fijo y una huella propia en cada
 * prueba, así cada una abre su problema en Sentry y dispara el correo de la regla de alerta, que avisa de los
 * problemas nuevos
 */
export function buildTestEvent(deps: MonitoringDeps): Record<string, unknown> {
  const eventId = deps.uuid().replace(/-/g, '');
  return {
    event_id: eventId,
    timestamp: deps.now() / 1000,
    platform: 'javascript',
    level: 'error',
    logger: 'monitoring-test',
    release: scrubServerText(deps.version, 40) || 'dev',
    environment: scrubServerText(deps.environment, 20) || 'production',
    sdk: SDK,
    message: MONITORING_TEST_MESSAGE,
    tags: { function: 'monitoring-test', test: 'true' },
    fingerprint: ['monitoring-test', eventId],
  };
}

/**
 * El sobre de Sentry con un solo evento. Cada línea JSON termina en salto de línea y el ítem declara su
 * longitud en bytes. La cabecera no lleva el DSN: la autenticación va en X-Sentry-Auth
 */
export function buildEnvelope(deps: MonitoringDeps, event: Record<string, unknown>): string {
  const payload = JSON.stringify(event);
  const length = new TextEncoder().encode(payload).length;
  return (
    [
      JSON.stringify({ event_id: event.event_id, sent_at: new Date(deps.now()).toISOString() }),
      JSON.stringify({ type: 'event', length }),
      payload,
    ].join('\n') + '\n'
  );
}

/**
 * Manda un evento a Sentry. Devuelve si Sentry lo aceptó. false sin DSN, con un evento que todavía trae datos
 * de una persona, con una cuota agotada o sin respuesta. Nunca lanza
 */
export async function sendSentryEvent(
  deps: MonitoringDeps,
  event: Record<string, unknown>,
): Promise<boolean> {
  const target = parseSentryDsn(deps.dsn);
  if (target === null) return false;
  const envelope = buildEnvelope(deps, event);
  if (leaksData(envelope)) {
    deps.log(
      'Un evento de Sentry se descartó porque todavía traía datos de una persona o una clave',
    );
    return false;
  }
  try {
    const response = await deps.fetch(target.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-sentry-envelope',
        'x-sentry-auth': `Sentry sentry_version=7, sentry_client=${SDK.name}/${SDK.version}, sentry_key=${target.publicKey}`,
      },
      body: envelope,
      signal: AbortSignal.timeout(deps.timeoutMs ?? SENTRY_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// La envoltura

/** A lo más 20 avisos por minuto en cada instancia, para que un error repetido no agote la cuota */
const WINDOW_MS = 60_000;
const WINDOW_MAX = 20;

/** Una línea del registro sin datos, para cuando no hay DSN */
const quiet = (input: FunctionErrorInput): string =>
  `Error en ${scrubServerText(input.name, NAME_MAX)} (${input.error === null ? 'respuesta' : 'excepción'}, estado ${input.status}). Sin SENTRY_DSN no se avisa a Sentry`;

/**
 * Envuelve el manejador de una función. Responde igual que sin la envoltura: la respuesta pasa tal cual y lo
 * que lanza el manejador se vuelve a lanzar, después de avisar. El aviso sale con waitUntil si existe, así no
 * retrasa la respuesta
 */
export function withMonitoring(
  name: string,
  handler: (request: Request) => Response | Promise<Response>,
  source: MonitoringSource,
): (request: Request) => Promise<Response> {
  const recent: number[] = [];
  const report = (request: Request, status: number, error: unknown): void => {
    // Avisar nunca cambia lo que la función respondió ni el error que lanzó. Si algo de aquí falla (el entorno, el
    // registro o waitUntil, que no existe fuera de Supabase), el aviso se pierde y nada más
    try {
      const deps = depsOf(source);
      const input: FunctionErrorInput = {
        name,
        method: request.method,
        path: pathOf(request),
        status,
        error,
      };
      if (parseSentryDsn(deps.dsn) === null) {
        deps.log(quiet(input));
        return;
      }
      const now = deps.now();
      while (recent.length > 0 && (recent[0] ?? now) < now - WINDOW_MS) recent.shift();
      if (recent.length >= WINDOW_MAX) return;
      recent.push(now);
      const work = sendSentryEvent(deps, buildFunctionEvent(deps, input)).catch(() => false);
      if (deps.waitUntil) deps.waitUntil(work);
    } catch {
      // Nada que hacer: el aviso no vale una segunda falla
    }
  };

  return async (request) => {
    let response: Response;
    try {
      response = await handler(request);
    } catch (error) {
      report(request, 500, error);
      throw error;
    }
    if (response.status >= 500) report(request, response.status, null);
    return response;
  };
}

/**
 * Avisa de un error que pasó fuera de una petición, como en el trabajo en segundo plano de send-emails, donde
 * ya no lo ve la envoltura. Mismo evento, mismos datos y misma limpieza. Nunca lanza
 */
export function captureException(
  source: MonitoringSource,
  name: string,
  error: unknown,
): Promise<boolean> {
  try {
    const deps = depsOf(source);
    const input: FunctionErrorInput = {
      name,
      method: 'POST',
      path: `/${name}`,
      status: 500,
      error,
    };
    if (parseSentryDsn(deps.dsn) === null) {
      deps.log(quiet(input));
      return Promise.resolve(false);
    }
    const work = sendSentryEvent(deps, buildFunctionEvent(deps, input)).catch(() => false);
    if (deps.waitUntil) deps.waitUntil(work);
    return work;
  } catch {
    return Promise.resolve(false);
  }
}

/** La ruta de la petición sin consulta ni fragmento, que pueden traer la ficha de baja */
function pathOf(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return '/';
  }
}
