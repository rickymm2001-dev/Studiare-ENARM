// Segundo destino del reporte de errores del navegador: Sentry (B15, 2.1, 2.3 y 2.4). Se manda a Supabase
// como siempre, y además a Sentry, pero solo si la bandera errorMonitoring está prendida, hay un DSN de
// Sentry con la forma buena y el alumno dio el permiso de mejora con tus datos sin nombre, que es el mismo
// permiso de errorReporter.ts. Un solo permiso para los dos destinos.
//
// El SDK se baja aparte, la primera vez que hay algo que mandar. No entra al JavaScript inicial. Se
// inicia sin ninguna de sus integraciones, que son las que escuchan errores, anotan migas, leen el
// navegador, la dirección o la IP. errorReporter.ts ya escucha los errores, aquí solo se entregan. Lo que
// sale pasa por scrubSentryEvent, que usa las mismas reglas de clientErrors.ts, y el evento nunca lleva
// usuario, cookies, encabezados, cuerpos ni la dirección con su consulta.
//
// Qué viaja. No es el error original sino una copia con el mismo nombre, el mensaje limpio y la traza del
// original, para que Sentry lea las líneas y use los mapas de código sin llevarse las propiedades de más que
// un error pueda traer (una respuesta, un cuerpo, un id).
import type * as SentryModule from '@sentry/browser';
import type { BrowserOptions, ErrorEvent, Exception, StackFrame } from '@sentry/browser';
import { sentryOriginOf } from '@/config/csp';
import { isFeatureEnabled, readAppEnv } from '@/config/featureFlags';
import type { MONITORING_TEST_MESSAGES } from '@/data/cloud/engagementContracts';
import { MESSAGE_MAX, scrub, type ClientErrorReport } from '@/data/telemetry/clientErrors';

/**
 * El mensaje fijo de la prueba de alertas del navegador. Es el de MONITORING_TEST_MESSAGES, que se repite
 * aquí con satisfies para no meter engagementContracts.ts (que arma sus esquemas al cargar) al JavaScript
 * inicial. Sin datos de nadie, para reconocerlo en el correo de Sentry
 */
export const BROWSER_TEST_MESSAGE =
  'Prueba de alertas de Studiare, navegador' satisfies typeof MONITORING_TEST_MESSAGES.browser;

/** El DSN de VITE_SENTRY_DSN si tiene la forma que acepta la CSP. null si falta o no la tiene */
export function readSentryDsn(env: Record<string, unknown> = import.meta.env): string | null {
  const raw = typeof env.VITE_SENTRY_DSN === 'string' ? env.VITE_SENTRY_DSN.trim() : '';
  return sentryOriginOf(raw) === undefined ? null : raw;
}

/** Si el destino Sentry está en pie: la bandera errorMonitoring y un DSN bueno. El permiso lo da quien llama */
export const sentryConfigured = (): boolean =>
  isFeatureEnabled('errorMonitoring') && readSentryDsn() !== null;

// ===================================================================== Limpieza del evento

/** La huella de un reporte, el hash de clientErrors.ts */
const HASH = /^[0-9a-f]{16}$/;
const FILENAME_MAX = 200;
const TYPE_MAX = 60;

/** Las etiquetas que el reporte pone y que sirven para agrupar. Cualquier otra se quita */
const KEPT_TAGS = ['screen', 'kind'] as const;

function scrubFrame(frame: StackFrame): StackFrame {
  const clean: StackFrame = {};
  // Solo lo que ubica la línea de código. Sin variables locales ni líneas de código de alrededor
  if (frame.function !== undefined) clean.function = scrub(frame.function, TYPE_MAX);
  if (frame.module !== undefined) clean.module = scrub(frame.module, FILENAME_MAX);
  if (frame.lineno !== undefined) clean.lineno = frame.lineno;
  if (frame.colno !== undefined) clean.colno = frame.colno;
  if (frame.in_app !== undefined) clean.in_app = frame.in_app;
  if (frame.debug_id !== undefined) clean.debug_id = frame.debug_id;
  if (frame.filename !== undefined) clean.filename = scrub(frame.filename, FILENAME_MAX);
  if (frame.abs_path !== undefined) clean.abs_path = scrub(frame.abs_path, FILENAME_MAX);
  return clean;
}

function scrubException(value: Exception): Exception {
  return {
    ...(value.type !== undefined ? { type: scrub(value.type, TYPE_MAX) } : {}),
    ...(value.value !== undefined ? { value: scrub(value.value, MESSAGE_MAX) } : {}),
    // El mecanismo dice cómo se capturó y no lleva datos del alumno. Se escribe de nuevo, no se copia
    mechanism: { type: 'generic', handled: true },
    ...(value.stacktrace?.frames
      ? { stacktrace: { frames: value.stacktrace.frames.map(scrubFrame) } }
      : {}),
  };
}

/**
 * Limpia un evento antes de que salga hacia Sentry, con las mismas reglas de clientErrors.ts. Quita correos,
 * ids, claves y consultas del mensaje y de los textos de la traza, y se deshace de todo lo que no sea el
 * error mismo, su traza, su versión y su pantalla. Devuelve un evento nuevo y no toca el que recibe
 */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  const clean: ErrorEvent = { type: undefined };
  // Lo que Sentry necesita para agrupar y mostrar
  if (event.event_id !== undefined) clean.event_id = event.event_id;
  if (event.timestamp !== undefined) clean.timestamp = event.timestamp;
  if (event.platform !== undefined) clean.platform = event.platform;
  if (event.level !== undefined) clean.level = event.level;
  if (event.release !== undefined) clean.release = event.release;
  if (event.environment !== undefined) clean.environment = event.environment;
  // La huella la arma clientErrors.ts, 16 caracteres hexadecimales. Cualquier otra cosa no se manda
  if (event.fingerprint?.every((item) => HASH.test(item))) clean.fingerprint = event.fingerprint;
  if (event.sdk !== undefined) clean.sdk = event.sdk;
  if (event.message !== undefined) clean.message = scrub(event.message, MESSAGE_MAX);
  if (event.logentry?.message !== undefined) {
    clean.logentry = { message: scrub(event.logentry.message, MESSAGE_MAX) };
  }
  if (event.exception?.values)
    clean.exception = { values: event.exception.values.map(scrubException) };
  if (event.tags) {
    const tags: Record<string, string> = {};
    for (const name of KEPT_TAGS) {
      const value = event.tags[name];
      if (typeof value === 'string') tags[name] = scrub(value, 80);
    }
    clean.tags = tags;
  }
  // Sin user, request, contexts, breadcrumbs, extra, transaction, server_name ni modules
  return clean;
}

// ===================================================================== Iniciar el SDK

/**
 * Las opciones de Sentry.init (2.1). Sin integraciones por omisión, así no hay escuchas globales, migas ni
 * datos del navegador. Nada de datos de personas en ninguna categoría de dataCollection, sin informes del
 * cliente y sin migas. beforeSend limpia lo que quede
 */
export function sentryOptions(
  dsn: string,
  extra: { release: string; environment: string },
): BrowserOptions {
  return {
    dsn,
    release: extra.release,
    environment: extra.environment,
    defaultIntegrations: false,
    integrations: [],
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    sendClientReports: false,
    maxBreadcrumbs: 0,
    beforeSend: scrubSentryEvent,
  };
}

type SentrySdk = typeof SentryModule;

let loading: Promise<SentrySdk | null> | undefined;

/** Baja el SDK una sola vez y lo inicia. null si no hay DSN o si el archivo no se pudo bajar */
function loadSentry(): Promise<SentrySdk | null> {
  const dsn = readSentryDsn();
  if (dsn === null) return Promise.resolve(null);
  loading ??= import('@sentry/browser')
    .then((sdk) => {
      const build: unknown = import.meta.env.VITE_BUILD_ID;
      sdk.init(
        sentryOptions(dsn, {
          release: typeof build === 'string' && build !== '' ? build : 'dev',
          environment: readAppEnv(),
        }),
      );
      return sdk;
    })
    // Un archivo que no baja, por una pestaña vieja o una red intermitente, no rompe nada
    .catch(() => {
      loading = undefined;
      return null;
    });
  return loading;
}

/** Deja el destino como al abrir la pestaña. Lo usan las pruebas */
export function resetSentrySink(): void {
  loading = undefined;
}

// ===================================================================== Mandar

const FRAME_LINE = /^\s*at\s|@.*:\d+:\d+\)?\s*$/;

/**
 * Una copia del error sin las propiedades de más. Lleva el nombre, el mensaje ya limpio y las líneas de la
 * traza del original. De un valor que no es un Error se arma uno con el mensaje del reporte
 */
export function safeCopy(report: ClientErrorReport, original: unknown): Error {
  if (!(original instanceof Error)) return new Error(report.message);
  const copy = new Error(scrub(original.message, MESSAGE_MAX));
  copy.name = scrub(original.name, TYPE_MAX) || 'Error';
  const frames = (original.stack ?? '').split('\n').filter((line) => FRAME_LINE.test(line));
  copy.stack = [`${copy.name}: ${copy.message}`, ...frames].join('\n');
  return copy;
}

/**
 * Manda un reporte a Sentry. No hace nada si el destino no está en pie. El permiso ya lo revisó
 * errorReporter.ts, que solo entrega con el permiso de mejora. Nunca lanza
 */
export async function reportToSentry(report: ClientErrorReport, original: unknown): Promise<void> {
  try {
    if (!sentryConfigured()) return;
    const sdk = await loadSentry();
    sdk?.captureException(safeCopy(report, original), {
      fingerprint: [report.fingerprint],
      tags: { screen: report.screen, kind: report.kind },
    });
  } catch {
    // Reportar un error nunca debe causar otro
  }
}

/**
 * La prueba de alertas del navegador, desde Plataforma, Correos y alertas (2.4). Manda el mensaje fijo, sin
 * datos de nadie, aunque el admin no haya dado el permiso de mejora, porque la pide a propósito y no lleva nada
 * suyo. Devuelve sent si salió hacia Sentry y blocked si no pudo salir: el destino no está en pie (sin
 * bandera o sin DSN), el archivo del SDK no bajó o un bloqueador lo frenó. Es la forma que espera
 * EngagementSettings.tsx (paquete A) en su propiedad sendBrowserTest
 */
export async function sendBrowserTestAlert(): Promise<'sent' | 'blocked'> {
  try {
    if (!sentryConfigured()) return 'blocked';
    const sdk = await loadSentry();
    if (!sdk) return 'blocked';
    sdk.captureMessage(BROWSER_TEST_MESSAGE, {
      level: 'error',
      tags: { screen: '/prueba', kind: 'test' },
    });
    // Que el sobre salga antes de que el admin cambie de pantalla
    await sdk.flush(2000);
    return 'sent';
  } catch {
    return 'blocked';
  }
}
