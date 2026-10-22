// Genera el sitio de mudanza de GitHub Pages (B17, 3.4 del plan de B17). Cuando Studiare se muda a su dominio,
// la demo de GitHub Pages deja de ser la app y pasa a ser un sitio chico que solo dice a dónde se mudó, lleva a la
// persona allá con la misma ruta (así una liga de referido o de grupo, ?ref=..., sigue sirviendo) y quita el
// service worker viejo. Lo corre .github/workflows/pages.yml cuando existe la variable PAGES_MOVED_TO.
//
// Uso
//   node scripts/deploy/moved-site.ts --to https://tudominio.mx --base /Studiare-ENARM --out dist
//
// Qué escribe en la carpeta de salida (sin analítica ni scripts de terceros, y con una política de seguridad que
// solo deja los archivos de la propia página)
//   index.html y 404.html, iguales. GitHub Pages contesta 404.html a cualquier ruta que no existe, y así
//                          /Studiare-ENARM/repasar también cae aquí
//   moved.js y moved.css   la redirección y el estilo. Van aparte para que la política no necesite scripts en línea
//   sw.js                  el service worker de despedida, en la misma ruta que el de la app vieja
//   manifest.webmanifest, pwa-192x192.png y favicon-64x64.png
//
// Por qué el service worker: quien ya visitó la demo o la instaló tiene un service worker que sirve la app vieja desde su
// caché aunque el sitio cambie. Lo único que el navegador revisa para saber si hay una versión nueva es su
// archivo, en la misma ruta, así que ahí se pone uno que se instala solo, borra los cachés de Studiare (no los de
// otras páginas del mismo usuario de GitHub Pages, que comparten el almacén del origen), se desregistra y
// recarga cada ventana abierta. La recarga trae esta página desde la red. WindowClient.navigate solo acepta
// direcciones del mismo origen que el service worker, así que no puede mandar la ventana al dominio nuevo
// directamente, y por eso hace falta esta página en medio. Un aparato que visitó la demo hace menos de un día
// puede tardar hasta un día en ver el cambio, porque el navegador no revisa el archivo más seguido
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { BRAND } from '../../src/config/brand.ts';
import { RUNTIME_CACHE_NAMES } from '../runtime-caches.ts';

/** Cuánto espera la página antes de llevar a la persona, para que alcance a leer el texto */
export const REDIRECT_DELAY_MS = 5000;
/**
 * El respaldo sin JavaScript, que lleva a la raíz del dominio nuevo. Va dentro de noscript: con JavaScript la
 * redirección ya conserva la ruta, y una actualización automática a la vista le quitaría tiempo a quien necesita
 * más (axe la marca como una falla seria, regla meta-refresh)
 */
export const META_REFRESH_SECONDS = 10;

/**
 * La dirección del sitio nuevo a la que se lleva la visita. Se escribe una sola vez, como texto, y la usan los
 * dos lados: la página (que la corre en el navegador) y las pruebas (que la corren aquí con node:vm). Así lo que
 * se prueba es lo mismo que se publica
 *
 * - target es el origen nuevo sin diagonal final, base la ruta de la demo (/Studiare-ENARM o vacía) y href la
 *   dirección que se abrió
 * - Quita la ruta de la demo y conserva el resto de la ruta, la consulta y el fragmento. El fragmento es donde
 *   viaja la sesión de un enlace de acceso reciente
 * - Una dirección que no es del sitio cae a la raíz del dominio nuevo: la que no se puede leer, la que no es
 *   http ni https, la que está fuera de la ruta de la demo y la que después de quitar la ruta empieza con dos
 *   diagonales (//otro.com, que un navegador leería como otro sitio)
 */
export const DESTINATION_SOURCE = `function (target, base, href) {
  var root = target + '/';
  var url;
  try {
    url = new URL(href);
  } catch (error) {
    return root;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return root;
  var prefix = base.replace(/\\/+$/, '');
  var path = url.pathname;
  if (prefix !== '') {
    if (path === prefix) path = '/';
    else if (path.indexOf(prefix + '/') === 0) path = path.slice(prefix.length);
    else return root;
  }
  if (path.charAt(0) !== '/' || path.indexOf('//') === 0) return root;
  var destination = target + path + url.search + url.hash;
  try {
    if (new URL(destination).origin !== new URL(target).origin) return root;
  } catch (error) {
    return root;
  }
  return destination;
}`;

/** La función de arriba, para usarla desde TypeScript y probarla. Es la misma que corre en la página */
export const movedDestination = runInNewContext(`(${DESTINATION_SOURCE})`, { URL }) as (
  target: string,
  base: string,
  href: string,
) => string;

/** Lo mismo que hace el service worker de despedida (3.4). Se escribe tal cual en sw.js */
export const FAREWELL_WORKER = `// Service worker de despedida de la demo de Studiare. La app se mudó. Este archivo reemplaza al service worker
// viejo para que ningún aparato siga abriendo la app vieja desde su caché
const OWN_CACHES = ${JSON.stringify(RUNTIME_CACHE_NAMES)};

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const scope = self.registration.scope;
  event.waitUntil(
    (async () => {
      // Solo los cachés de Studiare. Todos los proyectos de un mismo usuario de GitHub Pages comparten el almacén de
      // cachés del origen, y la despedida no debe borrar los de otra página que viva ahí. El de precarga de Workbox
      // lleva al final la dirección del alcance de este service worker, y los demás tienen un nombre fijo
      for (const key of await caches.keys()) {
        if (OWN_CACHES.indexOf(key) !== -1 || (key.indexOf('workbox-') === 0 && key.slice(-scope.length) === scope)) {
          await caches.delete(key);
        }
      }
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
        // Recarga la misma dirección. Ya sin service worker, llega esta página y es ella quien lleva a la persona
        try {
          await client.navigate(client.url);
        } catch (error) {
          // Una ventana que no se deja navegar la verá la próxima vez que abra la demo
        }
      }
    })(),
  );
});
`;

export interface MovedSiteOptions {
  /** El origen del sitio nuevo, https, como https://tudominio.mx */
  movedTo: string;
  /** La ruta de la demo, como /Studiare-ENARM, o / si vive en la raíz */
  base: string;
}

export class MovedSiteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MovedSiteError';
  }
}

/** Origen https del sitio nuevo, sin ruta, usuario, consulta ni espacios. Si no, error con lo que está mal */
export function movedTargetOf(value: string): string {
  const raw = value.trim();
  let url: URL | undefined;
  if (!/\s/.test(raw)) {
    try {
      url = new URL(raw);
    } catch {
      url = undefined;
    }
  }
  const bare =
    url?.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    (url.pathname === '/' || url.pathname === '') &&
    url.search === '' &&
    url.hash === '';
  if (url === undefined || !bare) {
    throw new MovedSiteError(
      'La dirección nueva debe ser un origen https sin ruta, como https://tudominio.mx',
    );
  }
  return url.origin;
}

/** La ruta de la demo con diagonal inicial y final (/Studiare-ENARM/). Vacía o / es la raíz */
export function movedBaseOf(value: string): string {
  const raw = value.trim();
  if (raw === '' || raw === '/') return '/';
  if (!/^\/?[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*\/?$/.test(raw) || raw.includes('..')) {
    throw new MovedSiteError('La ruta de la demo debe verse como /Studiare-ENARM');
  }
  return `/${raw.replace(/^\/+|\/+$/g, '')}/`;
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

/** El texto de la redirección de moved.js, con la dirección nueva y la ruta de la demo ya puestas */
export function redirectScript(target: string, base: string): string {
  return `// Lleva a la persona a la dirección nueva de Studiare conservando la ruta, la consulta y el fragmento
(function () {
  var target = ${JSON.stringify(target)};
  var base = ${JSON.stringify(base)};
  var delay = ${String(REDIRECT_DELAY_MS)};
  var destination = (${DESTINATION_SOURCE})(target, base, window.location.href);
  var link = document.getElementById('enlace');
  if (link) {
    link.setAttribute('href', destination);
    link.focus();
  }
  window.setTimeout(function () {
    window.location.replace(destination);
  }, delay);
})();
`;
}

const STYLE = `:root {
  color-scheme: light dark;
  --fondo: ${BRAND.backgroundColor};
  --texto: #1f2933;
  --enlace: ${BRAND.themeColor};
  --tarjeta: #ffffff;
  --borde: #d3d8dd;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fondo: #14181c;
    --texto: #eef1f4;
    --enlace: #8fd0f0;
    --tarjeta: #1d2329;
    --borde: #36404a;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 16px;
  background: var(--fondo);
  color: var(--texto);
  font: 1.125rem/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
main {
  width: 100%;
  max-width: 34rem;
  padding: 28px 24px;
  background: var(--tarjeta);
  border: 1px solid var(--borde);
  border-radius: 12px;
}
img { display: block; width: 64px; height: 64px; margin-bottom: 12px; border-radius: 14px; }
h1 { margin: 0 0 12px; font-size: 1.5rem; line-height: 1.3; }
p { margin: 0 0 12px; }
a { color: var(--enlace); font-weight: 600; text-underline-offset: 3px; }
a:focus-visible { outline: 3px solid var(--enlace); outline-offset: 3px; border-radius: 4px; }
.nota { font-size: 1rem; }
`;

/** index.html, que también se publica como 404.html */
export function movedPage(target: string, base: string): string {
  const host = new URL(target).host;
  const root = `${target}/`;
  const policy = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return `<!doctype html>
<html lang="es-MX">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <meta name="theme-color" content="${BRAND.themeColor}" />
    <noscript>
      <meta http-equiv="refresh" content="${String(META_REFRESH_SECONDS)};url=${escapeHtml(root)}" />
    </noscript>
    <title>${BRAND.name} cambió de dirección</title>
    <link rel="icon" href="${base}favicon-64x64.png" type="image/png" />
    <link rel="manifest" href="${base}manifest.webmanifest" />
    <link rel="stylesheet" href="${base}moved.css" />
  </head>
  <body>
    <main>
      <img src="${base}pwa-192x192.png" alt="" width="64" height="64" />
      <h1>${BRAND.name} cambió de dirección</h1>
      <p role="status">
        Ahora vive en <a id="enlace" href="${escapeHtml(root)}">${escapeHtml(host)}</a>. Te llevamos allá en unos
        segundos.
      </p>
      <p class="nota">
        Con cuenta, entra allá con tu correo y tu estudio se sincroniza. Si usabas la demo sin cuenta, tus datos se
        quedaron en este navegador y no pasan solos.
      </p>
    </main>
    <script src="${base}moved.js"></script>
  </body>
</html>
`;
}

/** El manifest mínimo. Conserva el id y el alcance de la app vieja para que se reconozca como la misma aplicación */
export function movedManifest(base: string): string {
  return `${JSON.stringify(
    {
      id: base,
      name: BRAND.name,
      short_name: BRAND.shortName,
      lang: 'es-MX',
      start_url: base,
      scope: base,
      display: 'standalone',
      theme_color: BRAND.themeColor,
      background_color: BRAND.backgroundColor,
      icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
    },
    null,
    2,
  )}\n`;
}

/** Los archivos de texto del sitio, por nombre. Los dos íconos se copian aparte */
export function movedSiteFiles(options: MovedSiteOptions): Record<string, string> {
  const target = movedTargetOf(options.movedTo);
  const base = movedBaseOf(options.base);
  const page = movedPage(target, base);
  return {
    'index.html': page,
    '404.html': page,
    'moved.js': redirectScript(target, base),
    'moved.css': STYLE,
    'sw.js': FAREWELL_WORKER,
    'manifest.webmanifest': movedManifest(base),
  };
}

const ROOT = resolve(import.meta.dirname, '..', '..');
/** Los íconos que la página y el manifest usan, de public/ */
export const MOVED_SITE_ICONS = ['pwa-192x192.png', 'favicon-64x64.png'] as const;

/** Escribe el sitio completo en la carpeta de salida. Crea la carpeta si no existe */
export function writeMovedSite(outDir: string, options: MovedSiteOptions): string[] {
  const files = movedSiteFiles(options);
  mkdirSync(outDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(outDir, name), content);
  for (const icon of MOVED_SITE_ICONS) copyFileSync(join(ROOT, 'public', icon), join(outDir, icon));
  return [...Object.keys(files), ...MOVED_SITE_ICONS];
}

// Uso desde la línea de comandos
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const values = new Map<string, string>();
  const argv = process.argv.slice(2);
  let usage = argv.length % 2 !== 0;
  for (let index = 0; index + 1 < argv.length; index += 2) {
    const flag = argv[index] ?? '';
    if (!['--to', '--base', '--out'].includes(flag)) usage = true;
    values.set(flag, argv[index + 1] ?? '');
  }
  const to = values.get('--to');
  const out = values.get('--out');
  if (usage || to === undefined || out === undefined) {
    console.error(
      'Uso: node scripts/deploy/moved-site.ts --to https://tudominio.mx [--base /Studiare-ENARM] --out CARPETA',
    );
    process.exitCode = 2;
  } else {
    try {
      const written = writeMovedSite(resolve(out), {
        movedTo: to,
        base: values.get('--base') ?? '/',
      });
      console.log(`Sitio de mudanza escrito en ${out} (${written.join(', ')})`);
    } catch (error) {
      if (!(error instanceof MovedSiteError)) throw error;
      console.error(error.message);
      process.exitCode = 2;
    }
  }
}
