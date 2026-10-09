// Content Security Policy del build (14.3, Fase F). Una sola definición que sirve a las dos formas
// de entregarla. La etiqueta meta de index.html protege en cualquier alojamiento, incluido GitHub
// Pages, que no deja poner encabezados. El archivo _headers lo leen Cloudflare Pages y Netlify, y
// ahí sí vale frame-ancestors, que en una etiqueta meta el navegador ignora. Lo usan vite.config.ts
// y las pruebas.

export interface CspOptions {
  /** Origen del proyecto de Supabase, por ejemplo https://abc.supabase.co. Sin él no se permite ninguno */
  supabaseOrigin?: string | undefined;
}

/**
 * Origen de Supabase a partir de la URL que se configura al construir. Solo acepta el formato
 * oficial, así una variable mal puesta no abre la política a otro dominio
 */
export function supabaseOriginOf(url: string | undefined): string | undefined {
  const match = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.exec((url ?? '').trim());
  return match ? match[0].replace(/\/$/, '') : undefined;
}

/** Directivas que funcionan en una etiqueta meta y en un encabezado */
function sharedDirectives({ supabaseOrigin }: CspOptions): [string, string][] {
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
    // Solo el servidor propio (el proxy de IA vive bajo /api) y, si está configurado, Supabase
    ['connect-src', ["'self'", supabaseOrigin].filter(Boolean).join(' ')],
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
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    '  X-Frame-Options: DENY',
    '',
  ].join('\n');
}
