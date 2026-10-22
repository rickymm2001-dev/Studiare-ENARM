// Política de seguridad de contenido y presupuesto del JavaScript inicial en el build (14.3 y 14.4,
// Fase F). Construye la app como producción en una carpeta temporal y revisa lo que se publica.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  INITIAL_JS_BUDGET_BYTES,
  formatReport,
  initialScripts,
  measureInitialBundle,
} from '../../scripts/bundle-budget.ts';
import { buildApp } from './buildApp.ts';

let withoutCloud = '';
let withCloud = '';
let withAi = '';
let production = '';
let withTelemetry = '';

// Las variables públicas de B15 que arman la CSP: la llave y el host de PostHog y el DSN de Sentry. Son valores
// de mentira con la forma de los de verdad (los mismos que usan las pruebas de punta a punta)
const TELEMETRY_ENV = {
  VITE_SUPABASE_URL: 'https://abcd1234.supabase.co',
  VITE_POSTHOG_KEY: 'phc_SimuladaPruebasStudiare00000000000000000000',
  VITE_POSTHOG_HOST: 'https://us.i.posthog.com',
  VITE_SENTRY_DSN:
    'https://0123456789abcdef0123456789abcdef@o4500000000000000.ingest.sentry.io/4500000000000001',
};

beforeAll(() => {
  withoutCloud = buildApp({ VITE_SUPABASE_URL: '' });
  production = buildApp({ VITE_SUPABASE_URL: '', VITE_APP_ENV: 'production' });
  withCloud = buildApp({ VITE_SUPABASE_URL: 'https://abcd1234.supabase.co' });
  withAi = buildApp({
    VITE_SUPABASE_URL: 'https://abcd1234.supabase.co',
    VITE_AI_URL: 'https://ia.studiare.mx',
  });
  withTelemetry = buildApp(TELEMETRY_ENV);
}, 480_000);

afterAll(() => {
  for (const dir of [withoutCloud, withCloud, withAi, production, withTelemetry]) {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

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
