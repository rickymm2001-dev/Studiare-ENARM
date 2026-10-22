// Sirve una carpeta de build como lo hace Cloudflare Pages, para probar en la computadora la prueba de humo y el
// archivo _headers antes de publicar (B17, 2.8 del plan de B17). vite preview sirve los archivos pero no lee
// _headers, y sin ese archivo no hay política de seguridad, ni HSTS, ni caché larga que revisar. Esto sí lo lee.
//
// Lo que imita de Pages, según su documentación
//   - Aplicación de una sola página. Sin 404.html, cualquier ruta que no es un archivo devuelve index.html con
//     200. Con 404.html devuelve ese archivo con 404
//   - Caché por omisión public, max-age=0, must-revalidate con ETag, y Access-Control-Allow-Origin con asterisco
//   - Las reglas de _headers, con * y :marcadores. Las que empiezan con https:// miran también el host, así que
//     las de pages.dev nunca aplican aquí, en 127.0.0.1
// Lo que no imita: redirecciones (_redirects), Functions, http a https ni www. Eso se revisa con --strict en el
// dominio de verdad
//
// Uso
//   node scripts/smoke/local-pages.ts dist [--port 4180]
//   y en otra terminal  npm run smoke -- http://127.0.0.1:4180 --mode preview
//   (con un build hecho con VITE_APP_ENV=production y SITE_URL=http://127.0.0.1:4180, sin --mode)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, resolve, sep } from 'node:path';

export interface HeaderRule {
  /** La dirección de la regla, como /assets/* o https://:project.pages.dev/* */
  pattern: string;
  headers: [name: string, value: string][];
}

/** Lee un archivo _headers. Una regla empieza en una línea sin sangría y sus encabezados van con sangría */
export function parseHeadersFile(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      rules.push({ pattern: raw.trim(), headers: [] });
      continue;
    }
    const current = rules.at(-1);
    const separator = raw.indexOf(':');
    if (current === undefined || separator < 0) continue;
    current.headers.push([raw.slice(0, separator).trim(), raw.slice(separator + 1).trim()]);
  }
  return rules;
}

/** Convierte la dirección de una regla en una expresión regular. * toma lo que sea y :nombre un tramo sin diagonal ni punto */
function patternToRegExp(pattern: string): RegExp {
  const source = pattern
    .split(/(\*|:[A-Za-z]+)/)
    .map((part) => {
      if (part === '*') return '.*';
      if (/^:[A-Za-z]+$/.test(part)) return '[^/.]+';
      return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${source}$`);
}

/** Los encabezados de todas las reglas que aplican a esa dirección, en el orden del archivo */
export function headersFor(rules: readonly HeaderRule[], url: URL): [string, string][] {
  const found: [string, string][] = [];
  for (const rule of rules) {
    const subject = rule.pattern.startsWith('https://')
      ? `${url.protocol}//${url.host}${url.pathname}`
      : url.pathname;
    if (patternToRegExp(rule.pattern).test(subject)) found.push(...rule.headers);
  }
  return found;
}

export const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

/** Un archivo de la carpeta si la ruta cae dentro de ella y es un archivo. Nada de salirse con .. */
function fileFor(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const candidate = resolve(root, `.${decoded}`);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  const withIndex = decoded.endsWith('/') ? join(candidate, 'index.html') : candidate;
  return existsSync(withIndex) && statSync(withIndex).isFile() ? withIndex : null;
}

/** Un servidor que sirve esa carpeta como Pages. Lee _headers en cada petición, para ver un build nuevo sin reiniciar */
export function createPagesServer(directory: string): Server {
  const root = resolve(directory);
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const method = request.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    const headersPath = join(root, '_headers');
    const rules = existsSync(headersPath)
      ? parseHeadersFile(readFileSync(headersPath, 'utf8'))
      : [];
    let file = fileFor(root, url.pathname);
    let status = 200;
    if (file === null) {
      // Sin 404.html Pages sirve la aplicación de una sola página. Con 404.html, responde ese archivo con 404
      const notFound = join(root, '404.html');
      if (existsSync(notFound)) {
        file = notFound;
        status = 404;
      } else file = join(root, 'index.html');
      if (!existsSync(file)) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No existe\n');
        return;
      }
    }
    const body = readFileSync(file);
    const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
    const headers: Record<string, string> = {
      'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'public, max-age=0, must-revalidate',
      'access-control-allow-origin': '*',
      etag,
    };
    // Lo de _headers manda sobre lo de por omisión
    for (const [name, value] of headersFor(rules, url)) headers[name.toLowerCase()] = value;
    if (status === 200 && request.headers['if-none-match'] === etag) {
      response.writeHead(304, headers).end();
      return;
    }
    response.writeHead(status, { ...headers, 'content-length': String(body.length) });
    response.end(method === 'HEAD' ? undefined : body);
  });
}

export interface RunningPagesServer {
  /** http://127.0.0.1:PUERTO */
  url: string;
  close: () => Promise<void>;
}

/** Arranca el servidor en 127.0.0.1. Con puerto 0 el sistema elige uno libre */
export function startPagesServer(directory: string, port = 0): Promise<RunningPagesServer> {
  const server = createPagesServer(directory);
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      done({
        url: `http://127.0.0.1:${String(address.port)}`,
        close: () =>
          new Promise<void>((closed) => {
            server.close(() => {
              closed();
            });
            server.closeAllConnections();
          }),
      });
    });
  });
}

// Uso desde la línea de comandos
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const [directory, flag, value] = process.argv.slice(2);
  if (directory === undefined || (flag !== undefined && flag !== '--port')) {
    console.error('Uso: node scripts/smoke/local-pages.ts CARPETA [--port 4180]');
    process.exitCode = 2;
  } else {
    const port = value === undefined ? 4180 : Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.error('El puerto debe ser un número entre 1 y 65535');
      process.exitCode = 2;
    } else {
      startPagesServer(directory, port).then(
        (running) => {
          console.warn(`Sirviendo ${directory} como Cloudflare Pages en ${running.url}`);
        },
        (error: unknown) => {
          console.error(
            `No se pudo abrir el puerto. ${error instanceof Error ? error.message : ''}`,
          );
          process.exitCode = 1;
        },
      );
    }
  }
}
