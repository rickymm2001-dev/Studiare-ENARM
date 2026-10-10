// Reporte de errores del navegador (Fase G, G5, D-107). Escucha los errores sin atrapar y los rechazos
// sin atender, los convierte en un resumen sin datos de nadie y los manda a Supabase, pero solo si el
// alumno con sesión dio el permiso de mejora anónima. Mientras no se sabe su decisión los guarda en
// memoria, y si no hay permiso los descarta. Manda a lo mucho unos pocos por sesión, sin repetir.
import { cloudConfigured, loadCloud } from '@/data/cloud/client';
import { sendClientError } from '@/data/cloud/clientErrors';
import {
  buildClientErrorReport,
  type ClientErrorKind,
  type ClientErrorReport,
} from '@/data/telemetry/clientErrors';

/** Cuántos errores distintos se mandan por sesión de la pestaña */
export const MAX_REPORTS_PER_SESSION = 5;

type Sender = (report: ClientErrorReport) => Promise<unknown>;

async function defaultSend(report: ClientErrorReport): Promise<void> {
  if (!cloudConfigured()) return;
  const cloud = await loadCloud();
  if (cloud) await sendClientError(cloud, report);
}

interface ReporterState {
  /** null es que todavía no se sabe la decisión del alumno */
  allowed: boolean | null;
  waiting: ClientErrorReport[];
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

function deliver(report: ClientErrorReport): void {
  try {
    void Promise.resolve(state.send(report)).catch(() => undefined);
  } catch {
    // Mandar el reporte nunca debe causar otro error
  }
}

/** El permiso del alumno. Con permiso manda lo que esperaba. Sin él lo descarta */
export function setErrorReportingAllowed(allowed: boolean): void {
  state.allowed = allowed;
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
  if (state.allowed === null) state.waiting.push(report);
  else deliver(report);
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
