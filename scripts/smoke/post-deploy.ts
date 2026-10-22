// Prueba de humo sin llaves para después de publicar (B17, 2.8 del plan de B17). Revisa con fetch que el sitio
// publicado responde lo que debe, sin ninguna llave y sin dependencias. Corre en el flujo de Cloudflare después
// de publicar y a mano. Uso
//   npm run smoke -- DIRECCIÓN [--mode production|preview] [--strict] [--apple] [--supabase DIRECCIÓN]
//   node --use-env-proxy scripts/smoke/post-deploy.ts DIRECCIÓN ...   en la sesión en la nube
// Código de salida. 0 si todo pasa, 1 si algo falla y 2 si los argumentos no sirven. Cada falla imprime la
// revisión y lo esperado, nunca el cuerpo completo de la respuesta.
//
// Variables de entorno opcionales, ninguna es una llave
//   SITE_URL                    la dirección pública que el build puso en canonical, og:image y sitemap. Sirve para
//                               probar un despliegue de pages.dev antes de ponerle el dominio. Si falta, es la
//                               dirección que se pasó en la línea de comandos
//   CLOUDFLARE_PAGES_PROJECT    el nombre del proyecto de Pages, para la revisión de noindex de pages.dev con
//                               --strict. Si falta, studiare
//
// El paso 0 de B17 dejó fijo el contrato (los argumentos, los tipos y los códigos de salida) y el paquete A llenó
// runSmoke con las revisiones de la tabla 2.8. Probarlo contra un build de verdad sin Cloudflare:
// scripts/smoke/local-pages.ts sirve una carpeta de build como lo hace Pages, con su _headers
import { resolve } from 'node:path';
import { sitemapLocations, siteUrlOf } from '../site-files.ts';

/** Producción es el dominio público. Preview es una vista previa, la demo local o pages.dev, que no se indexan */
export type SmokeMode = 'production' | 'preview';

export interface SmokeArgs {
  /** La dirección del sitio, https (o http solo en loopback), sin ruta y sin diagonal final */
  url: string;
  /** production por omisión, que es lo más exigente. Una vista previa pide --mode preview */
  mode: SmokeMode;
  /**
   * Producción en el dominio de verdad (2.8). Revisa que http redirija a https, que www redirija al dominio sin
   * www y que pages.dev responda noindex, y reintenta 5 veces cada 20 segundos porque el DNS y el certificado
   * tardan. Solo vale con mode production
   */
  strict: boolean;
  /** Pide el archivo de Apple en /.well-known/ y que no sea la portada (6.3) */
  apple: boolean;
  /** Dirección del proyecto de Supabase para revisar CORS de ai-proxy (https, sin ruta). null si no se pasó */
  supabase: string | null;
}

/** Una revisión con lo esperado y lo encontrado. Nunca lleva el cuerpo completo de la respuesta */
export interface SmokeCheck {
  /** Qué se revisó, por ejemplo "GET /repasar" o "Encabezados de /" */
  name: string;
  ok: boolean;
  expected: string;
  /** Lo que respondió el sitio, corto y sin datos de nadie */
  found: string;
}

export interface SmokeReport {
  checks: SmokeCheck[];
  /** true si todas las revisiones pasaron */
  ok: boolean;
}

/** Código de salida del proceso */
export const SMOKE_EXIT = { ok: 0, failed: 1, usage: 2 } as const;

/** Cuántas veces reintenta con --strict y cada cuántos milisegundos (2.8) */
export const STRICT_RETRIES = 5;
export const STRICT_RETRY_DELAY_MS = 20_000;

export const SMOKE_USAGE = [
  'Uso',
  '  npm run smoke -- DIRECCIÓN [--mode production|preview] [--strict] [--apple] [--supabase DIRECCIÓN]',
  'Opciones',
  '  DIRECCIÓN             el sitio, como https://tudominio.mx. http solo en 127.0.0.1 o localhost',
  '  --mode production     (por omisión) el dominio público, con canonical y sitemap',
  '  --mode preview        una vista previa o la demo local, con Disallow / y sin sitemap',
  '  --strict              producción en el dominio. http a https, www al dominio sin www, noindex en pages.dev. Reintenta',
  '  --apple               pide el archivo de Apple Pay en /.well-known/',
  '  --supabase DIRECCIÓN  revisa CORS de ai-proxy en ese proyecto de Supabase, sin llaves',
  'Variables de entorno, opcionales y sin llaves',
  '  SITE_URL                  la dirección pública del build, si se prueba otra (pages.dev antes de poner el dominio)',
  '  CLOUDFLARE_PAGES_PROJECT  nombre del proyecto de Pages para la revisión de --strict (studiare por omisión)',
  'Salida',
  '  0 si todo pasa, 1 si algo falla y 2 si los argumentos no sirven',
].join('\n');

export class SmokeUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmokeUsageError';
  }
}

/** Una dirección de sitio sin ruta ni diagonal final. https siempre, y http solo en loopback para vite preview */
function siteOrigin(raw: string, label: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SmokeUsageError(
      `${label} tiene que ser una dirección completa, como https://tudominio.mx`,
    );
  }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new SmokeUsageError(`${label} va con https, y http solo en 127.0.0.1 o localhost`);
  }
  if (url.username !== '' || url.password !== '') {
    throw new SmokeUsageError(`${label} no lleva usuario ni contraseña`);
  }
  if ((url.pathname !== '/' && url.pathname !== '') || url.search !== '' || url.hash !== '') {
    throw new SmokeUsageError(`${label} va sin ruta, sin consulta y sin fragmento`);
  }
  return url.origin;
}

/**
 * Lee los argumentos de la línea de comandos. Lanza SmokeUsageError con lo que está mal, sin repetir el valor
 * que llegó. Las opciones con valor aceptan --nombre=valor y --nombre valor. No toca la red
 */
export function parseSmokeArgs(argv: readonly string[]): SmokeArgs {
  let url: string | null = null;
  let mode: SmokeMode = 'production';
  let strict = false;
  let apple = false;
  let supabase: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index] ?? '';
    if (!raw.startsWith('--')) {
      if (url !== null) throw new SmokeUsageError('Solo va una dirección del sitio');
      url = siteOrigin(raw, 'La dirección del sitio');
      continue;
    }
    const [flag = '', inline] = raw.includes('=') ? raw.split(/=(.*)/s, 2) : [raw, undefined];
    const take = (): string => {
      if (inline !== undefined) return inline;
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new SmokeUsageError(`${flag} necesita un valor`);
      }
      index += 1;
      return value;
    };
    switch (flag) {
      case '--mode': {
        const value = take();
        if (value !== 'production' && value !== 'preview') {
          throw new SmokeUsageError('--mode acepta production o preview');
        }
        mode = value;
        break;
      }
      case '--strict':
        strict = true;
        break;
      case '--apple':
        apple = true;
        break;
      case '--supabase':
        supabase = siteOrigin(take(), '--supabase');
        break;
      default:
        throw new SmokeUsageError(
          `No conozco la opción número ${String(index + 1)}. La prueba de humo no usa llaves ni otras opciones`,
        );
    }
  }
  if (url === null) throw new SmokeUsageError('Falta la dirección del sitio');
  if (strict && mode !== 'production') {
    throw new SmokeUsageError('--strict solo vale con --mode production, que es el de por omisión');
  }
  return { url, mode, strict, apple, supabase };
}

/** Lo que runSmoke necesita del entorno. Se puede cambiar en las pruebas, para no esperar de verdad ni leer process.env */
export interface SmokeOptions {
  /** Por omisión process.env. Solo se leen SITE_URL y CLOUDFLARE_PAGES_PROJECT */
  env?: Readonly<Record<string, string | undefined>>;
  /** Por omisión una espera real. Con --strict se espera STRICT_RETRY_DELAY_MS entre intentos */
  sleep?: (ms: number) => Promise<void>;
}

/** Cuánto espera cada petición antes de darse por perdida */
const REQUEST_TIMEOUT_MS = 20_000;
/** La imagen para compartir pesa menos de esto (2.8). WhatsApp y Facebook descartan las muy grandes */
const OG_IMAGE_MAX_BYTES = 300 * 1024;
/** Un año de caché en segundos, el que pone _headers a los archivos con huella */
const ONE_YEAR = 31_536_000;
const FOREIGN_ORIGIN = 'https://origen-ajeno.example';
const PEEK_MAX = 80;

interface Reply {
  status: number;
  headers: Headers;
  /** El cuerpo como texto. Vacío si no se pidió leerlo */
  text: string;
  /** Bytes del cuerpo leído. 0 si no se leyó */
  bytes: number;
}

/** Una respuesta, o por qué no la hubo. Una red caída o un tiempo agotado se vuelven una falla en el informe */
type Fetched = { reply: Reply } | { failure: string };

/** Hace la petición y, si se pide, lee el cuerpo. Nunca lanza */
async function request(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit & { read?: 'text' | 'bytes' | 'none' } = {},
): Promise<Fetched> {
  const { read = 'text', ...rest } = init;
  try {
    const response = await fetchImpl(url, {
      ...rest,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    let text = '';
    let bytes = 0;
    if (read === 'text') {
      const buffer = await response.arrayBuffer();
      bytes = buffer.byteLength;
      text = new TextDecoder().decode(buffer);
    } else if (read === 'bytes') {
      bytes = (await response.arrayBuffer()).byteLength;
    } else {
      await response.body?.cancel();
    }
    return { reply: { status: response.status, headers: response.headers, text, bytes } };
  } catch (error) {
    const code = (error as { cause?: { code?: unknown } }).cause?.code;
    const name = error instanceof Error ? error.name : 'Error';
    return { failure: `sin respuesta (${typeof code === 'string' ? code : name})` };
  }
}

/** Lo corto de un cuerpo, para decir qué llegó cuando no era lo esperado. Nunca el cuerpo completo */
const peek = (text: string): string =>
  text.trim().replace(/\s+/g, ' ').slice(0, PEEK_MAX) || '(vacío)';

const looksLikeHtml = (reply: Reply): boolean =>
  (reply.headers.get('content-type') ?? '').toLowerCase().includes('text/html') ||
  /^\s*<(?:!doctype|html)/i.test(reply.text);

/** Una revisión que lee una respuesta y devuelve null si todo está bien o lo que encontró si no */
async function check(
  name: string,
  expected: string,
  run: () => string | null | Promise<string | null>,
): Promise<SmokeCheck> {
  try {
    const found = await run();
    return { name, ok: found === null, expected, found: found ?? 'ok' };
  } catch (error) {
    return {
      name,
      ok: false,
      expected,
      found: `la revisión falló (${error instanceof Error ? error.name : 'Error'})`,
    };
  }
}

const cacheControl = (reply: Reply): string =>
  (reply.headers.get('cache-control') ?? '').toLowerCase();

/** Los encabezados de seguridad de la tabla 2.8. Devuelve lo que falta, vacío si está todo */
function headerProblems(headers: Headers): string[] {
  const problems: string[] = [];
  const csp = headers.get('content-security-policy');
  if (csp === null) problems.push('falta Content-Security-Policy');
  else {
    if (!/(?:^|;\s*)default-src 'self'(?:;|$)/.test(csp))
      problems.push("la política no dice default-src 'self'");
    if (!/(?:^|;\s*)frame-ancestors 'none'(?:;|$)/.test(csp))
      problems.push("la política no dice frame-ancestors 'none'");
  }
  const hsts = headers.get('strict-transport-security');
  if (hsts === null) problems.push('falta Strict-Transport-Security');
  else {
    if (!/^max-age=31536000\b/.test(hsts.trim())) problems.push('HSTS no es de un año');
    if (/includesubdomains|preload/i.test(hsts))
      problems.push('HSTS trae includeSubDomains o preload');
  }
  if ((headers.get('x-content-type-options') ?? '').toLowerCase() !== 'nosniff') {
    problems.push('falta X-Content-Type-Options nosniff');
  }
  if ((headers.get('x-frame-options') ?? '').toUpperCase() !== 'DENY') {
    problems.push('falta X-Frame-Options DENY');
  }
  if (headers.get('referrer-policy') === null) problems.push('falta Referrer-Policy');
  if (headers.get('permissions-policy') === null) problems.push('falta Permissions-Policy');
  return problems;
}

/** Las direcciones de /assets/ que index.html carga, en el orden en que aparecen, ya resueltas contra el sitio */
function assetUrls(html: string, origin: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+\.(?:js|css))"/g)) {
    const raw = match[1];
    if (raw !== undefined) urls.push(new URL(raw, `${origin}/`).toString());
  }
  return urls;
}

/** Todas las revisiones de la tabla 2.8 que no dependen del DNS. Una pasada */
async function runChecks(
  args: SmokeArgs,
  site: string,
  fetchImpl: typeof fetch,
  env: Readonly<Record<string, string | undefined>>,
): Promise<SmokeCheck[]> {
  const base = args.url;
  const production = args.mode === 'production';
  const checks: SmokeCheck[] = [];

  // La portada y, con ella, lo que dicen Google y WhatsApp
  const home = await request(fetchImpl, `${base}/`);
  let homeHtml = '';
  checks.push(
    await check(
      'GET /',
      production
        ? `200, text/html, título Studiare, og:image y canonical con ${site}`
        : '200, text/html, título Studiare y og:image',
      () => {
        if ('failure' in home) return home.failure;
        const { reply } = home;
        homeHtml = reply.text;
        const problems: string[] = [];
        if (reply.status !== 200) problems.push(`código ${String(reply.status)}`);
        if (!(reply.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) {
          problems.push(`tipo ${reply.headers.get('content-type') ?? 'ausente'}`);
        }
        if (!/<title>[^<]*Studiare[^<]*<\/title>/i.test(reply.text))
          problems.push('sin el título Studiare');
        const image = /<meta property="og:image" content="([^"]*)"/.exec(reply.text)?.[1];
        if (image === undefined) problems.push('sin og:image');
        else if (production && image !== `${site}/og-image.png`) {
          problems.push(`og:image dice ${image} y debía ser ${site}/og-image.png`);
        }
        if (production && !reply.text.includes(`<link rel="canonical" href="${site}/" />`)) {
          problems.push(`sin canonical ${site}/`);
        }
        return problems.length === 0 ? null : problems.join('; ');
      },
    ),
  );

  // Aplicación de una sola página. Una ruta que no es un archivo devuelve la misma portada
  const deep = await request(fetchImpl, `${base}/repasar`);
  checks.push(
    await check('GET /repasar', '200 y el mismo index.html que /', () => {
      if ('failure' in deep) return deep.failure;
      if (deep.reply.status !== 200) return `código ${String(deep.reply.status)}`;
      if ('failure' in home) return 'no se pudo comparar, porque / no respondió';
      return deep.reply.text === home.reply.text
        ? null
        : `otro contenido: ${peek(deep.reply.text)}`;
    }),
  );

  checks.push(
    await check(
      'Encabezados de /',
      "Content-Security-Policy con default-src 'self' y frame-ancestors 'none', HSTS de un año sin includeSubDomains ni preload, nosniff, X-Frame-Options DENY, Referrer-Policy y Permissions-Policy",
      () => {
        if ('failure' in home) return home.failure;
        const problems = headerProblems(home.reply.headers);
        return problems.length === 0 ? null : problems.join('; ');
      },
    ),
  );

  // Un archivo con huella de /assets/ es inmutable un año
  checks.push(
    await check(
      'Archivo con huella en /assets/',
      'Cache-Control con immutable y max-age de un año',
      async () => {
        if ('failure' in home) return 'no se pudo leer index.html, porque / no respondió';
        const [first] = assetUrls(homeHtml, base);
        if (first === undefined) return 'index.html no carga ningún archivo de /assets/';
        const asset = await request(fetchImpl, first, { read: 'none' });
        if ('failure' in asset) return asset.failure;
        if (asset.reply.status !== 200)
          return `código ${String(asset.reply.status)} en ${new URL(first).pathname}`;
        const control = cacheControl(asset.reply);
        const problems: string[] = [];
        if (!control.includes('immutable')) problems.push('sin immutable');
        if (!control.includes(`max-age=${String(ONE_YEAR)}`))
          problems.push(`sin max-age=${String(ONE_YEAR)}`);
        return problems.length === 0
          ? null
          : `Cache-Control ${control || 'ausente'} (${problems.join(', ')})`;
      },
    ),
  );

  // El service worker y el manifest se revalidan, nunca son inmutables. Y no deben ser la portada
  const worker = await request(fetchImpl, `${base}/sw.js`);
  checks.push(
    await check('GET /sw.js', '200, JavaScript y sin immutable', () => {
      if ('failure' in worker) return worker.failure;
      const { reply } = worker;
      const problems: string[] = [];
      if (reply.status !== 200) problems.push(`código ${String(reply.status)}`);
      if (!(reply.headers.get('content-type') ?? '').toLowerCase().includes('javascript')) {
        problems.push(`tipo ${reply.headers.get('content-type') ?? 'ausente'}`);
      }
      if (cacheControl(reply).includes('immutable')) problems.push('trae immutable');
      return problems.length === 0 ? null : problems.join('; ');
    }),
  );

  const manifest = await request(fetchImpl, `${base}/manifest.webmanifest`);
  checks.push(
    await check(
      'GET /manifest.webmanifest',
      '200, sin immutable, con scope y start_url iguales a /',
      () => {
        if ('failure' in manifest) return manifest.failure;
        const { reply } = manifest;
        const problems: string[] = [];
        if (reply.status !== 200) problems.push(`código ${String(reply.status)}`);
        if (cacheControl(reply).includes('immutable')) problems.push('trae immutable');
        try {
          const json = JSON.parse(reply.text) as { scope?: unknown; start_url?: unknown };
          if (json.scope !== '/') problems.push(`scope ${JSON.stringify(json.scope)}`);
          if (json.start_url !== '/') problems.push(`start_url ${JSON.stringify(json.start_url)}`);
        } catch {
          problems.push(`no es JSON: ${peek(reply.text)}`);
        }
        return problems.length === 0 ? null : problems.join('; ');
      },
    ),
  );

  // robots.txt y sitemap.xml. Solo el dominio de producción se deja indexar
  const robots = await request(fetchImpl, `${base}/robots.txt`);
  const robotsLines =
    'reply' in robots ? robots.reply.text.split(/\r?\n/).map((line) => line.trim()) : [];
  checks.push(
    await check(
      'GET /robots.txt',
      production
        ? `Allow /, Sitemap ${site}/sitemap.xml y sin Disallow /`
        : 'User-agent * con Disallow / y sin Sitemap',
      () => {
        if ('failure' in robots) return robots.failure;
        if (robots.reply.status !== 200) return `código ${String(robots.reply.status)}`;
        if (
          looksLikeHtml(robots.reply) ||
          !robotsLines.some((line) => /^user-agent:/i.test(line))
        ) {
          return `no es un robots.txt: ${peek(robots.reply.text)}`;
        }
        const problems: string[] = [];
        const blocksAll = robotsLines.includes('Disallow: /');
        const sitemapLine = robotsLines.find((line) => /^sitemap:/i.test(line));
        if (production) {
          if (blocksAll) problems.push('trae Disallow /');
          if (!robotsLines.includes('Allow: /')) problems.push('sin Allow /');
          if (sitemapLine !== `Sitemap: ${site}/sitemap.xml`) {
            problems.push(`Sitemap ${sitemapLine ?? 'ausente'}`);
          }
        } else {
          if (!blocksAll) problems.push('sin Disallow /');
          if (sitemapLine !== undefined) problems.push('trae Sitemap');
        }
        return problems.length === 0 ? null : problems.join('; ');
      },
    ),
  );

  const sitemap = await request(fetchImpl, `${base}/sitemap.xml`);
  const expectedLocations = sitemapLocations(site);
  checks.push(
    await check(
      'GET /sitemap.xml',
      production ? `solo la portada, ${expectedLocations.join(', ')}` : 'sin sitemap, no se indexa',
      () => {
        if ('failure' in sitemap) return sitemap.failure;
        const { reply } = sitemap;
        const isSitemap = reply.status === 200 && reply.text.includes('<urlset');
        if (!production) {
          return isSitemap ? 'hay un sitemap.xml en un sitio que no se indexa' : null;
        }
        if (!isSitemap) {
          return `código ${String(reply.status)}, no es un sitemap: ${peek(reply.text)}`;
        }
        const found = [...reply.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
          (match) => match[1] ?? '',
        );
        const same =
          found.length === expectedLocations.length &&
          expectedLocations.every((loc) => found.includes(loc));
        return same ? null : `rutas ${found.join(', ') || 'ninguna'}`;
      },
    ),
  );

  if (args.apple) {
    const path = '/.well-known/apple-developer-merchantid-domain-association';
    const apple = await request(fetchImpl, `${base}${path}`);
    checks.push(
      await check(`GET ${path}`, '200 y el archivo de Apple, no la portada', () => {
        if ('failure' in apple) return apple.failure;
        if (apple.reply.status !== 200) return `código ${String(apple.reply.status)}`;
        if (looksLikeHtml(apple.reply) || apple.reply.text.trim() === '') {
          return `no es el archivo de Apple: ${peek(apple.reply.text)}`;
        }
        return null;
      }),
    );
  }

  const image = await request(fetchImpl, `${base}/og-image.png`, { read: 'bytes' });
  checks.push(
    await check('GET /og-image.png', '200, image/png y menos de 300 KB', () => {
      if ('failure' in image) return image.failure;
      const { reply } = image;
      const problems: string[] = [];
      if (reply.status !== 200) problems.push(`código ${String(reply.status)}`);
      if (!(reply.headers.get('content-type') ?? '').toLowerCase().includes('image/png')) {
        problems.push(`tipo ${reply.headers.get('content-type') ?? 'ausente'}`);
      }
      if (reply.bytes >= OG_IMAGE_MAX_BYTES)
        problems.push(`pesa ${String(Math.round(reply.bytes / 1024))} KB`);
      return problems.length === 0 ? null : problems.join('; ');
    }),
  );

  if (args.supabase !== null)
    checks.push(...(await supabaseChecks(args.supabase, site, fetchImpl)));
  if (args.strict) checks.push(...(await strictChecks(base, env, fetchImpl)));
  return checks;
}

/** ai-proxy contesta el preflight al origen del sitio y rechaza a uno ajeno. Sin llaves, solo OPTIONS */
async function supabaseChecks(
  supabase: string,
  site: string,
  fetchImpl: typeof fetch,
): Promise<SmokeCheck[]> {
  const endpoint = `${supabase}/functions/v1/ai-proxy`;
  const preflight = (origin: string) =>
    request(fetchImpl, endpoint, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type',
      },
      read: 'none',
    });
  const siteOrigin = new URL(`${site}/`).origin;
  const allowed = await preflight(siteOrigin);
  const foreign = await preflight(FOREIGN_ORIGIN);
  return [
    await check(
      'OPTIONS ai-proxy con el origen del sitio',
      `204 y access-control-allow-origin ${siteOrigin}`,
      () => {
        if ('failure' in allowed) return allowed.failure;
        const origin = allowed.reply.headers.get('access-control-allow-origin');
        const problems: string[] = [];
        if (allowed.reply.status !== 204) problems.push(`código ${String(allowed.reply.status)}`);
        if (origin !== siteOrigin) problems.push(`allow-origin ${origin ?? 'ausente'}`);
        return problems.length === 0 ? null : problems.join('; ');
      },
    ),
    await check(
      'OPTIONS ai-proxy con un origen ajeno',
      '403 y sin access-control-allow-origin',
      () => {
        if ('failure' in foreign) return foreign.failure;
        const origin = foreign.reply.headers.get('access-control-allow-origin');
        const problems: string[] = [];
        if (foreign.reply.status !== 403) problems.push(`código ${String(foreign.reply.status)}`);
        if (origin !== null) problems.push(`allow-origin ${origin}`);
        return problems.length === 0 ? null : problems.join('; ');
      },
    ),
  ];
}

const REDIRECT_CODES = [301, 302, 307, 308];

/** Producción en el dominio de verdad: http a https, www al dominio sin www y noindex en pages.dev */
async function strictChecks(
  base: string,
  env: Readonly<Record<string, string | undefined>>,
  fetchImpl: typeof fetch,
): Promise<SmokeCheck[]> {
  const host = new URL(base).host;
  const project = (env.CLOUDFLARE_PAGES_PROJECT ?? '').trim() || 'studiare';
  const plain = await request(fetchImpl, `http://${host}/`, { redirect: 'manual', read: 'none' });
  const www = await request(fetchImpl, `https://www.${host}/`, {
    redirect: 'manual',
    read: 'none',
  });
  const pagesDev = await request(fetchImpl, `https://${project}.pages.dev/`, { read: 'none' });
  const goesTo = (fetched: Fetched, origin: string): string | null => {
    if ('failure' in fetched) return fetched.failure;
    const { status, headers } = fetched.reply;
    const location = headers.get('location') ?? '';
    if (!REDIRECT_CODES.includes(status)) return `código ${String(status)}, no redirige`;
    return location === origin || location.startsWith(`${origin}/`)
      ? null
      : `redirige a ${location || 'nada'}`;
  };
  return [
    await check('http redirige a https', `301 o 308 hacia https://${host}`, () =>
      goesTo(plain, `https://${host}`),
    ),
    await check('www redirige al dominio sin www', `301 o 308 hacia https://${host}`, () =>
      goesTo(www, `https://${host}`),
    ),
    await check(
      'pages.dev responde noindex',
      `X-Robots-Tag noindex en ${project}.pages.dev`,
      () => {
        if ('failure' in pagesDev) return pagesDev.failure;
        const robots = pagesDev.reply.headers.get('x-robots-tag') ?? '';
        return /noindex/i.test(robots)
          ? null
          : `X-Robots-Tag ${robots || 'ausente'} (código ${String(pagesDev.reply.status)})`;
      },
    ),
  ];
}

/**
 * Corre las revisiones de la tabla 2.8 contra el sitio publicado. Solo usa fetch, sin llaves, y con --strict
 * reintenta STRICT_RETRIES veces cada STRICT_RETRY_DELAY_MS después del primer intento, porque el DNS y el
 * certificado tardan. Nunca lanza por una respuesta mala: la deja en el informe. Si la dirección pública de
 * SITE_URL no es válida, lo dice como una revisión que falla
 */
export async function runSmoke(
  args: SmokeArgs,
  fetchImpl: typeof fetch = fetch,
  options: SmokeOptions = {},
): Promise<SmokeReport> {
  const env = options.env ?? process.env;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const rawSite = (env.SITE_URL ?? '').trim();
  const site = rawSite === '' ? siteUrlOf(args.url) : siteUrlOf(rawSite);
  if (site === undefined) {
    const bad: SmokeCheck = {
      name: 'SITE_URL',
      ok: false,
      expected: 'una dirección https sin consulta, como https://tudominio.mx',
      found: 'la variable SITE_URL no es una dirección válida',
    };
    return { checks: [bad], ok: false };
  }
  const attempts = args.strict ? STRICT_RETRIES + 1 : 1;
  let checks: SmokeCheck[] = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    checks = await runChecks(args, site, fetchImpl, env);
    if (checks.every((item) => item.ok)) break;
    if (attempt < attempts) await sleep(STRICT_RETRY_DELAY_MS);
  }
  return { checks, ok: checks.every((item) => item.ok) };
}

/** Lo que se imprime. Las que pasan en una línea y las que fallan con lo esperado y lo encontrado */
export function formatSmokeReport(report: SmokeReport): string {
  const lines = report.checks.map((check) =>
    check.ok
      ? `  ok    ${check.name}`
      : `  FALLA ${check.name}\n          esperado  ${check.expected}\n          encontrado  ${check.found}`,
  );
  const failed = report.checks.filter((check) => !check.ok).length;
  const verdict = report.ok
    ? `Todo en verde, ${String(report.checks.length)} revisiones`
    : `${String(failed)} de ${String(report.checks.length)} revisiones fallaron`;
  return [...lines, verdict].join('\n');
}

/** Punto de entrada. Devuelve el código de salida y no hace salir al proceso, para poder probarlo */
export async function main(
  argv: readonly string[],
  io: { out: (line: string) => void; err: (line: string) => void } = {
    out: (line) => {
      console.log(line);
    },
    err: (line) => {
      console.error(line);
    },
  },
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    io.out(SMOKE_USAGE);
    return SMOKE_EXIT.ok;
  }
  let args: SmokeArgs;
  try {
    args = parseSmokeArgs(argv);
  } catch (error) {
    if (!(error instanceof SmokeUsageError)) throw error;
    io.err(`${error.message}\n\n${SMOKE_USAGE}`);
    return SMOKE_EXIT.usage;
  }
  const report = await runSmoke(args, fetchImpl);
  const text = formatSmokeReport(report);
  if (report.ok) io.out(text);
  else io.err(text);
  return report.ok ? SMOKE_EXIT.ok : SMOKE_EXIT.failed;
}

// Uso desde la línea de comandos
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(
        `Falló la prueba de humo. ${error instanceof Error ? error.name : 'Error desconocido'}`,
      );
      process.exitCode = SMOKE_EXIT.failed;
    },
  );
}
