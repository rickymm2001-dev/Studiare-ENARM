// Content Security Policy del build (14.3, Fase F). Una sola definición que sirve a las dos formas
// de entregarla. La etiqueta meta de index.html protege en cualquier alojamiento, incluido GitHub
// Pages, que no deja poner encabezados. El archivo _headers lo leen Cloudflare Pages y Netlify, y
// ahí sí vale frame-ancestors, que en una etiqueta meta el navegador ignora. Lo usan vite.config.ts
// y las pruebas.

export interface CspOptions {
  /** Origen del proyecto de Supabase, por ejemplo https://abc.supabase.co. Sin él no se permite ninguno */
  supabaseOrigin?: string | undefined;
  /** Origen del proxy de IA alojado, por ejemplo https://ia.studiare.mx. Sin él, solo el propio sitio. Con la función de Supabase ya está permitido por supabaseOrigin */
  aiOrigin?: string | undefined;
  /** Origen de captura de PostHog (B15, 5.1). Solo uno de los dos que acepta posthogOriginOf. Sin él no se permite ninguno */
  posthogOrigin?: string | undefined;
  /** Origen del DSN de Sentry (B15, 5.1). Solo el que acepta sentryOriginOf. Sin él no se permite ninguno */
  sentryOrigin?: string | undefined;
}

/** Los dos orígenes de captura de PostHog Cloud, el de Estados Unidos y el de la Unión Europea (B15, 8.2) */
export const POSTHOG_ORIGINS = ['https://us.i.posthog.com', 'https://eu.i.posthog.com'] as const;

/**
 * Origen de captura de PostHog a partir de la dirección que se configura al construir. Solo acepta uno
 * de los dos de PostHog Cloud, sin ruta, así una variable mal puesta no abre la política a otro dominio
 */
export function posthogOriginOf(url: string | undefined): string | undefined {
  const clean = (url ?? '').trim().replace(/\/$/, '');
  return (POSTHOG_ORIGINS as readonly string[]).includes(clean) ? clean : undefined;
}

/**
 * Origen de ingesta de Sentry a partir de su DSN (B15, 5.1). Solo acepta la forma
 * https://llave@o{número}.ingest.sentry.io/{proyecto}, con us. o de. en medio si los trae. Un DSN con
 * otro dominio, sin proyecto o con una llave rara no abre la política
 */
export function sentryOriginOf(dsn: string | undefined): string | undefined {
  const match =
    /^https:\/\/[A-Za-z0-9]{8,64}(?::[^@/\s]*)?@(o\d{1,19}\.ingest\.(?:(?:us|de)\.)?sentry\.io)\/\d{1,19}$/.exec(
      (dsn ?? '').trim(),
    );
  return match ? `https://${match[1]}` : undefined;
}

/**
 * Origen de Supabase a partir de la URL que se configura al construir. Solo acepta el formato
 * oficial, así una variable mal puesta no abre la política a otro dominio
 */
export function supabaseOriginOf(url: string | undefined): string | undefined {
  const match = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.exec((url ?? '').trim());
  return match ? match[0].replace(/\/$/, '') : undefined;
}

/**
 * Origen del proxy de IA a partir de la dirección que se configura al construir. Acepta la dirección
 * con ruta, como la de la Edge Function, y se queda solo con el origen. Rechaza http, comodines,
 * espacios y cualquier cosa que no sea una dirección, así una variable mal puesta no abre la política
 * a otro dominio
 */
export function aiOriginOf(url: string | undefined): string | undefined {
  const match =
    /^(https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?)(\/[A-Za-z0-9._~/-]*)?$/i.exec(
      (url ?? '').trim(),
    );
  return match?.[1];
}

/** Directivas que funcionan en una etiqueta meta y en un encabezado */
function sharedDirectives({
  supabaseOrigin,
  aiOrigin,
  posthogOrigin,
  sentryOrigin,
}: CspOptions): [string, string][] {
  return [
    ['default-src', "'self'"],
    // wasm-unsafe-eval deja compilar WebAssembly, que usa el lector de mazos de Anki (sql.js). No
    // permite eval ni scripts en línea
    ['script-src', "'self' 'wasm-unsafe-eval'"],
    // Los estilos en línea son los atributos style que pone React. Un estilo no ejecuta código
    ['style-src', "'self' 'unsafe-inline'"],
    ['img-src', "'self' data: blob:"],
    // Vite incrusta como data: las fuentes más chicas de 4 KB, y la política las bloquearía sin esto
    ['font-src', "'self' data:"],
    ['media-src', "'self' data: blob:"],
    // Solo el servidor propio (el proxy de IA local vive bajo /api) y, si están configurados, Supabase,
    // el proxy de IA alojado, la captura de PostHog y la ingesta de Sentry (B15). Los dos últimos solo
    // aquí: script-src no cambia, porque el SDK de Sentry es un archivo del propio sitio y la analítica
    // no carga scripts de fuera
    [
      'connect-src',
      ["'self'", supabaseOrigin, aiOrigin, posthogOrigin, sentryOrigin].filter(Boolean).join(' '),
    ],
    // Los lectores de archivos corren en workers del propio sitio, y canvas-confetti usa uno de blob
    ['worker-src', "'self' blob:"],
    ['manifest-src', "'self'"],
    ['frame-src', "'none'"],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
  ];
}

const join = (directives: [string, string][]) =>
  directives.map(([name, value]) => `${name} ${value}`).join('; ');

/** Política para la etiqueta meta de index.html. Sin frame-ancestors, que ahí no vale */
export const buildMetaCsp = (options: CspOptions = {}): string => join(sharedDirectives(options));

/** Política para los encabezados. Agrega frame-ancestors, que impide que otro sitio meta la app en un marco */
export const buildHeaderCsp = (options: CspOptions = {}): string =>
  join([...sharedDirectives(options), ['frame-ancestors', "'none'"]]);

/** Encabezados de seguridad para Cloudflare Pages o Netlify (_headers) */
export function buildHeadersFile(options: CspOptions = {}): string {
  return [
    '/*',
    `  Content-Security-Policy: ${buildHeaderCsp(options)}`,
    // Un año y sin includeSubDomains ni preload, para no comprometer otros subdominios del dominio
    '  Strict-Transport-Security: max-age=31536000',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    '  X-Frame-Options: DENY',
    '',
  ].join('\n');
}
