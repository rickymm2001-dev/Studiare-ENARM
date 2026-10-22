// El servidor que imita a Cloudflare Pages (local-pages.ts) y el lector de _headers que usa. La prueba de humo
// se apoya en él para probar un build sin publicar, así que se revisa con el archivo _headers de verdad.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildHeadersFile } from '../../src/config/csp.ts';
import {
  headersFor,
  parseHeadersFile,
  startPagesServer,
  type RunningPagesServer,
} from './local-pages.ts';

describe('parseHeadersFile y headersFor', () => {
  const rules = parseHeadersFile(buildHeadersFile({}, { appleDomainFile: true }));

  it('lee las cinco reglas que escribe el build, con sus encabezados', () => {
    expect(rules.map((rule) => rule.pattern)).toEqual([
      '/*',
      '/assets/*',
      '/.well-known/apple-developer-merchantid-domain-association',
      'https://:project.pages.dev/*',
      'https://:version.:project.pages.dev/*',
    ]);
    expect(rules[0]?.headers.map(([name]) => name)).toEqual([
      'Content-Security-Policy',
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'X-Frame-Options',
    ]);
    // El valor conserva los dos puntos de adentro, como el de https://
    expect(rules[3]?.headers).toEqual([['X-Robots-Tag', 'noindex']]);
  });

  const names = (path: string, origin = 'http://127.0.0.1:4180') =>
    headersFor(rules, new URL(path, origin)).map(([name]) => name);

  it('la regla de /* aplica a todo y /assets/* solo a los archivos con huella', () => {
    expect(names('/')).toHaveLength(6);
    expect(names('/repasar')).toHaveLength(6);
    expect(names('/assets/index-abc.js')).toContain('Cache-Control');
    expect(names('/sw.js')).not.toContain('Cache-Control');
    expect(names('/manifest.webmanifest')).not.toContain('Cache-Control');
    expect(names('/assetsx/a.js')).not.toContain('Cache-Control');
  });

  it('la del archivo de Apple solo aplica a su ruta', () => {
    expect(names('/.well-known/apple-developer-merchantid-domain-association')).toContain(
      'Content-Type',
    );
    expect(names('/.well-known/security.txt')).not.toContain('Content-Type');
  });

  it('noindex solo aplica en pages.dev, también en las direcciones de cada versión', () => {
    expect(names('/', 'https://studiare.pages.dev')).toContain('X-Robots-Tag');
    expect(names('/repasar', 'https://abc123.studiare.pages.dev')).toContain('X-Robots-Tag');
    expect(names('/', 'https://tudominio.mx')).not.toContain('X-Robots-Tag');
    expect(names('/', 'https://www.tudominio.mx')).not.toContain('X-Robots-Tag');
    expect(names('/')).not.toContain('X-Robots-Tag');
    // Un dominio que solo termina parecido no cuenta
    expect(names('/', 'https://studiare.pages.dev.malo.mx')).not.toContain('X-Robots-Tag');
  });

  it('ignora comentarios y líneas vacías', () => {
    expect(parseHeadersFile('# nota\n\n/a\n  X-A: 1\n# otra\n  X-B: dos: tres\n')).toEqual([
      {
        pattern: '/a',
        headers: [
          ['X-A', '1'],
          ['X-B', 'dos: tres'],
        ],
      },
    ]);
  });
});

describe('servidor que imita a Pages', () => {
  let server: RunningPagesServer;
  let dir = '';
  let outside = '';

  beforeAll(async () => {
    const parent = mkdtempSync(join(tmpdir(), 'enarm-pages-'));
    dir = join(parent, 'dist');
    outside = join(parent, 'secreto.txt');
    mkdirSync(join(dir, 'assets'), { recursive: true });
    writeFileSync(outside, 'esto no debe salir de la carpeta');
    writeFileSync(join(dir, 'index.html'), '<html>portada</html>');
    writeFileSync(join(dir, 'assets', 'a-1.js'), 'x');
    writeFileSync(join(dir, '_headers'), buildHeadersFile());
    server = await startPagesServer(dir);
  });
  afterAll(async () => {
    await server.close();
    rmSync(join(dir, '..'), { recursive: true, force: true });
  });

  it('sirve la portada, aplica _headers y deja la revalidación de Pages donde no hay regla', async () => {
    const home = await fetch(`${server.url}/`);
    expect(home.status).toBe(200);
    expect(home.headers.get('content-type')).toContain('text/html');
    expect(home.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(home.headers.get('access-control-allow-origin')).toBe('*');
    expect(home.headers.get('x-frame-options')).toBe('DENY');
    expect(home.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    const asset = await fetch(`${server.url}/assets/a-1.js`);
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(asset.headers.get('content-type')).toContain('javascript');
  });

  it('una ruta que no es un archivo devuelve index.html con 200, como una aplicación de una sola página', async () => {
    const response = await fetch(`${server.url}/repasar`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<html>portada</html>');
  });

  it('con ETag responde 304 a quien ya tiene el archivo', async () => {
    const first = await fetch(`${server.url}/assets/a-1.js`);
    const etag = first.headers.get('etag') ?? '';
    expect(etag).not.toBe('');
    const second = await fetch(`${server.url}/assets/a-1.js`, {
      headers: { 'if-none-match': etag },
    });
    expect(second.status).toBe(304);
  });

  it('no sirve nada fuera de la carpeta ni acepta otros métodos', async () => {
    for (const path of [
      '/..%2fsecreto.txt',
      '/%2e%2e/secreto.txt',
      '/assets/..%2f..%2fsecreto.txt',
    ]) {
      const response = await fetch(`${server.url}${path}`);
      expect(await response.text(), path).not.toContain('esto no debe salir');
    }
    const post = await fetch(`${server.url}/`, { method: 'POST' });
    expect(post.status).toBe(405);
  });

  it('con 404.html, como GitHub Pages, una ruta desconocida responde ese archivo con 404', async () => {
    writeFileSync(join(dir, '404.html'), '<html>no existe</html>');
    try {
      const response = await fetch(`${server.url}/repasar`);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('<html>no existe</html>');
    } finally {
      rmSync(join(dir, '404.html'));
    }
  });
});
