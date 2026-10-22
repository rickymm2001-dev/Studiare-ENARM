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
  /**
   * Apple Pay y Google Pay dentro de Suscripción con Stripe.js (B17, 2.2). Se prende cuando el build trae
   * VITE_STRIPE_PUBLISHABLE_KEY con la forma que acepta walletPaymentsOf. Prendida abre Stripe en script-src,
   * frame-src y connect-src y deja que el navegador use la API de pagos (Permissions-Policy). Apagada o
   * ausente, la política queda exactamente como estaba y no nombra a Stripe
   */
  walletPayments?: boolean | undefined;
}

/**
 * Lo que sabe agregar buildHeadersFile además de la política (B17, 2.1). Son datos del build y no de la
 * política, por eso van aparte de CspOptions
 */
export interface HeadersFileExtra {
  /**
   * El build trae public/.well-known/apple-developer-merchantid-domain-association (B17, 6.3). Solo entonces se
   * escribe su regla de tipo de contenido, porque una regla para un archivo que no existe no sirve de nada
   */
  appleDomainFile?: boolean | undefined;
}

/** Dónde publica Cloudflare Pages el archivo con el que Apple verifica el dominio de Apple Pay (B17, 6.3) */
export const APPLE_DOMAIN_FILE_PATH = '/.well-known/apple-developer-merchantid-domain-association';

// Los orígenes de Stripe que abre walletPayments, cada uno con su porqué (B17, 2.2). La lista sale de la guía de
// seguridad de Stripe para Stripe.js y se confirma en un navegador real con la consola abierta (violaciones de
// política). Se suma solo lo que Stripe, Apple o Google digan bloqueado, y cada origen nuevo entra aquí con su
// comentario y su prueba en csp.test.ts. img-src, font-src y style-src no se tocan de entrada

/** script-src. Stripe.js y los archivos que baja de sus subdominios (js.stripe.com y *.js.stripe.com) */
export const STRIPE_SCRIPT_ORIGINS = ['https://js.stripe.com', 'https://*.js.stripe.com'] as const;
/** frame-src. Los marcos de Stripe.js (los botones de Apple y Google Pay son de Stripe) y la verificación 3D Secure (hooks) */
export const STRIPE_FRAME_ORIGINS = [
  'https://js.stripe.com',
  'https://*.js.stripe.com',
  'https://hooks.stripe.com',
] as const;
/** connect-src. La API de Stripe, que Stripe.js llama desde la página para confirmar el pago */
export const STRIPE_CONNECT_ORIGINS = ['https://api.stripe.com'] as const;

/**
 * Llave publicable de Stripe a partir de lo que se configura al construir. Solo acepta la forma pk_test_ o
 * pk_live_ seguida de letras y números, así una variable mal puesta, o una llave secreta (sk_, rk_) pegada por
 * error, no abre la política a Stripe ni llega al navegador. La llave publicable es pública por diseño
 */
export function stripePublishableKeyOf(value: string | undefined): string | undefined {
  const clean = (value ?? '').trim();
  return /^pk_(?:test|live)_[A-Za-z0-9]{16,256}$/.test(clean) ? clean : undefined;
}

/** Si el build trae una llave publicable con forma buena, que es lo que prende CspOptions.walletPayments */
export function walletPaymentsOf(value: string | undefined): boolean {
  return stripePublishableKeyOf(value) !== undefined;
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
  walletPayments,
}: CspOptions): [string, string][] {
  const stripe = walletPayments === true;
  return [
    ['default-src', "'self'"],
    // wasm-unsafe-eval deja compilar WebAssembly, que usa el lector de mazos de Anki (sql.js). No
    // permite eval ni scripts en línea. Con walletPayments suma Stripe.js, que solo carga Suscripción (B17).
    // Nunca unsafe-inline ni unsafe-eval: los botones de Stripe viven en marcos suyos
    [
      'script-src',
      ["'self' 'wasm-unsafe-eval'", ...(stripe ? STRIPE_SCRIPT_ORIGINS : [])].join(' '),
    ],
    // Los estilos en línea son los atributos style que pone React. Un estilo no ejecuta código
    ['style-src', "'self' 'unsafe-inline'"],
    ['img-src', "'self' data: blob:"],
    // Vite incrusta como data: las fuentes más chicas de 4 KB, y la política las bloquearía sin esto
    ['font-src', "'self' data:"],
    ['media-src', "'self' data: blob:"],
    // Solo el servidor propio (el proxy de IA local vive bajo /api) y, si están configurados, Supabase,
    // el proxy de IA alojado, la captura de PostHog y la ingesta de Sentry (B15). Los dos últimos solo
    // aquí: script-src no cambia, porque el SDK de Sentry es un archivo del propio sitio y la analítica
    // no carga scripts de fuera. La API de Stripe entra al final y solo con walletPayments (B17)
    [
      'connect-src',
      [
        "'self'",
        supabaseOrigin,
        aiOrigin,
        posthogOrigin,
        sentryOrigin,
        ...(stripe ? STRIPE_CONNECT_ORIGINS : []),
      ]
        .filter(Boolean)
        .join(' '),
    ],
    // Los lectores de archivos corren en workers del propio sitio, y canvas-confetti usa uno de blob
    ['worker-src', "'self' blob:"],
    ['manifest-src', "'self'"],
    // Sin marcos, salvo los de Stripe cuando walletPayments está prendido (B17)
    ['frame-src', stripe ? STRIPE_FRAME_ORIGINS.join(' ') : "'none'"],
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

/**
 * Permissions-Policy. Por omisión apaga la API de pagos del navegador (payment=()) para toda la página y sus
 * marcos. Con walletPayments la abre al propio sitio y a los marcos de Stripe, que son los que dibujan los
 * botones de Apple Pay y Google Pay (B17, H5). Sin esto el botón podría no aparecer. El Checkout hospedado de
 * Stripe corre en otro dominio y no depende de este encabezado
 */
export function buildPermissionsPolicy({ walletPayments }: CspOptions = {}): string {
  const payment =
    walletPayments === true
      ? `(self ${STRIPE_SCRIPT_ORIGINS.map((o) => `"${o}"`).join(' ')})`
      : '()';
  return `camera=(), microphone=(), geolocation=(), payment=${payment}, usb=()`;
}

/** Un año de caché inmutable para los archivos con huella que escribe Vite en assets/ (B17, 2.1) */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Encabezados para Cloudflare Pages o Netlify (_headers). La primera regla es la de seguridad, para todo el
 * sitio. Después, la caché larga de los archivos con huella, el tipo de contenido del archivo de Apple (solo si
 * el build lo trae) y noindex para las direcciones de pages.dev, que no son la pública (B17, 2.1)
 */
export function buildHeadersFile(options: CspOptions = {}, extra: HeadersFileExtra = {}): string {
  const rules: string[][] = [
    [
      '/*',
      `  Content-Security-Policy: ${buildHeaderCsp(options)}`,
      // Un año y sin includeSubDomains ni preload, para no comprometer otros subdominios del dominio
      '  Strict-Transport-Security: max-age=31536000',
      '  X-Content-Type-Options: nosniff',
      '  Referrer-Policy: strict-origin-when-cross-origin',
      `  Permissions-Policy: ${buildPermissionsPolicy(options)}`,
      '  X-Frame-Options: DENY',
    ],
    // Solo assets/. index.html, sw.js, workbox-*.js, manifest.webmanifest y lo de public conservan el valor de
    // Pages (must-revalidate con ETag), así el service worker y la página nueva se ven en el siguiente arranque
    ['/assets/*', `  Cache-Control: ${IMMUTABLE_CACHE_CONTROL}`],
    ...(extra.appleDomainFile === true
      ? [[APPLE_DOMAIN_FILE_PATH, '  Content-Type: text/plain; charset=utf-8']]
      : []),
    // Ni la dirección del proyecto ni las de cada versión son la pública. Solo el dominio propio se indexa
    ['https://:project.pages.dev/*', '  X-Robots-Tag: noindex'],
    ['https://:version.:project.pages.dev/*', '  X-Robots-Tag: noindex'],
  ];
  return `${rules.map((rule) => rule.join('\n')).join('\n\n')}\n`;
}

/**
 * Topes de Cloudflare Pages para _headers (B17, H4). Documenta 100 reglas y 2,000 caracteres por línea. Se
 * deja margen para que una política que crece, con otro proveedor, falle en las pruebas y no en la publicación
 */
export const HEADERS_FILE_LIMITS = { maxRules: 90, maxLineLength: 1800 } as const;

/**
 * Cuántas reglas (direcciones con sus encabezados) tiene un archivo _headers y cuál es su línea más larga.
 * Una regla empieza en una línea sin sangría. Lo usan csp.test.ts y la prueba del build
 */
export function headersFileStats(file: string): { rules: number; longestLine: number } {
  const lines = file.split('\n');
  return {
    rules: lines.filter((line) => line.trim() !== '' && !/^\s/.test(line)).length,
    longestLine: Math.max(0, ...lines.map((line) => line.length)),
  };
}

/** Lo que el archivo _headers pasa de los topes de HEADERS_FILE_LIMITS. Vacío si está bien */
export function headersFileProblems(file: string): string[] {
  const { rules, longestLine } = headersFileStats(file);
  const problems: string[] = [];
  if (rules > HEADERS_FILE_LIMITS.maxRules) {
    problems.push(`${String(rules)} reglas, el tope es ${String(HEADERS_FILE_LIMITS.maxRules)}`);
  }
  if (longestLine > HEADERS_FILE_LIMITS.maxLineLength) {
    problems.push(
      `una línea de ${String(longestLine)} caracteres, el tope es ${String(HEADERS_FILE_LIMITS.maxLineLength)}`,
    );
  }
  return problems;
}
