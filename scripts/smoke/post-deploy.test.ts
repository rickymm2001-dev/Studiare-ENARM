import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildHeadersFile } from '../../src/config/csp.ts';
import { applySiteMetadata, siteFiles } from '../site-files.ts';
import { startPagesServer, type RunningPagesServer } from './local-pages.ts';
import {
  SMOKE_EXIT,
  SMOKE_USAGE,
  STRICT_RETRIES,
  STRICT_RETRY_DELAY_MS,
  SmokeUsageError,
  formatSmokeReport,
  main,
  parseSmokeArgs,
  runSmoke,
  type SmokeReport,
  type SmokeArgs,
} from './post-deploy.ts';

/** Salida capturada, para revisar qué imprime main sin ensuciar la consola de la prueba */
function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      out: (line: string) => {
        out.push(line);
      },
      err: (line: string) => {
        err.push(line);
      },
    },
  };
}

describe('argumentos de la prueba de humo (B17, 9.6)', () => {
  it('solo la dirección es production, sin strict, sin Apple y sin Supabase', () => {
    expect(parseSmokeArgs(['https://tudominio.mx'])).toEqual({
      url: 'https://tudominio.mx',
      mode: 'production',
      strict: false,
      apple: false,
      supabase: null,
    });
  });

  it('acepta todas las opciones, con --nombre valor y con --nombre=valor, y la dirección en cualquier lugar', () => {
    const expected = {
      url: 'https://tudominio.mx',
      mode: 'production',
      strict: true,
      apple: true,
      supabase: 'https://abcd1234.supabase.co',
    };
    expect(
      parseSmokeArgs([
        'https://tudominio.mx',
        '--mode',
        'production',
        '--strict',
        '--apple',
        '--supabase',
        'https://abcd1234.supabase.co',
      ]),
    ).toEqual(expected);
    expect(
      parseSmokeArgs([
        '--supabase=https://abcd1234.supabase.co',
        '--apple',
        '--mode=production',
        '--strict',
        'https://tudominio.mx',
      ]),
    ).toEqual(expected);
  });

  it('quita la diagonal final de la dirección y acepta http solo en loopback', () => {
    expect(parseSmokeArgs(['https://studiare.pages.dev/', '--mode', 'preview']).url).toBe(
      'https://studiare.pages.dev',
    );
    expect(parseSmokeArgs(['http://127.0.0.1:4173', '--mode=preview']).url).toBe(
      'http://127.0.0.1:4173',
    );
    expect(parseSmokeArgs(['http://localhost:4173/', '--mode=preview']).url).toBe(
      'http://localhost:4173',
    );
  });

  it('una vista previa se pide con --mode preview', () => {
    expect(parseSmokeArgs(['https://abc.studiare.pages.dev', '--mode', 'preview']).mode).toBe(
      'preview',
    );
  });

  it('rechaza lo que no sirve con un error de uso, sin repetir el valor que llegó', () => {
    const bad: string[][] = [
      [],
      ['--strict'],
      ['https://a.mx', 'https://b.mx'],
      ['tudominio.mx'],
      ['http://tudominio.mx'],
      ['ftp://tudominio.mx'],
      ['https://usuario:clave@tudominio.mx'],
      ['https://tudominio.mx/ruta'],
      ['https://tudominio.mx/?x=1'],
      ['https://tudominio.mx/#a'],
      ['https://tudominio.mx', '--mode'],
      ['https://tudominio.mx', '--mode', 'otro'],
      ['https://tudominio.mx', '--mode', '--strict'],
      ['https://tudominio.mx', '--supabase'],
      ['https://tudominio.mx', '--supabase', 'http://abcd1234.supabase.co'],
      ['https://tudominio.mx', '--supabase', 'https://abcd1234.supabase.co/rest/v1'],
      ['https://tudominio.mx', '--token', 'sbp_secreto_que_no_debe_repetirse'],
      ['https://tudominio.mx', '--mode', 'preview', '--strict'],
    ];
    for (const argv of bad) {
      let error: unknown;
      try {
        parseSmokeArgs(argv);
      } catch (caught) {
        error = caught;
      }
      expect(error, argv.join(' ')).toBeInstanceOf(SmokeUsageError);
      expect((error as Error).message).not.toContain('secreto_que_no_debe');
      expect((error as Error).message).not.toContain('usuario:clave');
    }
  });
});

describe('código de salida y mensajes (B17, 9.6)', () => {
  it('los códigos son 0, 1 y 2', () => {
    expect(SMOKE_EXIT).toEqual({ ok: 0, failed: 1, usage: 2 });
  });

  it('los argumentos que no sirven salen con 2 y dicen cómo se usa, sin tocar la red', async () => {
    const { err, out, io } = capture();
    const never = (() => {
      throw new Error('no debía llamar a fetch');
    }) as unknown as typeof fetch;
    expect(await main([], io, never)).toBe(SMOKE_EXIT.usage);
    expect(await main(['https://tudominio.mx', '--mode', 'otro'], io, never)).toBe(
      SMOKE_EXIT.usage,
    );
    expect(out).toEqual([]);
    expect(err).toHaveLength(2);
    for (const line of err) expect(line).toContain(SMOKE_USAGE);
  });

  it('--help sale con 0 e imprime el uso', async () => {
    const { err, out, io } = capture();
    expect(await main(['--help'], io)).toBe(SMOKE_EXIT.ok);
    expect(out).toEqual([SMOKE_USAGE]);
    expect(err).toEqual([]);
  });

  it('el uso nombra todas las opciones del contrato', () => {
    for (const piece of ['--mode', '--strict', '--apple', '--supabase', 'production', 'preview']) {
      expect(SMOKE_USAGE).toContain(piece);
    }
  });

  it('con --strict reintenta 5 veces cada 20 segundos', () => {
    expect(STRICT_RETRIES).toBe(5);
    expect(STRICT_RETRY_DELAY_MS).toBe(20_000);
  });

  it('el informe dice qué falló, lo esperado y lo encontrado, y nunca imprime un cuerpo entero', () => {
    const report: SmokeReport = {
      ok: false,
      checks: [
        { name: 'GET /', ok: true, expected: '200', found: '200' },
        { name: 'GET /repasar', ok: false, expected: '200 con el mismo index.html', found: '404' },
      ],
    };
    const text = formatSmokeReport(report);
    expect(text).toContain('ok    GET /\n');
    expect(text).toContain('FALLA GET /repasar');
    expect(text).toContain('esperado  200 con el mismo index.html');
    expect(text).toContain('encontrado  404');
    expect(text).toContain('1 de 2 revisiones fallaron');
    expect(
      formatSmokeReport({
        ok: true,
        checks: [{ name: 'GET /', ok: true, expected: '200', found: '200' }],
      }),
    ).toContain('Todo en verde, 1 revisiones');
  });
});

// Las revisiones de la tabla 2.8 contra un servidor local que imita a Cloudflare Pages (local-pages.ts). El sitio
// se arma con las mismas funciones que usa el build, así que si cambian, esta prueba lo nota
const SITE = 'https://tudominio.mx';
const NOW = new Date('2026-10-22T12:00:00.000Z');
const INDEX_SOURCE = [
  '<!doctype html><html lang="es-MX"><head><meta charset="UTF-8" />',
  '<meta property="og:image" content="%BASE_URL%og-image.png" />',
  '<!--seo-->',
  '<title>%BRAND_TITLE%</title>',
  '<script type="module" crossorigin src="/assets/index-AbC123.js"></script>',
  '</head><body><div id="root"></div></body></html>',
].join('\n');
const APPLE_PATH = '/.well-known/apple-developer-merchantid-domain-association';

interface SiteOptions {
  /** Producción trae canonical, sitemap y Allow. Preview trae Disallow / */
  production: boolean;
  apple?: boolean;
}

/** Escribe una carpeta con lo mismo que deja el build de producción (o de vista previa) */
function writeSite(dir: string, { production, apple = false }: SiteOptions): void {
  const site = production ? SITE : undefined;
  mkdirSync(join(dir, 'assets'), { recursive: true });
  const html = applySiteMetadata(INDEX_SOURCE.replace('%BASE_URL%', '/'), { site, base: '/' });
  writeFileSync(join(dir, 'index.html'), html);
  writeFileSync(join(dir, 'assets', 'index-AbC123.js'), 'console.log(1)');
  writeFileSync(join(dir, 'sw.js'), 'self.addEventListener("fetch",()=>{})');
  writeFileSync(join(dir, 'manifest.webmanifest'), JSON.stringify({ scope: '/', start_url: '/' }));
  const png = Buffer.alloc(52_000);
  Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(png);
  writeFileSync(join(dir, 'og-image.png'), png);
  for (const file of siteFiles({
    appEnv: production ? 'production' : 'demo',
    siteUrl: site,
    supportEmail: undefined,
    now: NOW,
  })) {
    writeFileSync(join(dir, file.fileName), file.source);
  }
  if (apple) {
    mkdirSync(join(dir, '.well-known'), { recursive: true });
    writeFileSync(join(dir, APPLE_PATH.slice(1)), '7B227073704964223A2022707275656261227D');
  }
  writeFileSync(join(dir, '_headers'), buildHeadersFile({}, { appleDomainFile: apple }));
}

const urlOf = (input: string | URL | Request): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/** Desvía las peticiones al dominio de prueba hacia el servidor local. Lo demás pasa tal cual */
function viaLocal(
  local: string,
  extra?: (url: string, init?: RequestInit) => Response | undefined,
) {
  return ((input: string | URL | Request, init?: RequestInit) => {
    const url = urlOf(input);
    const special = extra?.(url, init);
    if (special) return Promise.resolve(special);
    return fetch(url.replace(SITE, local), init);
  }) as typeof fetch;
}

const NO_WAIT = { sleep: () => Promise.resolve() };
const failedNames = (report: SmokeReport) =>
  report.checks.filter((check) => !check.ok).map((check) => check.name);

describe('revisiones de la tabla 2.8 contra un servidor que imita a Pages', () => {
  let server: RunningPagesServer;
  let dir = '';
  let local = '';

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'enarm-smoke-'));
    writeSite(dir, { production: true });
    server = await startPagesServer(dir);
    local = server.url;
  });
  afterAll(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });
  afterEach(() => {
    // Cada prueba que rompe algo lo deja como estaba
    rmSync(dir, { recursive: true, force: true });
    writeSite(dir, { production: true });
  });

  const production = (extra: Partial<SmokeArgs> = {}): SmokeArgs => ({
    ...parseSmokeArgs([SITE]),
    ...extra,
  });
  const run = (args: SmokeArgs, fetchImpl = viaLocal(local)) =>
    runSmoke(args, fetchImpl, { ...NO_WAIT, env: {} });

  it('un sitio bueno de producción da verde, con una revisión por renglón de la tabla', async () => {
    const report = await run(production());
    expect(failedNames(report)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.checks.map((check) => check.name)).toEqual([
      'GET /',
      'GET /repasar',
      'Encabezados de /',
      'Archivo con huella en /assets/',
      'GET /sw.js',
      'GET /manifest.webmanifest',
      'GET /robots.txt',
      'GET /sitemap.xml',
      'GET /og-image.png',
    ]);
  });

  it('un sitio bueno de vista previa da verde con Disallow / y sin sitemap', async () => {
    rmSync(dir, { recursive: true, force: true });
    writeSite(dir, { production: false });
    const report = await run(production({ mode: 'preview' }));
    expect(failedNames(report)).toEqual([]);
  });

  it('con --apple pide el archivo de Apple y distingue el archivo de la portada', async () => {
    const missing = await run(production({ apple: true }));
    expect(failedNames(missing)).toEqual([`GET ${APPLE_PATH}`]);
    expect(missing.checks.find((check) => !check.ok)?.found).toContain('no es el archivo de Apple');
    rmSync(dir, { recursive: true, force: true });
    writeSite(dir, { production: true, apple: true });
    const present = await run(production({ apple: true }));
    expect(present.ok).toBe(true);
    const names = present.checks.map((check) => check.name);
    expect(names).toContain(`GET ${APPLE_PATH}`);
    // La regla de _headers le pone texto plano
    const response = await fetch(`${local}${APPLE_PATH}`);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
  });

  // Una falla por revisión. Cada caso rompe una sola cosa y solo esa revisión debe fallar
  const breakIt: [string, string, (directory: string) => void][] = [
    [
      'GET /',
      'sin canonical',
      (d) => {
        writeFileSync(join(d, 'index.html'), INDEX_SOURCE.replace('<!--seo-->', ''));
      },
    ],
    [
      'GET /repasar',
      'hay un 404.html, como en GitHub Pages',
      (d) => {
        writeFileSync(join(d, '404.html'), '<html>no</html>');
      },
    ],
    [
      'Encabezados de /',
      'sin la regla de seguridad en _headers',
      (d) => {
        writeFileSync(
          join(d, '_headers'),
          buildHeadersFile().replace(/Strict-Transport-Security.*\n/, ''),
        );
      },
    ],
    [
      'Archivo con huella en /assets/',
      'sin caché inmutable',
      (d) => {
        writeFileSync(
          join(d, '_headers'),
          buildHeadersFile().replace(/\/assets\/\*\n.*\n/, '/assets/*\n  X-Otro: 1\n'),
        );
      },
    ],
    [
      'GET /sw.js',
      'sin service worker',
      (d) => {
        rmSync(join(d, 'sw.js'));
      },
    ],
    [
      'GET /manifest.webmanifest',
      'scope distinto',
      (d) => {
        writeFileSync(
          join(d, 'manifest.webmanifest'),
          JSON.stringify({ scope: '/app/', start_url: '/' }),
        );
      },
    ],
    [
      'GET /robots.txt',
      'robots sin Sitemap',
      (d) => {
        writeFileSync(join(d, 'robots.txt'), 'User-agent: *\nAllow: /\n');
      },
    ],
    [
      'GET /sitemap.xml',
      'sitemap con una ruta de más',
      (d) => {
        const file = join(d, 'sitemap.xml');
        writeFileSync(
          file,
          '<urlset><loc>https://tudominio.mx/</loc><loc>https://tudominio.mx/repasar</loc></urlset>',
        );
      },
    ],
    [
      'GET /og-image.png',
      'imagen de 400 KB',
      (d) => {
        writeFileSync(join(d, 'og-image.png'), Buffer.alloc(400 * 1024));
      },
    ],
  ];
  it.each(breakIt)('si falla %s (%s), solo esa revisión falla', async (name, _why, change) => {
    change(dir);
    const report = await run(production());
    expect(failedNames(report)).toEqual([name]);
    const failure = report.checks.find((check) => !check.ok);
    expect(failure?.expected).not.toBe('');
    expect(failure?.found).not.toBe('ok');
    expect(report.ok).toBe(false);
  });

  it('la falla dice lo esperado y lo encontrado, nunca el cuerpo completo', async () => {
    rmSync(join(dir, 'sw.js'));
    const report = await run(production());
    const text = formatSmokeReport(report);
    expect(text).toContain('FALLA GET /sw.js');
    expect(text).toContain('esperado  200, JavaScript y sin immutable');
    expect(text.length).toBeLessThan(1500);
  });

  it('la vista previa falla si robots deja indexar', async () => {
    const report = await run(production({ mode: 'preview' }));
    expect(failedNames(report)).toEqual(['GET /robots.txt', 'GET /sitemap.xml']);
  });

  it('SITE_URL deja probar un despliegue de pages.dev contra el dominio futuro', async () => {
    // El build apunta a tudominio.mx, pero se prueba en la dirección del servidor local
    const args = parseSmokeArgs([local]);
    const withoutVariable = await runSmoke(args, fetch, { ...NO_WAIT, env: {} });
    expect(failedNames(withoutVariable)).toContain('GET /');
    const withVariable = await runSmoke(args, fetch, { ...NO_WAIT, env: { SITE_URL: SITE } });
    expect(failedNames(withVariable)).toEqual([]);
  });

  it('una SITE_URL que no es una dirección falla con su propia revisión, sin tocar la red', async () => {
    const never = (() => {
      throw new Error('no debía llamar a fetch');
    }) as unknown as typeof fetch;
    const report = await runSmoke(production(), never, {
      ...NO_WAIT,
      env: { SITE_URL: 'tudominio.mx' },
    });
    expect(failedNames(report)).toEqual(['SITE_URL']);
  });

  it('un servidor que no responde da una falla por revisión y no un error', async () => {
    const down = (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch;
    const report = await runSmoke(production(), down, { ...NO_WAIT, env: {} });
    expect(report.ok).toBe(false);
    expect(report.checks.length).toBeGreaterThanOrEqual(8);
    for (const check of report.checks) expect(check.found).toMatch(/sin respuesta|no respondió/);
  });

  describe('--supabase', () => {
    const preflight = (allowed: boolean) =>
      viaLocal(local, (url, init) => {
        if (!url.includes('/functions/v1/ai-proxy')) return undefined;
        const origin = new Headers(init?.headers).get('origin');
        if (init?.method !== 'OPTIONS') return new Response(null, { status: 405 });
        if (origin === SITE && allowed) {
          return new Response(null, {
            status: 204,
            headers: { 'access-control-allow-origin': SITE },
          });
        }
        return new Response('{"error":"origin_not_allowed"}', { status: 403 });
      });
    const withSupabase = production({ supabase: 'https://abcd1234.supabase.co' });

    it('204 con el origen del sitio y 403 con uno ajeno da verde, sin mandar llaves', async () => {
      const seen: Headers[] = [];
      const spy = ((input: string | URL | Request, init?: RequestInit) => {
        if (urlOf(input).includes('supabase.co')) seen.push(new Headers(init?.headers));
        return preflight(true)(input, init);
      }) as typeof fetch;
      const report = await run(withSupabase, spy);
      expect(report.ok).toBe(true);
      expect(report.checks.map((check) => check.name).slice(-2)).toEqual([
        'OPTIONS ai-proxy con el origen del sitio',
        'OPTIONS ai-proxy con un origen ajeno',
      ]);
      expect(seen).toHaveLength(2);
      for (const headers of seen) {
        expect(headers.get('authorization')).toBeNull();
        expect(headers.get('apikey')).toBeNull();
      }
    });

    it('falla si el origen del sitio no está permitido todavía', async () => {
      const report = await run(withSupabase, preflight(false));
      expect(failedNames(report)).toEqual(['OPTIONS ai-proxy con el origen del sitio']);
    });

    it('falla si un origen ajeno recibe permiso', async () => {
      const open = viaLocal(local, (url) =>
        url.includes('supabase.co')
          ? new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*' } })
          : undefined,
      );
      const report = await run(withSupabase, open);
      expect(failedNames(report)).toEqual([
        'OPTIONS ai-proxy con el origen del sitio',
        'OPTIONS ai-proxy con un origen ajeno',
      ]);
    });
  });

  describe('--strict', () => {
    const strictArgs = production({ strict: true });
    const redirect = (to: string) => new Response(null, { status: 301, headers: { location: to } });
    const goodDomain = (url: string) => {
      if (url === 'http://tudominio.mx/') return redirect('https://tudominio.mx/');
      if (url === 'https://www.tudominio.mx/') return redirect('https://tudominio.mx/');
      if (url === 'https://studiare.pages.dev/') {
        return new Response('', { status: 200, headers: { 'x-robots-tag': 'noindex' } });
      }
      return undefined;
    };

    it('http a https, www al dominio sin www y noindex en pages.dev dan verde', async () => {
      const report = await run(strictArgs, viaLocal(local, goodDomain));
      expect(failedNames(report)).toEqual([]);
      expect(report.checks.map((check) => check.name).slice(-3)).toEqual([
        'http redirige a https',
        'www redirige al dominio sin www',
        'pages.dev responde noindex',
      ]);
    });

    it('cada una falla por su lado', async () => {
      const noRedirects = viaLocal(local, (url) => {
        if (url === 'http://tudominio.mx/') return new Response('', { status: 200 });
        if (url === 'https://www.tudominio.mx/') return redirect('https://otro.mx/');
        if (url === 'https://studiare.pages.dev/') return new Response('', { status: 200 });
        return undefined;
      });
      const report = await run(strictArgs, noRedirects);
      expect(failedNames(report)).toEqual([
        'http redirige a https',
        'www redirige al dominio sin www',
        'pages.dev responde noindex',
      ]);
    });

    it('usa CLOUDFLARE_PAGES_PROJECT para la dirección de pages.dev', async () => {
      const urls: string[] = [];
      const fetchImpl = viaLocal(local, (url) => {
        urls.push(url);
        return (
          goodDomain(url) ??
          (url === 'https://mi-proyecto.pages.dev/'
            ? new Response('', { headers: { 'x-robots-tag': 'noindex, nofollow' } })
            : undefined)
        );
      });
      const report = await runSmoke(strictArgs, fetchImpl, {
        ...NO_WAIT,
        env: { CLOUDFLARE_PAGES_PROJECT: 'mi-proyecto' },
      });
      expect(report.ok).toBe(true);
      expect(urls).toContain('https://mi-proyecto.pages.dev/');
    });

    it('reintenta 5 veces cada 20 segundos mientras algo falle y se detiene en cuanto todo pasa', async () => {
      const waits: number[] = [];
      let passes = 0;
      const flaky = viaLocal(local, (url) => {
        if (url === 'http://tudominio.mx/') {
          passes += 1;
          // Los primeros tres intentos todavía no redirigen: el DNS y el certificado tardan
          return passes <= 3
            ? new Response('', { status: 200 })
            : redirect('https://tudominio.mx/');
        }
        return goodDomain(url);
      });
      const report = await runSmoke(strictArgs, flaky, {
        env: {},
        sleep: (ms) => {
          waits.push(ms);
          return Promise.resolve();
        },
      });
      expect(report.ok).toBe(true);
      expect(waits).toEqual([STRICT_RETRY_DELAY_MS, STRICT_RETRY_DELAY_MS, STRICT_RETRY_DELAY_MS]);
    });

    it('si nunca pasa, agota 1 intento más STRICT_RETRIES reintentos y falla', async () => {
      const waits: number[] = [];
      const report = await runSmoke(strictArgs, viaLocal(local), {
        env: {},
        sleep: (ms) => {
          waits.push(ms);
          return Promise.resolve();
        },
      });
      expect(report.ok).toBe(false);
      expect(waits).toHaveLength(STRICT_RETRIES);
    });

    it('sin --strict no reintenta ni espera', async () => {
      const waits: number[] = [];
      writeFileSync(join(dir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
      const report = await runSmoke(production(), viaLocal(local), {
        env: {},
        sleep: (ms) => {
          waits.push(ms);
          return Promise.resolve();
        },
      });
      expect(report.ok).toBe(false);
      expect(waits).toEqual([]);
    });
  });

  it('main sale con 0 si todo pasa y con 1 si algo falla, e imprime el informe', async () => {
    const good = capture();
    expect(await main([SITE], good.io, viaLocal(local))).toBe(SMOKE_EXIT.ok);
    expect(good.out.join('\n')).toContain('Todo en verde');
    rmSync(join(dir, 'sw.js'));
    const bad = capture();
    expect(await main([SITE], bad.io, viaLocal(local))).toBe(SMOKE_EXIT.failed);
    expect(bad.err.join('\n')).toContain('FALLA GET /sw.js');
    expect(bad.out).toEqual([]);
  });
});
