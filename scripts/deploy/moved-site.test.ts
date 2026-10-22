// El sitio de mudanza de GitHub Pages (B17, 3.4). La función que decide a dónde va cada visita es la misma que
// corre en la página, así que se prueba aquí con una tabla. El service worker de despedida y la página se corren
// con objetos falsos del navegador. La prueba con un navegador de verdad está en tests/e2e/moved-site.spec.ts
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { RUNTIME_CACHE_NAMES } from '../runtime-caches.ts';
import {
  DESTINATION_SOURCE,
  FAREWELL_WORKER,
  META_REFRESH_SECONDS,
  MOVED_SITE_ICONS,
  MovedSiteError,
  REDIRECT_DELAY_MS,
  movedBaseOf,
  movedDestination,
  movedPage,
  movedSiteFiles,
  movedTargetOf,
  redirectScript,
  writeMovedSite,
} from './moved-site.ts';

const TARGET = 'https://tudominio.mx';
const BASE = '/Studiare-ENARM/';
const OLD = 'https://usuario.github.io';

describe('movedDestination, a dónde va cada visita', () => {
  const go = (href: string, base = BASE) => movedDestination(TARGET, base, href);

  it('quita la ruta de la demo y conserva la ruta, la consulta y el fragmento', () => {
    expect(go(`${OLD}/Studiare-ENARM/repasar`)).toBe(`${TARGET}/repasar`);
    expect(go(`${OLD}/Studiare-ENARM/repasar?ref=ABC`)).toBe(`${TARGET}/repasar?ref=ABC`);
    expect(go(`${OLD}/Studiare-ENARM/party?grupo=G1&ref=ABC#unirme`)).toBe(
      `${TARGET}/party?grupo=G1&ref=ABC#unirme`,
    );
    expect(go(`${OLD}/Studiare-ENARM/simular/examen/resultados`)).toBe(
      `${TARGET}/simular/examen/resultados`,
    );
  });

  it('la raíz de la demo va a la raíz del dominio, con o sin diagonal final', () => {
    expect(go(`${OLD}/Studiare-ENARM/`)).toBe(`${TARGET}/`);
    expect(go(`${OLD}/Studiare-ENARM`)).toBe(`${TARGET}/`);
    expect(go(`${OLD}/Studiare-ENARM/?ref=ABC`)).toBe(`${TARGET}/?ref=ABC`);
  });

  it('la sesión de un enlace de acceso reciente viaja en el fragmento y no se pierde', () => {
    expect(go(`${OLD}/Studiare-ENARM/#access_token=abc.def.ghi&type=magiclink`)).toBe(
      `${TARGET}/#access_token=abc.def.ghi&type=magiclink`,
    );
  });

  it('sin ruta de demo (base vacía, como con un dominio propio en GitHub Pages) deja la ruta tal cual', () => {
    expect(go(`${OLD}/repasar?ref=ABC#x`, '/')).toBe(`${TARGET}/repasar?ref=ABC#x`);
    expect(go(`${OLD}/`, '/')).toBe(`${TARGET}/`);
    expect(go(`${OLD}/`, '')).toBe(`${TARGET}/`);
  });

  it('una dirección que no es del sitio cae a la raíz del dominio nuevo', () => {
    for (const href of [
      'no es una dirección',
      '',
      'mailto:alguien@ejemplo.mx',
      'javascript:alert(1)',
      'data:text/html,hola',
      'file:///etc/passwd',
      // Fuera de la ruta de la demo, aunque se parezca
      `${OLD}/otro-repositorio/repasar`,
      `${OLD}/Studiare-ENARM-viejo/repasar`,
      `${OLD}/repasar`,
      // Después de quitar la ruta de la demo quedaría //otro.com, que un navegador leería como otro sitio
      `${OLD}/Studiare-ENARM//otro.com/camino`,
      `${OLD}/Studiare-ENARM/\\otro.com`,
      `${OLD}/Studiare-ENARM/%2F%2Fotro.com`,
    ]) {
      const destination = go(href);
      expect(destination === `${TARGET}/` || destination.startsWith(`${TARGET}/`), href).toBe(true);
      // Nunca cambia de dominio
      expect(new URL(destination).origin, href).toBe(TARGET);
    }
    expect(go('no es una dirección')).toBe(`${TARGET}/`);
    expect(go(`${OLD}/otro-repositorio/repasar`)).toBe(`${TARGET}/`);
    expect(go(`${OLD}/Studiare-ENARM//otro.com/camino`)).toBe(`${TARGET}/`);
  });

  it('las rutas con puntos no se salen de la ruta de la demo ni del dominio', () => {
    expect(go(`${OLD}/Studiare-ENARM/../otro/repasar`)).toBe(`${TARGET}/`);
    expect(go(`${OLD}/Studiare-ENARM/a/../repasar`)).toBe(`${TARGET}/repasar`);
    expect(go(`${OLD}/Studiare-ENARM/./repasar`)).toBe(`${TARGET}/repasar`);
  });

  it('el origen de la dirección vieja no importa, solo su ruta', () => {
    expect(go('http://localhost:4173/Studiare-ENARM/repasar?x=1')).toBe(`${TARGET}/repasar?x=1`);
  });

  it('la función que se publica es una sola y trae el texto de las reglas', () => {
    expect(DESTINATION_SOURCE).toContain("url.protocol !== 'http:'");
    expect(DESTINATION_SOURCE).not.toContain('`');
  });
});

describe('validación de lo que llega por la línea de comandos', () => {
  it('el sitio nuevo es un origen https sin nada más', () => {
    expect(movedTargetOf('https://tudominio.mx')).toBe(TARGET);
    expect(movedTargetOf(' https://tudominio.mx/ ')).toBe(TARGET);
    for (const bad of [
      '',
      'tudominio.mx',
      'http://tudominio.mx',
      'https://tudominio.mx/ruta',
      'https://tudominio.mx/?a=1',
      'https://tudominio.mx/#a',
      'https://usuario:clave@tudominio.mx',
      'https://tudominio.mx\nhttps://malo.mx',
      'javascript:alert(1)',
    ]) {
      expect(() => movedTargetOf(bad), bad).toThrow(MovedSiteError);
    }
  });

  it('la ruta de la demo se normaliza con diagonales y rechaza lo raro', () => {
    expect(movedBaseOf('/Studiare-ENARM')).toBe('/Studiare-ENARM/');
    expect(movedBaseOf('Studiare-ENARM/')).toBe('/Studiare-ENARM/');
    expect(movedBaseOf('')).toBe('/');
    expect(movedBaseOf('/')).toBe('/');
    for (const bad of [
      '/..',
      '/a/../b',
      '/a b',
      '/a"b',
      '//otro.com',
      '/a?b=1',
      '/<x>',
      'http://x.mx/a',
    ]) {
      expect(() => movedBaseOf(bad), bad).toThrow(MovedSiteError);
    }
  });
});

describe('la página', () => {
  const page = movedPage(TARGET, BASE);
  // El navegador junta los espacios y los saltos de línea, así que el texto se compara igual
  const text = page.replace(/\s+/g, ' ');

  it('dice en español de México que cambió de dirección, a dónde y que ya la llevan', () => {
    expect(page).toContain('<html lang="es-MX">');
    expect(page).toContain('<h1>Studiare cambió de dirección</h1>');
    expect(page).toContain('<p role="status">');
    expect(page).toMatch(
      /Ahora vive en <a id="enlace" href="https:\/\/tudominio\.mx\/">tudominio\.mx<\/a>\./,
    );
    expect(text).toContain('Te llevamos allá en unos segundos.');
    // Con cuenta entra con su correo, y sin cuenta sus datos se quedaron en el navegador
    expect(text).toContain('Con cuenta, entra allá con tu correo y tu estudio se sincroniza.');
    expect(text).toContain('tus datos se quedaron en este navegador y no pasan solos.');
  });

  it('tiene un respaldo sin JavaScript, dentro de noscript, que lleva a la raíz del dominio nuevo', () => {
    expect(text).toContain(
      `<noscript> <meta http-equiv="refresh" content="${String(META_REFRESH_SECONDS)};url=https://tudominio.mx/" /> </noscript>`,
    );
    // Fuera de noscript no hay ninguna actualización automática, que axe marca como falla y le quita tiempo a quien lo necesita
    expect(text.replace(/<noscript>.*?<\/noscript>/g, '')).not.toContain('http-equiv="refresh"');
    expect(META_REFRESH_SECONDS * 1000).toBeGreaterThan(REDIRECT_DELAY_MS);
  });

  it('no trae scripts en línea, ni analítica, ni nada de terceros, y su política lo impide', () => {
    expect(page).toContain("default-src 'none'; script-src 'self'; style-src 'self'");
    const inline = [...page.matchAll(/<script\b([^>]*)>/g)].filter(
      ([, attributes]) => !/\bsrc=/.test(attributes ?? ''),
    );
    expect(inline).toEqual([]);
    expect(page).not.toMatch(/\son[a-z]+=|javascript:|<style|style=/i);
    // Las únicas direcciones completas son la del sitio nuevo
    const absolute = [...page.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((match) => match[0]);
    expect(new Set(absolute)).toEqual(new Set([`${TARGET}/`]));
  });

  it('sus archivos van con la ruta absoluta de la demo, para que carguen desde cualquier ruta profunda', () => {
    for (const file of [
      'moved.css',
      'moved.js',
      'manifest.webmanifest',
      'pwa-192x192.png',
      'favicon-64x64.png',
    ]) {
      expect(page, file).toContain(`"${BASE}${file}"`);
    }
    expect(movedPage(TARGET, '/').includes('"/moved.js"')).toBe(true);
  });

  it('index.html y 404.html son el mismo archivo, y hay un service worker, un manifest y los estilos', () => {
    const files = movedSiteFiles({ movedTo: TARGET, base: '/Studiare-ENARM' });
    expect(Object.keys(files).sort()).toEqual([
      '404.html',
      'index.html',
      'manifest.webmanifest',
      'moved.css',
      'moved.js',
      'sw.js',
    ]);
    expect(files['404.html']).toBe(files['index.html']);
    expect(files['sw.js']).toBe(FAREWELL_WORKER);
  });

  it('el manifest conserva el id y el alcance de la app vieja', () => {
    const manifest = JSON.parse(
      movedSiteFiles({ movedTo: TARGET, base: BASE })['manifest.webmanifest'] ?? '{}',
    ) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      id: BASE,
      scope: BASE,
      start_url: BASE,
      name: 'Studiare',
      display: 'standalone',
    });
  });
});

/** Un navegador de mentira para correr moved.js */
function runRedirect(href: string, base = BASE) {
  const calls = { replaced: [] as string[], focused: 0, timers: [] as number[] };
  const link = {
    attributes: {} as Record<string, string>,
    setAttribute(name: string, value: string) {
      this.attributes[name] = value;
    },
    focus() {
      calls.focused += 1;
    },
  };
  const pending: (() => void)[] = [];
  const sandbox = {
    URL,
    window: {
      location: {
        href,
        replace: (destination: string) => {
          calls.replaced.push(destination);
        },
      },
      setTimeout: (fn: () => void, delay: number) => {
        calls.timers.push(delay);
        pending.push(fn);
        return pending.length;
      },
    },
    document: { getElementById: (id: string) => (id === 'enlace' ? link : null) },
  };
  runInNewContext(redirectScript(TARGET, movedBaseOf(base)), sandbox);
  return {
    calls,
    link,
    fire: () => {
      for (const fn of pending) fn();
    },
  };
}

describe('moved.js, la redirección', () => {
  it('pone el foco en el enlace, apunta el enlace a la ruta de la visita y espera 5 segundos', () => {
    const run = runRedirect(`${OLD}/Studiare-ENARM/repasar?ref=ABC#x`);
    expect(run.calls.focused).toBe(1);
    expect(run.link.attributes.href).toBe(`${TARGET}/repasar?ref=ABC#x`);
    expect(run.calls.timers).toEqual([5000]);
    // Todavía no se fue: la persona alcanza a leer
    expect(run.calls.replaced).toEqual([]);
    run.fire();
    expect(run.calls.replaced).toEqual([`${TARGET}/repasar?ref=ABC#x`]);
  });

  it('usa replace y no assign, para que Atrás no regrese a la página de mudanza', () => {
    expect(redirectScript(TARGET, BASE)).toContain('window.location.replace(destination)');
    expect(redirectScript(TARGET, BASE)).not.toMatch(/location\.(assign|href\s*=)/);
  });

  it('una dirección rara lleva a la raíz del dominio nuevo', () => {
    const run = runRedirect(`${OLD}/Studiare-ENARM//otro.com`);
    run.fire();
    expect(run.calls.replaced).toEqual([`${TARGET}/`]);
  });

  it('las dos copias de la función, la de la página y la de TypeScript, dan lo mismo', () => {
    for (const path of ['/Studiare-ENARM/', '/Studiare-ENARM/a/b?c=1#d', '/otra/cosa']) {
      const run = runRedirect(`${OLD}${path}`);
      run.fire();
      expect(run.calls.replaced[0]).toBe(movedDestination(TARGET, BASE, `${OLD}${path}`));
    }
  });
});

/**
 * Los cachés que hay en el origen de un sitio de usuario de GitHub Pages: los de Studiare y los de otra página del
 * mismo usuario, porque todos los proyectos comparten el almacén de cachés
 */
const CACHES_IN_ORIGIN = [
  `workbox-precache-v2-${OLD}/Studiare-ENARM/`,
  'simulate-worker',
  'import-engine',
  'pdf-reader',
  'demo-media',
  // De otra página del mismo usuario, con service worker propio
  `workbox-precache-v2-${OLD}/Otro-Proyecto/`,
  `workbox-runtime-${OLD}/Otro-Proyecto/`,
  // Un proyecto que cuelga de la ruta de Studiare no es Studiare
  `workbox-precache-v2-${OLD}/Studiare-ENARM/otra/`,
  'datos-de-otra-pagina',
  'v1',
];

/** Un service worker de mentira para correr sw.js */
async function runFarewell(options: { navigateFails?: boolean } = {}) {
  const log: string[] = [];
  const listeners: Record<
    string,
    (event: { waitUntil: (promise: Promise<void>) => void }) => void
  > = {};
  const clientsList = [
    {
      url: `${OLD}/Studiare-ENARM/repasar?ref=ABC`,
      navigate: (url: string) => {
        log.push(`navigate ${url}`);
        return options.navigateFails ? Promise.reject(new Error('no')) : Promise.resolve();
      },
    },
    {
      url: `${OLD}/Studiare-ENARM/`,
      navigate: (url: string) => {
        log.push(`navigate ${url}`);
        return Promise.resolve();
      },
    },
  ];
  const self = {
    addEventListener: (
      type: string,
      fn: (event: { waitUntil: (promise: Promise<void>) => void }) => void,
    ) => {
      listeners[type] = fn;
    },
    skipWaiting: () => {
      log.push('skipWaiting');
    },
    registration: {
      scope: `${OLD}/Studiare-ENARM/`,
      unregister: () => {
        log.push('unregister');
        return Promise.resolve(true);
      },
    },
    clients: {
      matchAll: (query: unknown) => {
        log.push(`matchAll ${JSON.stringify(query)}`);
        return Promise.resolve(clientsList);
      },
    },
  };
  const caches = {
    keys: () => Promise.resolve(CACHES_IN_ORIGIN),
    delete: (key: string) => {
      log.push(`delete ${key}`);
      return Promise.resolve(true);
    },
  };
  runInNewContext(FAREWELL_WORKER, { self, caches });
  listeners.install?.({ waitUntil: () => undefined });
  let activation: Promise<void> = Promise.resolve();
  listeners.activate?.({
    waitUntil: (promise) => {
      activation = promise;
    },
  });
  await activation;
  return log;
}

describe('sw.js, el service worker de despedida', () => {
  it('se instala sin esperar, borra solo los cachés de Studiare, se desregistra y recarga cada ventana, en ese orden', async () => {
    const log = await runFarewell();
    expect(log).toEqual([
      'skipWaiting',
      `delete workbox-precache-v2-${OLD}/Studiare-ENARM/`,
      'delete simulate-worker',
      'delete import-engine',
      'delete pdf-reader',
      'delete demo-media',
      'unregister',
      'matchAll {"type":"window","includeUncontrolled":true}',
      `navigate ${OLD}/Studiare-ENARM/repasar?ref=ABC`,
      `navigate ${OLD}/Studiare-ENARM/`,
    ]);
  });

  it('no borra los cachés de otra página del mismo usuario, que comparten el almacén del origen', async () => {
    const deleted = (await runFarewell()).filter((line) => line.startsWith('delete ')).join('\n');
    for (const other of [
      'Otro-Proyecto',
      'datos-de-otra-pagina',
      'workbox-runtime',
      'Studiare-ENARM/otra/',
      'delete v1',
    ]) {
      expect(deleted, other).not.toContain(other);
    }
  });

  it('los cachés que borra son los que vite.config.ts le pone a la app', () => {
    const config = readFileSync(join(import.meta.dirname, '..', '..', 'vite.config.ts'), 'utf8');
    // vite.config.ts usa los nombres de runtime-caches.ts y ninguno suelto, así la despedida no se queda atrás
    expect(config).toContain("from './scripts/runtime-caches.ts'");
    expect(config.match(/cacheName: /g)).toHaveLength(RUNTIME_CACHE_NAMES.length);
    expect(config.match(/cacheName: RUNTIME_CACHES\.\w+/g)).toHaveLength(
      RUNTIME_CACHE_NAMES.length,
    );
    expect(FAREWELL_WORKER).toContain(JSON.stringify(RUNTIME_CACHE_NAMES));
  });

  it('una ventana que no se deja navegar no detiene a las demás', async () => {
    const log = await runFarewell({ navigateFails: true });
    expect(log.filter((line) => line.startsWith('navigate'))).toHaveLength(2);
  });

  it('recarga la misma dirección y nunca manda a otro origen, que WindowClient.navigate no permite', () => {
    expect(FAREWELL_WORKER).toContain('client.navigate(client.url)');
    expect(FAREWELL_WORKER).not.toMatch(/https?:\/\//);
    expect(FAREWELL_WORKER).not.toContain('fetch');
  });
});

describe('writeMovedSite y la línea de comandos', () => {
  it('escribe todos los archivos y copia los íconos de public tal cual', () => {
    const dir = mkdtempSync(join(tmpdir(), 'enarm-moved-'));
    try {
      const written = writeMovedSite(join(dir, 'salida'), { movedTo: TARGET, base: BASE });
      expect(readdirSync(join(dir, 'salida')).sort()).toEqual([...written].sort());
      expect(written).toEqual(
        expect.arrayContaining([...MOVED_SITE_ICONS, 'index.html', '404.html', 'sw.js']),
      );
      for (const icon of MOVED_SITE_ICONS) {
        expect(
          readFileSync(join(dir, 'salida', icon)).equals(readFileSync(join('public', icon))),
        ).toBe(true);
      }
      expect(readFileSync(join(dir, 'salida', 'index.html'), 'utf8')).toBe(
        readFileSync(join(dir, 'salida', '404.html'), 'utf8'),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const cli = (...args: string[]) =>
    spawnSync(process.execPath, ['scripts/deploy/moved-site.ts', ...args], {
      cwd: join(import.meta.dirname, '..', '..'),
      encoding: 'utf8',
    });

  it('la línea de comandos escribe el sitio, y con datos malos sale con 2 sin escribir nada', () => {
    const dir = mkdtempSync(join(tmpdir(), 'enarm-moved-cli-'));
    try {
      const good = cli('--to', TARGET, '--base', '/Studiare-ENARM', '--out', join(dir, 'ok'));
      expect(good.status, good.stderr).toBe(0);
      expect(readdirSync(join(dir, 'ok'))).toContain('sw.js');
      for (const args of [
        ['--to', 'http://tudominio.mx', '--out', join(dir, 'malo1')],
        ['--to', TARGET, '--base', '/a/../b', '--out', join(dir, 'malo2')],
        ['--to', TARGET],
        ['--out', join(dir, 'malo3')],
        ['--to', TARGET, '--out', join(dir, 'malo4'), '--otra', 'x'],
        [],
      ]) {
        const bad = cli(...args);
        expect(bad.status, args.join(' ')).toBe(2);
      }
      expect(readdirSync(dir).sort()).toEqual(['ok']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
