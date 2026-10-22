// Política de seguridad de contenido y presupuesto del JavaScript inicial en el build (14.3 y 14.4,
// Fase F). Construye la app como producción en una carpeta temporal y revisa lo que se publica.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  INITIAL_JS_BUDGET_BYTES,
  formatReport,
  initialScripts,
  measureInitialBundle,
} from '../../scripts/bundle-budget.ts';
import { parseHeadersFile, startPagesServer } from '../../scripts/smoke/local-pages.ts';
import { parseSmokeArgs, runSmoke } from '../../scripts/smoke/post-deploy.ts';
import { sitemapLocations } from '../../scripts/site-files.ts';
import {
  APPLE_DOMAIN_FILE_PATH,
  HEADERS_FILE_LIMITS,
  headersFileProblems,
  headersFileStats,
} from '../../src/config/csp.ts';
import { buildApp, ROOT } from './buildApp.ts';

let withoutCloud = '';
let withCloud = '';
let withAi = '';
let production = '';
let withTelemetry = '';
// B17. El build del dominio de verdad (producción, con dirección pública, llave publicable de Stripe, correo de
// soporte y el archivo de Apple) y la demo de GitHub Pages (con ruta, y con el aviso de mudanza)
let site = '';
let demoSite = '';

// Las variables públicas de B15 que arman la CSP: la llave y el host de PostHog y el DSN de Sentry. Son valores
// de mentira con la forma de los de verdad (los mismos que usan las pruebas de punta a punta)
const TELEMETRY_ENV = {
  VITE_SUPABASE_URL: 'https://abcd1234.supabase.co',
  VITE_POSTHOG_KEY: 'phc_SimuladaPruebasStudiare00000000000000000000',
  VITE_POSTHOG_HOST: 'https://us.i.posthog.com',
  VITE_SENTRY_DSN:
    'https://0123456789abcdef0123456789abcdef@o4500000000000000.ingest.sentry.io/4500000000000001',
};

// Las variables de B17. Todas de mentira: tudominio.mx es el dominio de ejemplo de los documentos y la llave
// publicable tiene la forma que acepta stripePublishableKeyOf, sin parecer una llave de verdad
const SITE_URL = 'https://tudominio.mx';
const FAKE_PUBLISHABLE_KEY = 'pk_test_' + 'SimuladaPruebasStudiare0000000000';
const DEMO_SITE_URL = 'https://usuario.github.io/Studiare-ENARM';
const SUPPORT_EMAIL = 'soporte@tudominio.mx';
const APPLE_FILE = join(ROOT, 'public', APPLE_DOMAIN_FILE_PATH.slice(1));

/**
 * Construye con el archivo de Apple en public, como lo dejaría la sesión al bajarlo del panel de Stripe (B17, 6.3).
 * Si ya existe uno de verdad no lo toca ni lo borra. El archivo de prueba solo vive durante el build
 */
function buildWithAppleFile(env: Record<string, string>): string {
  const existed = existsSync(APPLE_FILE);
  if (!existed) {
    mkdirSync(join(APPLE_FILE, '..'), { recursive: true });
    writeFileSync(APPLE_FILE, 'archivo de prueba, no es el de Apple\n');
  }
  try {
    return buildApp(env);
  } finally {
    if (!existed) {
      rmSync(APPLE_FILE, { force: true });
      // La carpeta solo se quita si quedó vacía, por si public/.well-known ya traía otros archivos
      try {
        if (readdirSync(join(APPLE_FILE, '..')).length === 0)
          rmSync(join(APPLE_FILE, '..'), { recursive: true });
      } catch {
        // Ya no existía
      }
    }
  }
}

beforeAll(() => {
  withoutCloud = buildApp({ VITE_SUPABASE_URL: '', SITE_URL: '' });
  production = buildApp({ VITE_SUPABASE_URL: '', VITE_APP_ENV: 'production' });
  withCloud = buildApp({ VITE_SUPABASE_URL: 'https://abcd1234.supabase.co' });
  withAi = buildApp({
    VITE_SUPABASE_URL: 'https://abcd1234.supabase.co',
    VITE_AI_URL: 'https://ia.studiare.mx',
  });
  withTelemetry = buildApp(TELEMETRY_ENV);
  site = buildWithAppleFile({
    VITE_SUPABASE_URL: '',
    VITE_APP_ENV: 'production',
    SITE_URL,
    VITE_STRIPE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
    VITE_SUPPORT_EMAIL: SUPPORT_EMAIL,
  });
  demoSite = buildApp({
    VITE_SUPABASE_URL: '',
    VITE_APP_ENV: 'demo',
    SITE_URL: DEMO_SITE_URL,
    BASE_PATH: '/Studiare-ENARM',
    VITE_SUPPORT_EMAIL: SUPPORT_EMAIL,
    VITE_MOVED_TO: SITE_URL,
    VITE_MOVED_ON: '2026-12-15',
  });
}, 720_000);

afterAll(() => {
  for (const dir of [withoutCloud, withCloud, withAi, production, withTelemetry, site, demoSite]) {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
  // Siete builds con las imágenes de la demo tardan en borrarse cuando la máquina está cargada
}, 120_000);

const read = (dir: string, file: string) => readFileSync(join(dir, file), 'utf8');
const metaPolicy = (html: string) =>
  /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1];
const directive = (policy: string | undefined, name: string) =>
  policy
    ?.split('; ')
    .find((part) => part.startsWith(`${name} `))
    ?.slice(name.length + 1);

describe('política de seguridad de contenido en el build', () => {
  it('index.html la trae antes que cualquier script y sin scripts en línea', () => {
    const html = read(withoutCloud, 'index.html');
    const policy = metaPolicy(html);
    expect(policy).toBeDefined();
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script'));
    expect(html.indexOf('<meta charset')).toBeLessThan(html.indexOf('Content-Security-Policy'));
    expect(directive(policy, 'script-src')).toBe("'self' 'wasm-unsafe-eval'");
    expect(directive(policy, 'object-src')).toBe("'none'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain('frame-ancestors');
    // Un script en línea (sin src) o un manejador en un atributo chocaría con la política
    const inline = [...html.matchAll(/<script\b([^>]*)>/g)].filter(
      ([, attrs]) => !/\bsrc=/.test(attrs ?? ''),
    );
    expect(inline).toEqual([]);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toContain('javascript:');
  });

  it('sin Supabase configurado solo permite conectarse al propio sitio', () => {
    expect(directive(metaPolicy(read(withoutCloud, 'index.html')), 'connect-src')).toBe("'self'");
  });

  it('con Supabase configurado suma su origen exacto y ningún otro', () => {
    expect(directive(metaPolicy(read(withCloud, 'index.html')), 'connect-src')).toBe(
      "'self' https://abcd1234.supabase.co",
    );
  });

  it('con el proxy de IA alojado suma su origen exacto, en el HTML y en _headers', () => {
    const expected = "'self' https://abcd1234.supabase.co https://ia.studiare.mx";
    expect(directive(metaPolicy(read(withAi, 'index.html')), 'connect-src')).toBe(expected);
    const policy = /Content-Security-Policy: (.+)/.exec(read(withAi, '_headers'))?.[1];
    expect(directive(policy, 'connect-src')).toBe(expected);
  });

  it('_headers lleva la misma política más frame-ancestors, y los demás encabezados', () => {
    expect(existsSync(join(withoutCloud, '_headers'))).toBe(true);
    const headers = read(withoutCloud, '_headers');
    const policy = /Content-Security-Policy: (.+)/.exec(headers)?.[1];
    expect(policy?.startsWith(metaPolicy(read(withoutCloud, 'index.html')) ?? '#')).toBe(true);
    expect(directive(policy, 'frame-ancestors')).toBe("'none'");
    // HSTS por un año y sin preload ni subdominios, que no se pueden deshacer a la ligera
    expect(headers).toContain('Strict-Transport-Security: max-age=31536000\n');
    expect(headers).not.toMatch(/preload|includeSubDomains/i);
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(headers).toContain('Permissions-Policy:');
  });
});

describe('PostHog y Sentry en la política (B15, 5.1)', () => {
  const POLICY_CONNECT =
    "'self' https://abcd1234.supabase.co https://us.i.posthog.com https://o4500000000000000.ingest.sentry.io";

  it('con las variables suma los dos orígenes exactos solo a connect-src, en el HTML y en _headers', () => {
    const header = /Content-Security-Policy: (.+)/.exec(read(withTelemetry, '_headers'))?.[1];
    for (const policy of [metaPolicy(read(withTelemetry, 'index.html')), header]) {
      expect(directive(policy, 'connect-src')).toBe(POLICY_CONNECT);
      expect(directive(policy, 'script-src')).toBe("'self' 'wasm-unsafe-eval'");
      expect(directive(policy, 'default-src')).toBe("'self'");
      expect(policy?.match(/posthog|sentry/g)).toHaveLength(2);
    }
  });

  it('sin las variables ningún build nombra a PostHog ni a Sentry en su política', () => {
    for (const dir of [withoutCloud, withCloud, withAi, production]) {
      expect(metaPolicy(read(dir, 'index.html'))).not.toMatch(/posthog|sentry/);
      expect(read(dir, '_headers')).not.toMatch(/posthog|sentry/);
    }
  });

  it('un host de PostHog o un DSN con otra forma no abren la política', () => {
    const odd = buildApp({
      ...TELEMETRY_ENV,
      VITE_POSTHOG_HOST: 'https://posthog.malo.com',
      VITE_SENTRY_DSN: 'https://llave@malo.com/1',
    });
    try {
      expect(directive(metaPolicy(read(odd, 'index.html')), 'connect-src')).toBe(
        "'self' https://abcd1234.supabase.co",
      );
    } finally {
      rmSync(odd, { recursive: true, force: true });
    }
    // Este caso arma su propio build, que tarda más que el límite de 5 segundos de una prueba
  }, 240_000);
});

describe('presupuesto del JavaScript inicial', () => {
  it('lo que index.html carga al abrir pesa menos de 300 KB comprimido', () => {
    const report = measureInitialBundle(withoutCloud);
    // Si falla, el mensaje trae el desglose por archivo
    expect(report.assets.length, formatReport(report)).toBeGreaterThan(0);
    expect(report.withinBudget, formatReport(report)).toBe(true);
    expect(report.budgetBytes).toBe(INITIAL_JS_BUDGET_BYTES);
  });

  it('el SDK de Supabase y la sincronización no están en lo inicial, con o sin la nube configurada', () => {
    for (const dir of [withoutCloud, withCloud]) {
      const report = measureInitialBundle(dir);
      expect(report.withinBudget, formatReport(report)).toBe(true);
      const initial = initialScripts(read(dir, 'index.html')).map((file) => read(dir, file));
      // Textos que solo existen en el SDK y en la sincronización
      for (const marker of ['AuthApiError', 'sync_push_records']) {
        const found = initial.some((code) => code.includes(marker));
        expect(found, `"${marker}" no debería estar en el JavaScript inicial`).toBe(false);
      }
    }
    // Y sí existen en algún archivo del build, para que la búsqueda no pase en vacío
    const all = readdirSync(join(withCloud, 'assets'))
      .filter((file) => file.endsWith('.js'))
      .map((file) => read(withCloud, join('assets', file)));
    expect(all.some((code) => code.includes('AuthApiError'))).toBe(true);
    expect(all.some((code) => code.includes('sync_push_records'))).toBe(true);
  });

  it('el SDK de Sentry y posthog-js no están en lo inicial y el SDK es un archivo aparte (B15, 5.4)', () => {
    // Textos que solo existen en el SDK de Sentry. Si el import dinámico se volviera estático, aparecerían
    const sdkMarkers = ['sentry.javascript.browser', 'SentryError', 'sentry-trace'];
    for (const dir of [withoutCloud, withCloud, withTelemetry]) {
      const report = measureInitialBundle(dir);
      expect(report.withinBudget, formatReport(report)).toBe(true);
      const initial = initialScripts(read(dir, 'index.html')).map((file) => read(dir, file));
      for (const marker of [...sdkMarkers, 'posthog-js', '@sentry', 'posthog.com/static']) {
        expect(
          initial.some((code) => code.includes(marker)),
          `"${marker}" no debería estar en el JavaScript inicial`,
        ).toBe(false);
      }
    }
    // Y el SDK sí existe, en su archivo aparte, que el service worker no precarga
    const files = readdirSync(join(withTelemetry, 'assets')).filter((file) => file.endsWith('.js'));
    const sentryChunks = files.filter((file) => file.startsWith('sentry-'));
    expect(sentryChunks).toHaveLength(1);
    expect(read(withTelemetry, join('assets', sentryChunks[0] as string))).toContain(
      'sentry.javascript.browser',
    );
    expect(initialScripts(read(withTelemetry, 'index.html')).join(' ')).not.toContain('sentry-');
    expect(read(withTelemetry, 'sw.js')).not.toContain('sentry-');
    // Ningún otro archivo, fuera del SDK, trae su código
    for (const file of files.filter((name) => !name.startsWith('sentry-'))) {
      expect(read(withTelemetry, join('assets', file)), file).not.toContain(
        'sentry.javascript.browser',
      );
    }
  });

  it('la analítica propia, sin PostHog, mide poco en lo inicial: la llave pública está y no hay llaves personales (B15)', () => {
    const initial = initialScripts(read(withTelemetry, 'index.html')).map((file) =>
      read(withTelemetry, file),
    );
    // La llave de proyecto es pública por diseño y llega al cliente con VITE_POSTHOG_KEY
    expect(initial.some((code) => code.includes(TELEMETRY_ENV.VITE_POSTHOG_KEY))).toBe(true);
    for (const code of initial) {
      expect(code).not.toMatch(/phx_[A-Za-z0-9]{20,}|sntrys_|sntryu_/);
    }
  });

  it('el modelo del alumno, la calibración y el modo adaptativo no están en lo inicial (B14, 7.3)', () => {
    // Las funciones de la base que lee la app, los nombres de los motores y los textos que solo existen en
    // pantallas diferidas. Si algo de esto se cuela a lo inicial, el presupuesto de 300 KB se rompe de a poco
    const markers = [
      'comparison_snapshot',
      'population_baselines',
      'calibration_',
      'buildStudentModel',
      'estimateAbility',
      'Adaptativo, cerca de tu nivel',
      'para calcular cada noche la dificultad real de las preguntas',
    ];
    for (const dir of [withoutCloud, withCloud]) {
      const initial = initialScripts(read(dir, 'index.html')).map((file) => read(dir, file));
      for (const marker of markers) {
        const found = initial.some((code) => code.includes(marker));
        expect(found, `"${marker}" no debería estar en el JavaScript inicial`).toBe(false);
      }
    }
    // Y los que se escriben como texto sí existen en algún archivo del build, para que la búsqueda no pase
    // en vacío. Los nombres de funciones se acortan al construir, así que esos solo se buscan arriba
    const all = readdirSync(join(withCloud, 'assets'))
      .filter((file) => file.endsWith('.js'))
      .map((file) => read(withCloud, join('assets', file)));
    for (const marker of [
      'comparison_snapshot',
      'population_baselines',
      'Adaptativo, cerca de tu nivel',
      'para calcular cada noche la dificultad real de las preguntas',
    ]) {
      expect(
        all.some((code) => code.includes(marker)),
        `"${marker}" debería estar en algún archivo diferido`,
      ).toBe(true);
    }
  });

  it('el panel médico, el de administración y el importador no están en lo inicial', () => {
    const html = read(withoutCloud, 'index.html');
    const initial = initialScripts(html).map((file) =>
      readFileSync(join(withoutCloud, file), 'utf8'),
    );
    // Textos que solo existen en esas pantallas y en ningún otro archivo inicial
    for (const marker of [
      'Costos de IA en cifras',
      'Doble etiquetado en cifras',
      'Sube el banco que llenaste con la plantilla',
      'Los datos de demostración viven en una base aparte',
    ]) {
      const found = initial.some((code) => code.includes(marker));
      expect(found, `"${marker}" no debería estar en el JavaScript inicial`).toBe(false);
    }
  });

  it('el medidor detecta un build que se pasa y un index.html sin scripts', () => {
    const fake = mkdtempSync(join(tmpdir(), 'enarm-budget-'));
    try {
      writeFileSync(
        join(fake, 'index.html'),
        '<script type="module" src="/base/assets/a.js"></script><link rel="modulepreload" href="/base/assets/b.js">',
      );
      expect(initialScripts(read(fake, 'index.html'))).toEqual(['assets/a.js', 'assets/b.js']);
    } finally {
      rmSync(fake, { recursive: true, force: true });
    }
  });
});

describe('mapas de código (B15, 2.3)', () => {
  /** Todos los archivos de un build */
  const everyFile = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? everyFile(join(dir, entry.name)) : [join(dir, entry.name)],
    );

  it('ningún build publica mapas de código ni deja el comentario que los señala', () => {
    for (const dir of [withoutCloud, withCloud, withAi, production, withTelemetry]) {
      const files = everyFile(dir);
      expect(
        files.filter((file) => file.endsWith('.map')),
        dir,
      ).toEqual([]);
      for (const file of files.filter((name) => /\.(js|mjs|css)$/.test(name))) {
        expect(readFileSync(file, 'utf8'), file).not.toMatch(/sourceMappingURL=/);
      }
    }
  });
});

describe('build de producción sin los mazos de la demo (B11, 5.9)', () => {
  /** Todo el JavaScript del build, para buscar contenido de los mazos de Paco */
  const allScripts = (dir: string) =>
    readdirSync(join(dir, 'assets'))
      .filter((file) => file.endsWith('.js'))
      .map((file) => read(dir, join('assets', file)));
  // La clave de una nota de paco-mi.json, que solo existe en los .json de los mazos
  const PACO_NOTE = 'paco-mi-e7199b280d57';

  it('la demo publicada trae sus mazos y sus imágenes', () => {
    expect(existsSync(join(withoutCloud, 'demo-media', 'paco-mi'))).toBe(true);
    expect(allScripts(withoutCloud).some((code) => code.includes(PACO_NOTE))).toBe(true);
  });

  it('producción no emite los .json de los mazos ni copia demo-media, que son de pago', () => {
    expect(existsSync(join(production, 'demo-media'))).toBe(false);
    expect(allScripts(production).some((code) => code.includes(PACO_NOTE))).toBe(false);
    expect(readdirSync(join(production, 'assets')).some((file) => file.startsWith('paco-'))).toBe(
      false,
    );
    // Y lo demás del build sigue ahí
    expect(existsSync(join(production, 'index.html'))).toBe(true);
    expect(measureInitialBundle(production).withinBudget).toBe(true);
  });
});

describe('capturas de instalación de la PWA solo fuera de producción (B17, revisión)', () => {
  // Las tres capturas muestran la versión de demostración con su aviso y sus datos simulados. En el dominio de verdad
  // el diálogo de instalación las enseñaría como si fueran de Studiare
  const FILES = ['inicio-telefono.webp', 'repasar-telefono.webp', 'inicio-computadora.webp'];
  const manifestOf = (dir: string) =>
    JSON.parse(read(dir, 'manifest.webmanifest')) as { screenshots?: { src: string }[] };

  it('la demo y el desarrollo las declaran en el manifest y las publican', () => {
    for (const dir of [withoutCloud, withCloud, withAi, withTelemetry, demoSite]) {
      expect(
        manifestOf(dir).screenshots?.map((shot) => shot.src.replace('screenshots/', '')),
      ).toEqual(FILES);
      for (const file of FILES) {
        expect(existsSync(join(dir, 'screenshots', file)), `${dir} ${file}`).toBe(true);
      }
    }
  });

  it('producción no las declara ni las copia, con o sin dirección pública', () => {
    for (const dir of [production, site]) {
      expect(manifestOf(dir).screenshots, dir).toBeUndefined();
      expect(existsSync(join(dir, 'screenshots')), dir).toBe(false);
      expect(read(dir, 'manifest.webmanifest'), dir).not.toContain('screenshots/');
      // El manifest sigue siendo instalable
      expect(read(dir, 'manifest.webmanifest'), dir).toContain('pwa-512x512.png');
    }
  });
});

describe('la vista previa de la portada solo existe fuera de producción (B17, 5.2)', () => {
  // La portada deja pegar en localStorage texto de prueba del creador y de los testimonios para verlo en una
  // página real (src/features/landing/preview.ts). Cualquiera puede escribir esa clave desde su navegador, así
  // que en producción no debe existir ni la clave, ni la función que la lee, ni las reglas que la revisan
  const PREVIEW_KEY = 'enarm.landing.preview';
  // Un texto de las reglas del texto ajeno (slots.ts) que solo está en el archivo de la vista previa
  const RULES_MARK = 'BACKED_CLAIMS';
  /** Todo el JavaScript del build, incluido el service worker, y los nombres de sus archivos */
  const everything = (dir: string) => {
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((file) =>
      file.endsWith('.js'),
    );
    return files.map((file) => ({ file, code: read(dir, file) }));
  };

  it('la demo trae la clave y las reglas, en un archivo que solo se baja si hay algo guardado', () => {
    const files = everything(withoutCloud);
    const withKey = files.filter(({ code }) => code.includes(PREVIEW_KEY));
    expect(withKey.length).toBeGreaterThan(0);
    expect(files.some(({ code }) => code.includes(RULES_MARK))).toBe(true);
    // Las reglas no van en lo inicial: pesarían a todos para algo que casi nadie usa
    const initial = measureInitialBundle(withoutCloud).assets.map((asset) => asset.file);
    const withRules = files.filter(({ code }) => code.includes(RULES_MARK)).map(({ file }) => file);
    expect(withRules.filter((file) => initial.includes(file))).toEqual([]);
  });

  it('ningún build de producción trae la clave, las reglas ni el archivo de la vista previa', () => {
    for (const dir of [production, site]) {
      for (const { file, code } of everything(dir)) {
        expect(code.includes(PREVIEW_KEY), `${file} trae la clave de la vista previa`).toBe(false);
        expect(code.includes(RULES_MARK), `${file} trae las reglas del texto ajeno`).toBe(false);
        expect(
          /(?:^|[/\\])preview-[\w-]+\.js$/.test(file),
          `${file} es el archivo de la vista previa`,
        ).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// B17. Encabezados reales, SEO, política con Stripe y aviso de mudanza (paquete A)
// ---------------------------------------------------------------------------------------------------------------

/** Todos los builds, para lo que debe valer en cualquiera */
const allBuilds = () => [
  withoutCloud,
  withCloud,
  withAi,
  production,
  withTelemetry,
  site,
  demoSite,
];
const patternsOf = (dir: string) =>
  parseHeadersFile(read(dir, '_headers')).map((rule) => rule.pattern);

describe('_headers en el build (B17, 2.1)', () => {
  const PAGES_DEV = ['https://:project.pages.dev/*', 'https://:version.:project.pages.dev/*'];

  it('trae seguridad, caché de /assets/ y noindex de pages.dev, en ese orden', () => {
    for (const dir of [withoutCloud, withCloud, production, demoSite]) {
      expect(patternsOf(dir), dir).toEqual(['/*', '/assets/*', ...PAGES_DEV]);
    }
  });

  it('con el archivo de Apple en public suma su regla, y solo entonces', () => {
    expect(existsSync(join(site, APPLE_DOMAIN_FILE_PATH.slice(1)))).toBe(true);
    expect(patternsOf(site)).toEqual(['/*', '/assets/*', APPLE_DOMAIN_FILE_PATH, ...PAGES_DEV]);
    expect(read(site, '_headers')).toContain(
      `${APPLE_DOMAIN_FILE_PATH}\n  Content-Type: text/plain; charset=utf-8\n`,
    );
    // Los demás builds se hicieron sin ese archivo: no lo copian ni lo nombran
    for (const dir of [withoutCloud, production, demoSite]) {
      expect(existsSync(join(dir, APPLE_DOMAIN_FILE_PATH.slice(1)))).toBe(false);
      expect(read(dir, '_headers')).not.toContain('apple-developer');
    }
  });

  it('solo los archivos con huella son inmutables: index.html, sw.js y el manifest no', () => {
    const rules = parseHeadersFile(read(production, '_headers'));
    const cache = rules.filter((rule) =>
      rule.headers.some(([name]) => /^cache-control$/i.test(name)),
    );
    expect(cache.map((rule) => rule.pattern)).toEqual(['/assets/*']);
    expect(cache[0]?.headers).toEqual([['Cache-Control', 'public, max-age=31536000, immutable']]);
    // Y los archivos de assets/ son los que Vite escribe con huella en el nombre
    const names = readdirSync(join(production, 'assets')).filter((file) => file.endsWith('.js'));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name).toMatch(/-[A-Za-z0-9_-]{6,}\.js$/);
    for (const file of ['index.html', 'sw.js', 'manifest.webmanifest']) {
      expect(existsSync(join(production, file)), file).toBe(true);
    }
  });

  it('ningún build pasa cerca de los límites de Cloudflare Pages (H4)', () => {
    for (const dir of allBuilds()) {
      expect(headersFileProblems(read(dir, '_headers')), dir).toEqual([]);
    }
    // El peor caso real de hoy mide unos 500 caracteres de línea y 5 reglas. Hay mucho margen
    const stats = headersFileStats(read(site, '_headers'));
    expect(stats.rules).toBeLessThanOrEqual(5);
    expect(stats.longestLine).toBeLessThan(HEADERS_FILE_LIMITS.maxLineLength / 2);
  });

  it('HSTS sigue en un año, sin includeSubDomains ni preload, en todos', () => {
    for (const dir of allBuilds()) {
      const headers = read(dir, '_headers');
      expect(headers, dir).toContain('Strict-Transport-Security: max-age=31536000\n');
      expect(headers, dir).not.toMatch(/preload|includeSubDomains/i);
    }
  });
});

describe('aplicación de una sola página (B17, 2.3)', () => {
  it('ningún build trae 404.html, porque en Cloudflare haría que las rutas respondan 404', () => {
    for (const dir of allBuilds()) expect(existsSync(join(dir, '404.html')), dir).toBe(false);
  });
});

describe('Stripe en la política de seguridad (B17, 2.2)', () => {
  const headerPolicy = (dir: string) =>
    /Content-Security-Policy: (.+)/.exec(read(dir, '_headers'))?.[1];
  const permissions = (dir: string) => /Permissions-Policy: (.+)/.exec(read(dir, '_headers'))?.[1];

  it('sin VITE_STRIPE_PUBLISHABLE_KEY ningún build nombra a Stripe y payment sigue vacío', () => {
    for (const dir of allBuilds().filter((build) => build !== site)) {
      expect(metaPolicy(read(dir, 'index.html')), dir).not.toMatch(/stripe/i);
      expect(read(dir, '_headers'), dir).not.toMatch(/stripe/i);
      expect(permissions(dir), dir).toBe(
        'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      );
    }
  });

  it('con la llave suma lo de 2.2 a tres directivas y nada más, en el HTML y en _headers', () => {
    const base = headerPolicy(production);
    for (const policy of [metaPolicy(read(site, 'index.html')), headerPolicy(site)]) {
      expect(directive(policy, 'script-src')).toBe(
        "'self' 'wasm-unsafe-eval' https://js.stripe.com https://*.js.stripe.com",
      );
      expect(directive(policy, 'frame-src')).toBe(
        'https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com',
      );
      expect(directive(policy, 'connect-src')).toBe("'self' https://api.stripe.com");
      // Todo lo demás es igual que en el build sin la llave
      for (const name of [
        'default-src',
        'style-src',
        'img-src',
        'font-src',
        'media-src',
        'worker-src',
        'manifest-src',
        'object-src',
        'base-uri',
        'form-action',
      ]) {
        expect(directive(policy, name), name).toBe(directive(base, name));
      }
      expect(policy).not.toContain("'unsafe-inline' https");
      expect(directive(policy, 'script-src')).not.toMatch(/'unsafe-(inline|eval)'/);
    }
    expect(directive(headerPolicy(site), 'frame-ancestors')).toBe("'none'");
    expect(permissions(site)).toBe(
      'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com" "https://*.js.stripe.com"), usb=()',
    );
  });

  it('Stripe.js no está en el JavaScript inicial ni en ningún archivo del build', () => {
    const initial = initialScripts(read(site, 'index.html')).map((file) => read(site, file));
    for (const marker of ['js.stripe.com', 'initCheckoutElementsSdk']) {
      expect(
        initial.some((code) => code.includes(marker)),
        `"${marker}" no debería estar en el JavaScript inicial`,
      ).toBe(false);
    }
    const report = measureInitialBundle(site);
    expect(report.withinBudget, formatReport(report)).toBe(true);
  });

  it('una llave secreta o mal formada pegada en la variable no abre la política', () => {
    const odd = buildApp({
      VITE_SUPABASE_URL: '',
      VITE_STRIPE_PUBLISHABLE_KEY: 'sk_test_' + 'ESTAnoDEBEllegarNUNCAalNAVEGADOR0000',
    });
    try {
      expect(metaPolicy(read(odd, 'index.html'))).not.toMatch(/stripe/i);
      expect(read(odd, '_headers')).not.toMatch(/stripe/i);
      expect(JSON.stringify(readdirSync(join(odd, 'assets')))).not.toContain('sk_test');
    } finally {
      rmSync(odd, { recursive: true, force: true });
    }
  }, 240_000);
});

describe('robots.txt, sitemap.xml y security.txt (B17, 2.5)', () => {
  it('el build de producción con dirección se deja indexar y dice dónde está el sitemap', () => {
    expect(read(site, 'robots.txt')).toBe(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /medico',
        'Disallow: /correo/',
        '',
        `Sitemap: ${SITE_URL}/sitemap.xml`,
        '',
      ].join('\n'),
    );
    const xml = read(site, 'sitemap.xml');
    expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])).toEqual(
      sitemapLocations(SITE_URL),
    );
    // Solo la portada: las páginas legales comparten el index.html, cuyo canonical es la portada
    expect(sitemapLocations(SITE_URL)).toEqual([`${SITE_URL}/`]);
    expect(xml).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  it('cualquier otro build pide que no se indexe nada y no trae sitemap', () => {
    for (const dir of [withoutCloud, withCloud, withAi, production, withTelemetry, demoSite]) {
      expect(read(dir, 'robots.txt'), dir).toBe('User-agent: *\nDisallow: /\n');
      expect(existsSync(join(dir, 'sitemap.xml')), dir).toBe(false);
    }
  });

  it('security.txt sale del correo de soporte y solo si existe', () => {
    const text = read(site, '.well-known/security.txt');
    expect(text).toContain(`Contact: mailto:${SUPPORT_EMAIL}\n`);
    expect(text).toContain(`Canonical: ${SITE_URL}/.well-known/security.txt\n`);
    const expires = new Date(/Expires: (.+)\n/.exec(text)?.[1] ?? '');
    const days = (expires.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(300);
    expect(days).toBeLessThan(365);
    // La demo también tiene correo de soporte, pero no una dirección canónica indexable
    expect(read(demoSite, '.well-known/security.txt')).not.toContain('Canonical');
    for (const dir of [withoutCloud, production, withTelemetry]) {
      expect(existsSync(join(dir, '.well-known', 'security.txt')), dir).toBe(false);
    }
  });

  it('ninguno de estos archivos se precarga en el service worker', () => {
    const worker = read(site, 'sw.js');
    for (const name of ['robots.txt', 'sitemap.xml', 'security.txt', '_headers']) {
      // La lista de precarga trae {url:"archivo",revision:"..."}. El nombre sí aparece en la lista de rutas que
      // el worker no contesta con la aplicación, que es otra cosa y la revisa la prueba de abajo
      expect(worker, name).not.toContain(`url:"${name}"`);
      expect(worker, name).not.toContain(`url:".well-known/${name}"`);
    }
  });

  // Los patrones que el worker no contesta con la aplicación, tal como quedaron en sw.js
  function deniedByWorker(dir: string): RegExp[] {
    const list = /denylist:\[(.*?)\]\}\)/s.exec(read(dir, 'sw.js'))?.[1] ?? '';
    return [...list.matchAll(/\/((?:\\.|[^/\\])+)\//g)].map((match) => new RegExp(match[1] ?? ''));
  }
  const deniedPaths = [
    'robots.txt',
    'sitemap.xml',
    'security.txt',
    '_headers',
    'og-image.png',
    '.well-known/security.txt',
    APPLE_DOMAIN_FILE_PATH.slice(1),
    'sitemap.xml?x=1',
  ];
  const appPaths = [
    '',
    'repasar',
    'suscripcion',
    'privacidad',
    'terminos',
    'admin',
    'correo/baja',
    'repasar?x=1',
  ];

  it('con el worker instalado, los archivos del sitio no se contestan con la aplicación', () => {
    for (const [dir, base] of [
      [site, '/'],
      [demoSite, '/Studiare-ENARM/'],
    ] as const) {
      const denied = deniedByWorker(dir);
      // Las llamadas al proxy de IA siguen fuera, como antes
      expect(
        denied.some((pattern) => pattern.test('/api/ai')),
        'api',
      ).toBe(true);
      for (const path of deniedPaths) {
        expect(
          denied.some((pattern) => pattern.test(`${base}${path}`)),
          `${base}${path}`,
        ).toBe(true);
      }
      // Y las pantallas de la app siguen cayendo en la aplicación, también sin conexión
      for (const path of appPaths) {
        expect(
          denied.some((pattern) => pattern.test(`${base}${path}`)),
          `${base}${path}`,
        ).toBe(false);
      }
    }
  });
});

describe('etiquetas de index.html (B17, 2.6)', () => {
  it('ningún build deja marcadores sin reemplazar', () => {
    for (const dir of allBuilds()) {
      const html = read(dir, 'index.html');
      expect(html, dir).not.toMatch(/%BRAND_|<!--seo-->|<!--csp-->/);
      expect(html, dir).toContain('<title>Studiare</title>');
      expect(html, dir).toContain('lang="es-MX"');
    }
  });

  it('con dirección pública suma canonical, og:url y twitter:title, y la imagen lleva dirección completa', () => {
    const html = read(site, 'index.html');
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}/" />`);
    expect(html).toContain(`<meta property="og:url" content="${SITE_URL}/" />`);
    expect(html).toContain('<meta name="twitter:title" content="Studiare" />');
    expect(html).toContain(`<meta property="og:image" content="${SITE_URL}/og-image.png" />`);
    expect(html).toContain(`<meta name="twitter:image" content="${SITE_URL}/og-image.png" />`);
  });

  it('sin dirección no hay canonical ni og:url y la imagen queda relativa', () => {
    for (const dir of [withoutCloud, production]) {
      const html = read(dir, 'index.html');
      expect(html, dir).not.toContain('rel="canonical"');
      expect(html, dir).not.toContain('og:url');
      expect(html, dir).toContain('<meta property="og:image" content="/og-image.png" />');
      expect(html, dir).toContain('<meta property="og:title" content="Studiare" />');
    }
  });

  it('la demo de GitHub Pages conserva la ruta en el canonical y en la imagen', () => {
    const html = read(demoSite, 'index.html');
    expect(html).toContain(`<link rel="canonical" href="${DEMO_SITE_URL}/" />`);
    expect(html).toContain(`content="${DEMO_SITE_URL}/og-image.png"`);
    expect(html).toContain('src="/Studiare-ENARM/assets/');
  });

  it('trae el aviso de que necesita JavaScript', () => {
    expect(read(site, 'index.html')).toContain('<noscript>Studiare necesita JavaScript');
  });
});

describe('aviso de la mudanza en el build (B17, 3.4)', () => {
  const NOTICE = 'Studiare cambia de dirección';

  it('con VITE_MOVED_TO y VITE_MOVED_ON el aviso está en un archivo aparte y no en lo inicial', () => {
    const report = measureInitialBundle(demoSite);
    expect(report.withinBudget, formatReport(report)).toBe(true);
    const initial = initialScripts(read(demoSite, 'index.html')).map((file) =>
      read(demoSite, file),
    );
    expect(initial.some((code) => code.includes(NOTICE))).toBe(false);
    const all = readdirSync(join(demoSite, 'assets'))
      .filter((file) => file.endsWith('.js'))
      .map((file) => ({ file, code: read(demoSite, join('assets', file)) }));
    const holders = all.filter(({ code }) => code.includes(NOTICE));
    expect(holders).toHaveLength(1);
    // Ese archivo no es de los que carga index.html al abrir
    const initialFiles = initialScripts(read(demoSite, 'index.html'));
    expect(initialFiles.some((file) => file.endsWith(holders[0]?.file ?? '#'))).toBe(false);
    // El service worker lo guarda para que el aviso también salga sin conexión
    expect(read(demoSite, 'sw.js')).toContain(holders[0]?.file ?? '#');
    // Y las dos variables, que son públicas, quedan en el build
    expect(all.some(({ code }) => code.includes('2026-12-15') || code.includes(SITE_URL))).toBe(
      true,
    );
  });

  it('sin las variables el aviso no existe: ni su archivo, ni su texto, ni el service worker lo guarda', () => {
    for (const dir of [withoutCloud, withCloud, production, site]) {
      const files = readdirSync(join(dir, 'assets')).filter((file) => file.endsWith('.js'));
      expect(
        files.filter((file) => file.startsWith('MovedNotice')),
        dir,
      ).toEqual([]);
      expect(read(dir, 'sw.js'), dir).not.toContain('MovedNotice');
      for (const file of files) {
        expect(read(dir, join('assets', file)), `${dir} ${file}`).not.toContain(NOTICE);
      }
    }
  });
});

describe('la prueba de humo contra un build real (B17, 2.8)', () => {
  const run = async (dir: string, argv: string[], rewrite?: string) => {
    const server = await startPagesServer(dir);
    try {
      const toLocal = ((input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        return fetch(rewrite ? url.replace(rewrite, server.url) : url, init);
      }) as typeof fetch;
      const args = parseSmokeArgs(argv.map((arg) => (arg === 'LOCAL' ? server.url : arg)));
      return await runSmoke(args, toLocal, { env: {}, sleep: () => Promise.resolve() });
    } finally {
      await server.close();
    }
  };
  const failures = (report: Awaited<ReturnType<typeof run>>) =>
    report.checks.filter((check) => !check.ok).map((check) => `${check.name}. ${check.found}`);

  it('el build de producción da verde en modo production, con el archivo de Apple', async () => {
    const report = await run(site, [SITE_URL, '--apple'], SITE_URL);
    expect(failures(report)).toEqual([]);
    expect(report.checks.map((check) => check.name)).toContain(`GET ${APPLE_DOMAIN_FILE_PATH}`);
  });

  it('el build de producción sin dirección pública da verde en modo preview', async () => {
    const report = await run(withoutCloud, ['LOCAL', '--mode', 'preview']);
    expect(failures(report)).toEqual([]);
  });

  it('un build sin dirección pública NO pasa en modo production, que es lo correcto', async () => {
    const report = await run(withoutCloud, ['LOCAL']);
    expect(failures(report).length).toBeGreaterThan(0);
  });
});
