// Informe de un error del navegador (Fase G, G5, D-107). Convierte lo que lanzó la app en un resumen
// técnico sin datos de nadie. Quita correos, ids, claves, números largos y todo lo que va detrás de
// un signo de pregunta en una dirección, y recorta. No sabe de React, de Supabase ni del navegador.

export const CLIENT_ERROR_KINDS = ['error', 'rejection', 'render'] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

export interface ClientErrorReport {
  /** Hexadecimal de 16 caracteres. Dos errores iguales en la misma versión comparten huella */
  fingerprint: string;
  kind: ClientErrorKind;
  message: string;
  stack: string | null;
  /** La pantalla, con los ids cambiados por :id */
  screen: string;
  version: string;
}

export const MESSAGE_MAX = 300;
export const STACK_MAX = 1500;
export const SCREEN_MAX = 80;
export const VERSION_MAX = 40;
/** Líneas de la traza que se conservan. Las de más abajo casi nunca cambian el diagnóstico */
const STACK_LINES = 8;

// Se aplican en este orden. Las claves y los tokens van antes que los números largos
const REDACTIONS: readonly [RegExp, string][] = [
  // El motor del navegador copia un pedazo del texto que no pudo leer como JSON, y puede ser del alumno
  [/"[^"]*" is not valid JSON/g, '"[texto]" is not valid JSON'],
  [/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]'],
  [/\b(?:sk|pk|rk|whsec|sb_secret|sb_publishable)[-_][\w-]{8,}/gi, '[clave]'],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[correo]'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]'],
  [/\b[0-9A-HJKMNP-TV-Z]{26}\b/g, '[id]'],
  // Lo que va después de ? o # en una dirección puede traer tokens o textos del alumno
  [/([?#])[^\s)'"]+/g, '$1[q]'],
  // Los números de línea y columna del código llegan a 7 dígitos, un teléfono o una CURP tienen más
  [/\d{8,}/g, '[n]'],
];

/** Quita datos de personas y recorta. Conserva los saltos de línea solo si keepLines */
export function scrub(text: string, max: number, keepLines = false): string {
  let result = text;
  for (const [pattern, replacement] of REDACTIONS) result = result.replace(pattern, replacement);
  result = keepLines
    ? result.replace(/[^\P{Cc}\n]+/gu, ' ')
    : result.replace(/\p{Cc}+/gu, ' ').replace(/ {2,}/g, ' ');
  return result.trim().slice(0, max);
}

const ID_SEGMENT =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9A-HJKMNP-TV-Z]{26}|\d{4,})$/i;

/** La ruta sin la base de la app y con los ids cambiados por :id */
export function screenOf(pathname: string, base = '/'): string {
  const prefix = base.replace(/\/+$/, '');
  const rest =
    prefix !== '' && pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname;
  const segments = rest
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => (ID_SEGMENT.test(segment) ? ':id' : segment));
  return scrub(`/${segments.join('/')}`, SCREEN_MAX);
}

/** Hash de 53 bits (cyrb53) en 16 caracteres hexadecimales. No es criptográfico ni lo necesita */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(16).padStart(16, '0');
}

/** Nombre y mensaje del error. Lo que no es un Error se describe sin volcar su contenido */
function describe(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return {
      message: `${error.name}: ${error.message}`,
      stack: typeof error.stack === 'string' && error.stack !== '' ? error.stack : null,
    };
  }
  if (typeof error === 'string') return { message: error, stack: null };
  return { message: 'Se lanzó un valor que no es un Error', stack: null };
}

/** Errores que no dependen de la app y que no sirven para diagnosticar nada */
const NOISE: readonly RegExp[] = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Non-Error promise rejection captured/i,
];

export const isNoise = (message: string) => NOISE.some((pattern) => pattern.test(message));

export function buildClientErrorReport(input: {
  kind: ClientErrorKind;
  error: unknown;
  pathname: string;
  base?: string;
  version: string;
}): ClientErrorReport | null {
  const { message: rawMessage, stack: rawStack } = describe(input.error);
  const message = scrub(rawMessage, MESSAGE_MAX);
  if (message === '' || isNoise(message)) return null;
  const stack = rawStack
    ? scrub(rawStack.split('\n').slice(0, STACK_LINES).join('\n'), STACK_MAX, true) || null
    : null;
  const version = scrub(input.version, VERSION_MAX) || 'dev';
  // La huella no usa las columnas de la traza, que cambian con cada compilación de la misma versión
  const top = (stack ?? '')
    .split('\n')
    .slice(0, 2)
    .join('|')
    .replace(/:\d+:\d+/g, '');
  return {
    fingerprint: hashText(`${input.kind}|${message}|${top}|${version}`),
    kind: input.kind,
    message,
    stack,
    screen: screenOf(input.pathname, input.base),
    version,
  };
}
