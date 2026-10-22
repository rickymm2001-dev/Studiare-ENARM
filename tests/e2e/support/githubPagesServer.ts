// Un servidor que se porta como GitHub Pages para las pruebas de la mudanza (B17, 3.4 del plan de B17). Sirve una
// carpeta bajo una ruta (/Studiare-ENARM), manda a la ruta con diagonal final y, a cualquier otra que no existe,
// responde el 404.html de la carpeta con código 404, que es como GitHub Pages deja abrir un enlace directo a
// /Studiare-ENARM/repasar. La carpeta se puede cambiar mientras el servidor vive (reemplazar la demo por el sitio de
// mudanza), y los archivos se leen en cada petición. Sin caché, para que el navegador revise sw.js de verdad
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, sep } from 'node:path';
import { CONTENT_TYPES } from '../../../scripts/smoke/local-pages';

export interface GithubPagesServer {
  /** http://127.0.0.1:PUERTO, sin ruta */
  origin: string;
  /** Cambia la carpeta que se sirve */
  serve: (directory: string) => void;
  close: () => Promise<void>;
}

/** prefix va con diagonal inicial y sin la final, como /Studiare-ENARM */
export async function startGithubPagesServer(
  directory: string,
  prefix: string,
): Promise<GithubPagesServer> {
  let root = directory;
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === prefix) {
      response.writeHead(301, { location: `${prefix}/${url.search}` }).end();
      return;
    }
    if (!url.pathname.startsWith(`${prefix}/`)) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No existe\n');
      return;
    }
    const relative = normalize(decodeURIComponent(url.pathname.slice(prefix.length)));
    const candidate = join(root, relative);
    const inside = candidate === root || candidate.startsWith(`${root}${sep}`);
    const file = inside && relative.endsWith(sep) ? join(candidate, 'index.html') : candidate;
    const headers = { 'cache-control': 'no-store' };
    if (inside && existsSync(file) && statSync(file).isFile()) {
      response
        .writeHead(200, {
          ...headers,
          'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        })
        .end(readFileSync(file));
      return;
    }
    const notFound = join(root, '404.html');
    if (existsSync(notFound)) {
      response
        .writeHead(404, { ...headers, 'content-type': CONTENT_TYPES['.html'] ?? 'text/html' })
        .end(readFileSync(notFound));
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No existe\n');
  });
  await new Promise<void>((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', done);
  });
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    serve: (next) => {
      root = next;
    },
    close: () =>
      new Promise<void>((closed) => {
        server.close(() => {
          closed();
        });
        server.closeAllConnections();
      }),
  };
}
