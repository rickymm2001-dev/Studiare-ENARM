// Archivos y etiquetas del sitio que salen de la dirección pública (B17, 2.5 y 2.6 del plan de B17). Son
// funciones puras, sin Vite ni disco, para probarlas sin armar un build. vite.config.ts las llama al construir.
//
// La dirección pública llega en SITE_URL, que solo lee vite.config.ts. Con ella y con VITE_APP_ENV=production el
// sitio se deja indexar (robots.txt con Allow, sitemap.xml y canonical). En cualquier otro caso, o sea vista
// previa, demo, local o producción sin dirección, robots.txt pide que no se indexe nada y no hay sitemap.
// Así una vista previa o la demo vieja nunca compiten con el dominio de verdad en un buscador.
import { BRAND } from '../src/config/brand.ts';
import { SCREENS, type ScreenKey } from '../src/app/screens.ts';

/** Si el texto trae un espacio, un tabulador, un salto de línea u otro carácter de control */
function hasControlOrSpace(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * La dirección pública del sitio, normalizada: origen y, si la tiene, la ruta, sin diagonal final. https siempre,
 * y http solo en 127.0.0.1 o localhost para probar un build en la computadora. Sin usuario, consulta ni
 * fragmento. Una dirección rara da undefined, así una variable mal puesta no se cuela en el canonical ni en el
 * sitemap. La ruta existe porque la demo de GitHub Pages vive en /Studiare-ENARM
 */
export function siteUrlOf(value: string | undefined): string | undefined {
  const raw = (value ?? '').trim();
  // El analizador de URL borra en silencio tabuladores y saltos de línea, así que un valor con alguno se leería
  // como otra dirección (https://a.mx\nb se vuelve https://a.mxb). Se rechaza antes
  if (raw === '' || hasControlOrSpace(raw)) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return undefined;
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    return undefined;
  }
  const path = url.pathname.replace(/\/+$/, '');
  if (path !== '' && !/^\/[A-Za-z0-9._~\-/]*$/.test(path)) return undefined;
  return `${url.origin}${path}`;
}

/** Escapa un texto para usarlo literal dentro de una expresión regular */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Las rutas que el service worker nunca debe contestar con la app. Con el worker instalado, abrir en el navegador
 * /sitemap.xml, /robots.txt, /.well-known/security.txt o la imagen para compartir devolvería index.html en lugar del
 * archivo, porque el worker contesta cualquier navegación que no esté en esta lista con la aplicación. Buscadores,
 * Stripe y Apple no pasan por el worker, así que no afecta a la verificación del dominio ni al SEO, pero se nota al
 * revisar el sitio a mano. Solo van archivos con nombre fijo y la carpeta .well-known. No se usa una regla general
 * de "tiene extensión" porque las rutas de la app pueden traer puntos (la ficha de baja de los correos)
 *
 * base es la ruta donde vive la app, con diagonales en los dos extremos ("/" o "/Studiare-ENARM/"). Workbox prueba
 * estos patrones contra la ruta y la consulta, y los copia al worker como texto, así que van como RegExp ya armadas
 */
export function navigationDenylist(base: string): RegExp[] {
  const prefix = escapeRegExp(base);
  return [
    // Las llamadas al proxy de IA nunca se sirven desde caché
    /^\/api\//,
    new RegExp(
      `^${prefix}(?:robots\\.txt|sitemap\\.xml|security\\.txt|_headers|og-image\\.png)(?:\\?|$)`,
    ),
    // security.txt y el archivo con el que Apple verifica el dominio de las billeteras
    new RegExp(`^${prefix}\\.well-known/`),
  ];
}

/** Si el build es el del dominio de verdad: declarado producción y con una dirección pública válida */
export function isIndexableBuild(appEnv: string | undefined, siteUrl: string | undefined): boolean {
  return (appEnv ?? '').trim() === 'production' && siteUrlOf(siteUrl) !== undefined;
}

/**
 * Las únicas pantallas que el sitemap anuncia: la portada. El aviso de privacidad y los términos son pantallas de la
 * misma aplicación de una sola página, así que comparten index.html y su canonical apunta a la portada. Listarlos
 * anunciaría dos páginas que Google trata como copias de "/". Siguen abiertas y enlazadas desde la portada, y robots.txt
 * no las bloquea. Si algún día cada ruta lleva su propio canonical, se suman aquí (la prueba de site-files.test.ts
 * revisa que el sitemap y el canonical digan lo mismo)
 */
export const SITEMAP_SCREEN_KEYS = ['home'] as const satisfies readonly ScreenKey[];

/**
 * Lo que robots.txt le prohíbe a los buscadores aunque haya sesión de por medio: las pantallas del equipo médico y
 * de administración y la baja de los recordatorios, que se abre con una ficha en el enlace del correo. La prueba
 * de este archivo revisa que cubra todas las pantallas de esas áreas, así una pantalla nueva no se queda fuera
 */
export const ROBOTS_DISALLOW = ['/admin', '/medico', '/correo/'] as const;

/** robots.txt. Sin dirección indexable pide que no se indexe nada y no menciona sitemap */
export function robotsTxt(site: string | undefined): string {
  if (site === undefined) return 'User-agent: *\nDisallow: /\n';
  return [
    'User-agent: *',
    'Allow: /',
    ...ROBOTS_DISALLOW.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${site}/sitemap.xml`,
    '',
  ].join('\n');
}

const xmlEscape = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

/** Las direcciones completas del sitemap, en el orden de SITEMAP_SCREEN_KEYS */
export function sitemapLocations(site: string): string[] {
  return SITEMAP_SCREEN_KEYS.map((key) => {
    const path = SCREENS[key].path;
    return path === '/' ? `${site}/` : `${site}${path}`;
  });
}

/** sitemap.xml con las rutas de SITEMAP_SCREEN_KEYS. lastmod es el día del build, en UTC */
export function sitemapXml(site: string, now: Date): string {
  const lastmod = now.toISOString().slice(0, 10);
  const urls = sitemapLocations(site).map(
    (loc) =>
      `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

/**
 * El correo de soporte si tiene forma de correo y nada que rompa una línea. Es público por diseño, igual que en
 * el aviso de privacidad. Un valor raro no escribe security.txt en lugar de escribirlo con basura
 */
export function supportEmailOf(value: string | undefined): string | undefined {
  const email = (value ?? '').trim();
  return /^[^\s@<>,;:"()[\]\\]{1,64}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(email) &&
    email.length <= 254
    ? email
    : undefined;
}

/** Un año menos un día, porque RFC 9116 recomienda que Expires quede a menos de un año */
const SECURITY_TXT_DAYS = 364;

/** /.well-known/security.txt (RFC 9116). Expires se renueva con cada publicación */
export function securityTxt(email: string, now: Date, site?: string): string {
  const expires = new Date(now.getTime() + SECURITY_TXT_DAYS * 24 * 60 * 60 * 1000);
  return [
    `Contact: mailto:${email}`,
    `Expires: ${expires.toISOString()}`,
    'Preferred-Languages: es',
    ...(site === undefined ? [] : [`Canonical: ${site}/.well-known/security.txt`]),
    '',
  ].join('\n');
}

/** Un archivo que el build agrega a la carpeta de salida */
export interface SiteFile {
  fileName: string;
  source: string;
}

export interface SiteFilesInput {
  /** VITE_APP_ENV */
  appEnv: string | undefined;
  /** SITE_URL */
  siteUrl: string | undefined;
  /** VITE_SUPPORT_EMAIL */
  supportEmail: string | undefined;
  now: Date;
}

/**
 * robots.txt siempre. sitemap.xml solo en el build indexable. security.txt solo si hay correo de soporte, con la
 * dirección canónica también solo en el build indexable
 */
export function siteFiles({ appEnv, siteUrl, supportEmail, now }: SiteFilesInput): SiteFile[] {
  const indexable = isIndexableBuild(appEnv, siteUrl);
  const site = indexable ? siteUrlOf(siteUrl) : undefined;
  const files: SiteFile[] = [{ fileName: 'robots.txt', source: robotsTxt(site) }];
  if (site !== undefined) files.push({ fileName: 'sitemap.xml', source: sitemapXml(site, now) });
  const email = supportEmailOf(supportEmail);
  if (email !== undefined) {
    files.push({
      fileName: '.well-known/security.txt',
      source: securityTxt(email, now, site),
    });
  }
  return files;
}

/** Escapa un texto para ponerlo dentro de un atributo HTML entre comillas dobles */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** Marcadores de index.html que reemplaza applySiteMetadata (B17, 2.6) */
export const HTML_MARKERS = {
  title: '%BRAND_TITLE%',
  description: '%BRAND_DESCRIPTION%',
  seo: '<!--seo-->',
} as const;

export interface SiteMetadataInput {
  /** La dirección pública ya normalizada con siteUrlOf, o undefined si el build no la trae */
  site: string | undefined;
  /** BASE_URL del build, con diagonales en los dos extremos. La imagen para compartir vive ahí */
  base: string;
}

/**
 * Título y descripción desde la marca, y con dirección pública el canonical, og:url y twitter:title más la
 * imagen para compartir con dirección completa (WhatsApp, Facebook y X no siguen rutas relativas en og:image).
 * Sin dirección, la etiqueta seo desaparece y la imagen queda relativa, como siempre
 */
export function applySiteMetadata(html: string, { site, base }: SiteMetadataInput): string {
  const name = escapeHtmlAttribute(BRAND.name);
  const seo =
    site === undefined
      ? ''
      : [
          `<link rel="canonical" href="${escapeHtmlAttribute(`${site}/`)}" />`,
          `<meta property="og:url" content="${escapeHtmlAttribute(`${site}/`)}" />`,
          `<meta name="twitter:title" content="${name}" />`,
        ].join('\n    ');
  const withMarkers = html
    .replaceAll(HTML_MARKERS.title, name)
    .replaceAll(HTML_MARKERS.description, escapeHtmlAttribute(BRAND.description))
    // Sin dirección se quita la línea entera del marcador, para no dejar un renglón vacío en el HTML
    .replaceAll(
      seo === '' ? new RegExp(`[ \\t]*${HTML_MARKERS.seo}\\r?\\n?`, 'g') : HTML_MARKERS.seo,
      seo,
    );
  return site === undefined
    ? withMarkers
    : withMarkers.replaceAll(
        `content="${base}og-image.png"`,
        `content="${escapeHtmlAttribute(site)}/og-image.png"`,
      );
}
