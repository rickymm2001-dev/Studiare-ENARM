// Reporte de errores del navegador (Fase G, G5, D-107). Escucha los errores sin atrapar y los rechazos
// sin atender, los convierte en un resumen sin datos de nadie y los manda a Supabase, pero solo si el
// alumno con sesión dio el permiso de mejora anónima. Mientras no se sabe su decisión los guarda en
// memoria, y si no hay permiso los descarta. Manda a lo mucho unos pocos por sesión, sin repetir.
//
// Desde B15 (2.1) tiene un segundo destino, Sentry (sentrySink.ts), que solo funciona con la bandera
// errorMonitoring y un DSN. Los dos comparten el mismo permiso y el mismo límite de 5. El destino Supabase
// no depende de la bandera. Además del resumen limpio, a Sentry llega el error original, para que lea la
// traza y use los mapas de código, y sentrySink se encarga de que no lleve nada más.
import { isFeatureEnabled } from '@/config/featureFlags';
import { cloudConfigured, loadCloud } from '@/data/cloud/client';
import {
  buildClientErrorReport,
  type ClientErrorKind,
  type ClientErrorReport,
} from '@/data/telemetry/clientErrors';

/** Cuántos errores distintos se mandan por sesión de la pestaña */
export const MAX_REPORTS_PER_SESSION = 5;

/** Entrega un reporte y el error del que salió. El error original solo sirve al destino que lo necesita */
type Sender = (report: ClientErrorReport, error: unknown) => Promise<unknown>;

/** Los dos destinos. Se pueden cambiar en las pruebas */
export interface Destinations {
  supabase: (report: ClientErrorReport) => Promise<unknown>;
  sentry: (report: ClientErrorReport, error: unknown) => Promise<unknown>;
}

async function sendToSupabase(report: ClientErrorReport): Promise<void> {
  if (!cloudConfigured()) return;
  const cloud = await loadCloud();
  // El envío se baja aparte, solo cuando de verdad hay un reporte que mandar (B15, 5.4)
  if (cloud) await (await import('@/data/cloud/clientErrors')).sendClientError(cloud, report);
}

/**
 * Sentry. El módulo con su limpieza y su SDK se baja aparte, solo si la bandera está prendida y hay algo que
 * parezca un DSN. sentrySink.ts revisa que el DSN tenga la forma buena. Sin esto, quien no usa Sentry no
 * descargaría nada y el JavaScript inicial no crece por él (B15, 5.4)
 */
async function sendToSentry(report: ClientErrorReport, error: unknown): Promise<void> {
  const dsn: unknown = import.meta.env.VITE_SENTRY_DSN;
  if (!isFeatureEnabled('errorMonitoring') || typeof dsn !== 'string' || dsn.trim() === '') return;
  const { reportToSentry } = await import('./sentrySink');
  await reportToSentry(report, error);
}

const DESTINATIONS: Destinations = { supabase: sendToSupabase, sentry: sendToSentry };

/** Manda a los dos destinos. Que uno falle no frena al otro, y ninguno lanza */
export async function sendToDestinations(
  report: ClientErrorReport,
  error: unknown,
  destinations: Destinations = DESTINATIONS,
): Promise<void> {
  await Promise.allSettled([
    Promise.resolve().then(() => destinations.supabase(report)),
    Promise.resolve().then(() => destinations.sentry(report, error)),
  ]);
}

const defaultSend: Sender = (report, error) => sendToDestinations(report, error);

interface Waiting {
  report: ClientErrorReport;
  error: unknown;
}

interface ReporterState {
  /** null es que todavía no se sabe la decisión del alumno */
  allowed: boolean | null;
  waiting: Waiting[];
  seen: Set<string>;
  accepted: number;
  send: Sender;
}

const fresh = (): ReporterState => ({
  allowed: null,
  waiting: [],
  seen: new Set(),
  accepted: 0,
  send: defaultSend,
});
let state = fresh();

/** Deja el reporte como al abrir la pestaña. Lo usan las pruebas */
export function resetErrorReporter(send?: Sender): void {
  state = fresh();
  if (send) state.send = send;
}

function deliver({ report, error }: Waiting): void {
  try {
    void Promise.resolve(state.send(report, error)).catch(() => undefined);
  } catch {
    // Mandar el reporte nunca debe causar otro error
  }
}

/**
 * El permiso del alumno. Con permiso manda lo que esperaba. Sin él lo descarta. null es que se dejó de saber
 * (cambió la cuenta y todavía se lee su decisión), y lo que llegue espera sin mandarse ni tirarse
 */
export function setErrorReportingAllowed(allowed: boolean | null): void {
  state.allowed = allowed;
  if (allowed === null) return;
  const waiting = state.waiting;
  state.waiting = [];
  if (allowed) waiting.forEach(deliver);
}

/** El permiso que se conoce ahora. null es que todavía no se sabe */
export const errorReportingAllowed = (): boolean | null => state.allowed;

const appVersion = (): string => {
  const value: unknown = import.meta.env.VITE_BUILD_ID;
  return typeof value === 'string' && value !== '' ? value : 'dev';
};

function buildReport(kind: ClientErrorKind, error: unknown): ClientErrorReport | null {
  try {
    return buildClientErrorReport({
      kind,
      error,
      pathname: window.location.pathname,
      base: import.meta.env.BASE_URL,
      version: appVersion(),
    });
  } catch {
    // Reportar un error nunca debe causar otro
    return null;
  }
}

export function reportClientError(kind: ClientErrorKind, error: unknown): void {
  if (state.allowed === false) return;
  const report = buildReport(kind, error);
  if (!report || state.seen.has(report.fingerprint)) return;
  if (state.accepted >= MAX_REPORTS_PER_SESSION) return;
  state.seen.add(report.fingerprint);
  state.accepted += 1;
  if (state.allowed === null) state.waiting.push({ report, error });
  else deliver({ report, error });
}

/** Empieza a escuchar. Devuelve cómo dejar de escuchar */
export function installErrorReporter(target: Window = window): () => void {
  const onError = (event: ErrorEvent) => {
    reportClientError('error', event.error ?? event.message);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportClientError('rejection', event.reason);
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
