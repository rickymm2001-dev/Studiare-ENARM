// Lo que comparten los pasos de la herramienta de despliegue (docs/DESPLIEGUE.md). Las opciones, la
// salida en pantalla, los mensajes de error sin token ni valores y la confirmación antes de escribir.
import { ManagementApiError, type ManagementClient } from './managementApi.ts';
import { PlanError } from './plan.ts';

export interface Io {
  out(line: string): void;
  err(line: string): void;
  /** true solo si la persona escribió si */
  confirm(question: string): Promise<boolean>;
}

export interface DeployOptions {
  root: string;
  /** b10 o una ruta a un .json */
  plan: string | null;
  dryRun: boolean;
  only: 'migrations' | 'functions' | null;
  yes: boolean;
  /** JSON local con los secretos. Con él solo se ponen secretos */
  secretsFrom: string | null;
  client: ManagementClient;
  io: Io;
  /** De dónde sale el token, para decirlo sin mostrarlo */
  authNote: string;
}

export const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

export const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

function authHint(error: unknown): string {
  if (error instanceof ManagementApiError && error.status === 401) {
    return 'El token no sirve. Fuera de la sesión, revisa SUPABASE_ACCESS_TOKEN (supabase.com, Account, Access Tokens). En la sesión en la nube lo pone el proxy y se cambia en los secretos del entorno';
  }
  if (error instanceof ManagementApiError && error.status === 403) {
    return 'El token no tiene permiso sobre este proyecto';
  }
  return '';
}

export function errorText(error: unknown): string {
  if (error instanceof ManagementApiError || error instanceof PlanError) return error.message;
  if (error instanceof Error) return `${error.name}. ${error.message}`;
  return 'Error desconocido';
}

export function reportError(io: Io, prefix: string, error: unknown) {
  io.err(`${prefix}. ${errorText(error)}`);
  const hint = authHint(error);
  if (hint) io.err(hint);
}

/** Dice qué se va a escribir y pide un si, salvo con --yes */
export async function confirmWrites(
  options: DeployOptions,
  lines: readonly string[],
): Promise<boolean> {
  const { io } = options;
  io.out('');
  io.out(`Se va a escribir en el proyecto ${options.client.ref}`);
  for (const line of lines) io.out(`  ${line}`);
  if (options.yes) return true;
  const ok = await io.confirm(`¿Sigo? Escribe si para escribir en ${options.client.ref} `);
  if (!ok) io.err('No se escribió nada.');
  return ok;
}
