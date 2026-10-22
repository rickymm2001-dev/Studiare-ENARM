import { describe, expect, it } from 'vitest';
import {
  APPLE_DOMAIN_FILE_PATH,
  HEADERS_FILE_LIMITS,
  IMMUTABLE_CACHE_CONTROL,
  STRIPE_CONNECT_ORIGINS,
  STRIPE_FRAME_ORIGINS,
  STRIPE_SCRIPT_ORIGINS,
  aiOriginOf,
  buildHeaderCsp,
  buildHeadersFile,
  buildMetaCsp,
  buildPermissionsPolicy,
  headersFileProblems,
  headersFileStats,
  posthogOriginOf,
  sentryOriginOf,
  stripePublishableKeyOf,
  supabaseOriginOf,
  walletPaymentsOf,
  type CspOptions,
} from './csp';

const directive = (policy: string, name: string) =>
  policy
    .split('; ')
    .find((part) => part.startsWith(`${name} `))
    ?.slice(name.length + 1);

describe('supabaseOriginOf', () => {
  it('acepta el formato oficial y quita la diagonal final', () => {
    expect(supabaseOriginOf('https://abcd1234.supabase.co')).toBe('https://abcd1234.supabase.co');
    expect(supabaseOriginOf(' https://abcd1234.supabase.co/ ')).toBe(
      'https://abcd1234.supabase.co',
    );
  });

  it('rechaza cualquier otro dominio, protocolo o ruta', () => {
    for (const url of [
      undefined,
      '',
      'http://abcd1234.supabase.co',
      'https://abcd1234.supabase.co.malo.com',
      'https://malo.com/abcd.supabase.co',
      'https://abcd1234.supabase.co/rest/v1',
      'https://*.supabase.co',
      'wss://abcd1234.supabase.co',
    ]) {
      expect(supabaseOriginOf(url)).toBeUndefined();
    }
  });
});

describe('aiOriginOf', () => {
  it('acepta un origen https y quita la diagonal final', () => {
    expect(aiOriginOf('https://ia.studiare.mx')).toBe('https://ia.studiare.mx');
    expect(aiOriginOf(' https://ia.studiare.mx:8443/ ')).toBe('https://ia.studiare.mx:8443');
  });

  it('acepta la dirección con ruta, como la de la función de Supabase, y se queda con el origen', () => {
    expect(aiOriginOf('https://abcd1234.supabase.co/functions/v1/ai-proxy')).toBe(
      'https://abcd1234.supabase.co',
    );
    expect(aiOriginOf(' https://ia.studiare.mx:8443/ia/ ')).toBe('https://ia.studiare.mx:8443');
  });

  it('rechaza http, comodines, espacios, consultas y texto que no es una dirección', () => {
    for (const url of [
      undefined,
      '',
      'http://ia.studiare.mx',
      'https://*.studiare.mx',
      'https://ia.studiare.mx/ia?x=1',
      'https://ia.studiare.mx/ia#a',
      'https://ia.studiare.mx/a b',
      'https://ia studiare.mx',
      'https://ia.studiare.mx; script-src *',
      'javascript:alert(1)',
    ]) {
      expect(aiOriginOf(url)).toBeUndefined();
    }
  });
});

describe('posthogOriginOf (B15, 5.1)', () => {
  it('acepta solo los dos orígenes de captura de PostHog Cloud, con o sin diagonal final', () => {
    expect(posthogOriginOf('https://us.i.posthog.com')).toBe('https://us.i.posthog.com');
    expect(posthogOriginOf(' https://eu.i.posthog.com/ ')).toBe('https://eu.i.posthog.com');
  });

  it('rechaza cualquier otro dominio, protocolo, ruta o comodín', () => {
    for (const url of [
      undefined,
      '',
      'http://us.i.posthog.com',
      'https://app.posthog.com',
      'https://us.posthog.com',
      'https://us.i.posthog.com.malo.com',
      'https://us.i.posthog.com/batch/',
      'https://*.posthog.com',
      'https://malo.com/us.i.posthog.com',
      'https://us.i.posthog.com; script-src *',
    ]) {
      expect(posthogOriginOf(url)).toBeUndefined();
    }
  });
});

describe('sentryOriginOf (B15, 5.1)', () => {
  const KEY = '0123456789abcdef0123456789abcdef';

  it('saca el origen de un DSN con la forma de Sentry, con o sin región en medio', () => {
    expect(
      sentryOriginOf(`https://${KEY}@o4500000000000000.ingest.sentry.io/4500000000000001`),
    ).toBe('https://o4500000000000000.ingest.sentry.io');
    expect(sentryOriginOf(`https://${KEY}@o123.ingest.us.sentry.io/456`)).toBe(
      'https://o123.ingest.us.sentry.io',
    );
    expect(sentryOriginOf(` https://${KEY}@o123.ingest.de.sentry.io/456 `)).toBe(
      'https://o123.ingest.de.sentry.io',
    );
  });

  it('rechaza un DSN con otro dominio, sin proyecto, sin llave, con http o con rutas raras', () => {
    for (const dsn of [
      undefined,
      '',
      `http://${KEY}@o123.ingest.sentry.io/456`,
      `https://${KEY}@o123.ingest.sentry.io`,
      `https://${KEY}@o123.ingest.sentry.io/456/extra`,
      `https://${KEY}@o123.ingest.sentry.io/abc`,
      `https://${KEY}@malo.com/456`,
      `https://${KEY}@o123.ingest.sentry.io.malo.com/456`,
      `https://${KEY}@sentry.malo.com/456`,
      `https://${KEY}@o123.ingest.xx.sentry.io/456`,
      'https://o123.ingest.sentry.io/456',
      `https://corta@o123.ingest.sentry.io/456`,
      `https://${KEY}@o123.ingest.sentry.io/456; script-src *`,
      `https://*@o123.ingest.sentry.io/456`,
    ]) {
      expect(sentryOriginOf(dsn)).toBeUndefined();
    }
  });
});

describe('política de seguridad de contenido', () => {
  it('no permite scripts en línea ni eval, solo scripts propios y WebAssembly', () => {
    for (const policy of [buildMetaCsp(), buildHeaderCsp()]) {
      expect(directive(policy, 'script-src')).toBe("'self' 'wasm-unsafe-eval'");
      expect(policy).not.toContain("'unsafe-eval'");
      expect(directive(policy, 'object-src')).toBe("'none'");
      expect(directive(policy, 'base-uri')).toBe("'self'");
      expect(directive(policy, 'default-src')).toBe("'self'");
    }
  });

  it('sin Supabase solo se conecta al propio sitio, y con él suma su origen y nada más', () => {
    expect(directive(buildMetaCsp(), 'connect-src')).toBe("'self'");
    expect(
      directive(buildMetaCsp({ supabaseOrigin: 'https://abcd1234.supabase.co' }), 'connect-src'),
    ).toBe("'self' https://abcd1234.supabase.co");
  });

  it('con el proxy de IA alojado suma su origen exacto, junto a Supabase', () => {
    const policy = buildMetaCsp({
      supabaseOrigin: 'https://abcd1234.supabase.co',
      aiOrigin: 'https://ia.studiare.mx',
    });
    expect(directive(policy, 'connect-src')).toBe(
      "'self' https://abcd1234.supabase.co https://ia.studiare.mx",
    );
    expect(directive(buildMetaCsp({ aiOrigin: 'https://ia.studiare.mx' }), 'connect-src')).toBe(
      "'self' https://ia.studiare.mx",
    );
  });

  it('PostHog y Sentry se suman solo a connect-src y script-src no cambia (B15, 5.1)', () => {
    const options = {
      supabaseOrigin: 'https://abcd1234.supabase.co',
      posthogOrigin: 'https://us.i.posthog.com',
      sentryOrigin: 'https://o123.ingest.sentry.io',
    };
    for (const policy of [buildMetaCsp(options), buildHeaderCsp(options)]) {
      expect(directive(policy, 'connect-src')).toBe(
        "'self' https://abcd1234.supabase.co https://us.i.posthog.com https://o123.ingest.sentry.io",
      );
      expect(directive(policy, 'script-src')).toBe("'self' 'wasm-unsafe-eval'");
      expect(directive(policy, 'default-src')).toBe("'self'");
      // Ni el origen de PostHog ni el de Sentry aparecen en otra directiva
      for (const name of ['img-src', 'frame-src', 'form-action', 'worker-src']) {
        expect(directive(policy, name)).not.toMatch(/posthog|sentry/);
      }
    }
    expect(buildMetaCsp({ posthogOrigin: 'https://eu.i.posthog.com' })).toContain(
      "connect-src 'self' https://eu.i.posthog.com;",
    );
  });

  it('sin las variables de PostHog y de Sentry la política queda como estaba (B15)', () => {
    expect(buildMetaCsp({ posthogOrigin: undefined, sentryOrigin: undefined })).toBe(
      buildMetaCsp(),
    );
  });

  it('frame-ancestors va solo en los encabezados, porque en una etiqueta meta se ignora', () => {
    expect(buildMetaCsp()).not.toContain('frame-ancestors');
    expect(directive(buildHeaderCsp(), 'frame-ancestors')).toBe("'none'");
  });

  it('el archivo _headers lleva la política completa y los demás encabezados', () => {
    const file = buildHeadersFile({ supabaseOrigin: 'https://abcd1234.supabase.co' });
    expect(file.startsWith('/*\n')).toBe(true);
    expect(file).toContain(
      `Content-Security-Policy: ${buildHeaderCsp({ supabaseOrigin: 'https://abcd1234.supabase.co' })}`,
    );
    expect(file).toContain('X-Content-Type-Options: nosniff');
    expect(file).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(file).toContain('X-Frame-Options: DENY');
  });
});

// Una llave publicable de mentira, con la forma de las de Stripe y sin ser de ninguna cuenta
const FAKE_PUBLISHABLE_KEY = 'pk_test_' + 'SimuladaPruebasStudiare0000000000';

describe('stripePublishableKeyOf y walletPaymentsOf (B17, 2.2)', () => {
  it('aceptan pk_test_ y pk_live_ con letras y números, y quitan espacios', () => {
    expect(stripePublishableKeyOf(FAKE_PUBLISHABLE_KEY)).toBe(FAKE_PUBLISHABLE_KEY);
    expect(stripePublishableKeyOf(` pk_live_${'A1b2'.repeat(6)} `)).toBe(
      `pk_live_${'A1b2'.repeat(6)}`,
    );
    expect(walletPaymentsOf(FAKE_PUBLISHABLE_KEY)).toBe(true);
  });

  it('rechazan llaves secretas, textos cortos, símbolos y cualquier cosa que no sea una llave publicable', () => {
    for (const value of [
      undefined,
      '',
      'pk_test_',
      'pk_test_corta',
      `sk_test_${'A'.repeat(30)}`,
      `rk_live_${'A'.repeat(30)}`,
      `whsec_${'A'.repeat(30)}`,
      `pk_dev_${'A'.repeat(30)}`,
      `PK_TEST_${'A'.repeat(30)}`,
      `pk_test_${'A'.repeat(20)}-${'B'.repeat(5)}`,
      `pk_test_${'A'.repeat(20)} script-src *`,
      `pk_test_${'A'.repeat(300)}`,
      `https://js.stripe.com`,
    ]) {
      expect(stripePublishableKeyOf(value), String(value)).toBeUndefined();
      expect(walletPaymentsOf(value), String(value)).toBe(false);
    }
  });
});

describe('billeteras de Stripe en la política (B17, 2.2)', () => {
  const base: CspOptions = {
    supabaseOrigin: 'https://abcd1234.supabase.co',
    posthogOrigin: 'https://us.i.posthog.com',
    sentryOrigin: 'https://o123.ingest.sentry.io',
  };
  const names = [
    'default-src',
    'script-src',
    'style-src',
    'img-src',
    'font-src',
    'media-src',
    'connect-src',
    'worker-src',
    'manifest-src',
    'frame-src',
    'object-src',
    'base-uri',
    'form-action',
  ];

  it('sin la opción, o apagada, la política queda exactamente como estaba y no nombra a Stripe', () => {
    const baseline =
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
    expect(buildMetaCsp()).toBe(baseline);
    expect(buildMetaCsp({ walletPayments: false })).toBe(baseline);
    expect(buildMetaCsp({ walletPayments: undefined })).toBe(baseline);
    expect(buildHeaderCsp({ walletPayments: false })).toBe(`${baseline}; frame-ancestors 'none'`);
    expect(buildMetaCsp({ ...base, walletPayments: false })).toBe(buildMetaCsp(base));
    expect(buildHeadersFile({ ...base, walletPayments: false })).not.toMatch(/stripe/i);
  });

  it('prendida suma Stripe a script-src, frame-src y connect-src, y a ninguna otra directiva', () => {
    for (const policy of [
      buildMetaCsp({ ...base, walletPayments: true }),
      buildHeaderCsp({ ...base, walletPayments: true }),
    ]) {
      expect(directive(policy, 'script-src')).toBe(
        "'self' 'wasm-unsafe-eval' https://js.stripe.com https://*.js.stripe.com",
      );
      expect(directive(policy, 'frame-src')).toBe(
        'https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com',
      );
      expect(directive(policy, 'connect-src')).toBe(
        "'self' https://abcd1234.supabase.co https://us.i.posthog.com https://o123.ingest.sentry.io https://api.stripe.com",
      );
      // Lo demás, igual que sin la opción: img-src, font-src y style-src no se tocan de entrada
      const without = buildMetaCsp(base);
      for (const name of names.filter(
        (n) => !['script-src', 'frame-src', 'connect-src'].includes(n),
      )) {
        expect(directive(policy, name), name).toBe(directive(without, name));
      }
    }
  });

  it('nunca abre scripts en línea ni eval, ni un comodín general, ni http', () => {
    const policy = buildHeaderCsp({ ...base, walletPayments: true });
    expect(directive(policy, 'script-src')).not.toMatch(
      /'unsafe-inline'|'unsafe-eval'|'strict-dynamic'/,
    );
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toMatch(/http:/);
    expect(directive(policy, 'default-src')).toBe("'self'");
    expect(directive(policy, 'object-src')).toBe("'none'");
    // El único comodín que se admite es el de los subdominios de js.stripe.com
    expect(policy.match(/\*[^ ;]*/g)?.filter((m) => m !== '*.js.stripe.com')).toEqual([]);
  });

  it('las listas exportadas son las que arma la política y solo nombran a Stripe', () => {
    for (const origin of [
      ...STRIPE_SCRIPT_ORIGINS,
      ...STRIPE_FRAME_ORIGINS,
      ...STRIPE_CONNECT_ORIGINS,
    ]) {
      expect(origin).toMatch(/^https:\/\/(?:\*\.)?(?:js|api|hooks)\.(?:js\.)?stripe\.com$/);
    }
    expect(STRIPE_CONNECT_ORIGINS).toEqual(['https://api.stripe.com']);
  });

  it('la etiqueta meta y el encabezado siguen siendo la misma política, salvo frame-ancestors', () => {
    const options = { ...base, walletPayments: true };
    expect(buildHeaderCsp(options)).toBe(`${buildMetaCsp(options)}; frame-ancestors 'none'`);
  });

  it('el Permissions-Policy abre payment solo con la opción y deja lo demás apagado', () => {
    const off = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()';
    expect(buildPermissionsPolicy()).toBe(off);
    expect(buildPermissionsPolicy({ walletPayments: false })).toBe(off);
    expect(buildPermissionsPolicy({ ...base })).toBe(off);
    expect(buildPermissionsPolicy({ walletPayments: true })).toBe(
      'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com" "https://*.js.stripe.com"), usb=()',
    );
    expect(buildHeadersFile({ walletPayments: true })).toContain(
      'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com" "https://*.js.stripe.com"), usb=()\n',
    );
    expect(buildHeadersFile()).toContain(`Permissions-Policy: ${off}\n`);
  });
});

describe('archivo _headers: caché, noindex y archivo de Apple (B17, 2.1)', () => {
  /** Las reglas del archivo: la dirección y sus encabezados, en el orden en que salen */
  const rulesOf = (file: string) =>
    file
      .trimEnd()
      .split('\n\n')
      .map((block) => {
        const [url = '', ...headers] = block.split('\n');
        return { url, headers: headers.map((line) => line.trim()) };
      });

  it('trae primero la regla de seguridad de todo el sitio, y luego caché, noindex y nada más', () => {
    const rules = rulesOf(buildHeadersFile({ supabaseOrigin: 'https://abcd1234.supabase.co' }));
    expect(rules.map((rule) => rule.url)).toEqual([
      '/*',
      '/assets/*',
      'https://:project.pages.dev/*',
      'https://:version.:project.pages.dev/*',
    ]);
    expect(rules[0]?.headers.map((line) => line.split(':')[0])).toEqual([
      'Content-Security-Policy',
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'X-Frame-Options',
    ]);
  });

  it('los archivos con huella de assets/ son inmutables un año y nada más lleva esa caché', () => {
    const file = buildHeadersFile();
    const rules = rulesOf(file);
    expect(IMMUTABLE_CACHE_CONTROL).toBe('public, max-age=31536000, immutable');
    expect(rules.find((rule) => rule.url === '/assets/*')?.headers).toEqual([
      'Cache-Control: public, max-age=31536000, immutable',
    ]);
    // index.html, sw.js y el manifest conservan la revalidación de Pages: ninguna otra regla fija Cache-Control
    expect(file.match(/Cache-Control/g)).toHaveLength(1);
    expect(rules.find((rule) => rule.url === '/*')?.headers.join('\n')).not.toMatch(
      /Cache-Control/,
    );
  });

  it('las direcciones de pages.dev, la del proyecto y las de cada versión, llevan noindex', () => {
    const rules = rulesOf(buildHeadersFile());
    for (const url of ['https://:project.pages.dev/*', 'https://:version.:project.pages.dev/*']) {
      expect(rules.find((rule) => rule.url === url)?.headers).toEqual(['X-Robots-Tag: noindex']);
    }
    // El dominio propio no lleva noindex: la regla de todo el sitio no lo trae
    expect(rules.find((rule) => rule.url === '/*')?.headers.join('\n')).not.toMatch(/Robots/);
  });

  it('la regla del archivo de Apple solo sale si el build lo trae, y es texto plano', () => {
    expect(buildHeadersFile()).not.toContain('apple-developer-merchantid');
    expect(buildHeadersFile({}, { appleDomainFile: false })).not.toContain('apple-developer');
    const rules = rulesOf(buildHeadersFile({}, { appleDomainFile: true }));
    expect(APPLE_DOMAIN_FILE_PATH).toBe(
      '/.well-known/apple-developer-merchantid-domain-association',
    );
    expect(rules.find((rule) => rule.url === APPLE_DOMAIN_FILE_PATH)?.headers).toEqual([
      'Content-Type: text/plain; charset=utf-8',
    ]);
    expect(rules.map((rule) => rule.url)).toEqual([
      '/*',
      '/assets/*',
      APPLE_DOMAIN_FILE_PATH,
      'https://:project.pages.dev/*',
      'https://:version.:project.pages.dev/*',
    ]);
  });

  it('termina en un solo salto de línea, con una línea en blanco entre reglas y sin sangrías raras', () => {
    const file = buildHeadersFile({}, { appleDomainFile: true });
    expect(file.endsWith('noindex\n')).toBe(true);
    expect(file).not.toMatch(/\n\n\n/);
    for (const line of file.split('\n').filter((l) => l !== '')) {
      expect(line.startsWith('  ') || /^(\/|https:\/\/)/.test(line), line).toBe(true);
    }
  });

  it('HSTS sigue sin includeSubDomains ni preload en cualquier combinación', () => {
    for (const walletPayments of [false, true]) {
      for (const appleDomainFile of [false, true]) {
        const file = buildHeadersFile({ walletPayments }, { appleDomainFile });
        expect(file).toContain('Strict-Transport-Security: max-age=31536000\n');
        expect(file).not.toMatch(/preload|includeSubDomains/i);
      }
    }
  });
});

describe('límites de Cloudflare para _headers (B17, 2.1 y H4)', () => {
  // Todo prendido y con los orígenes más largos que acepta cada función, que es el peor caso de la política
  const worst: CspOptions = {
    supabaseOrigin: `https://${'a'.repeat(40)}.supabase.co`,
    aiOrigin: `https://${'ia'.repeat(60)}.studiare.mx:8443`,
    posthogOrigin: 'https://eu.i.posthog.com',
    sentryOrigin: 'https://o4500000000000000.ingest.de.sentry.io',
    walletPayments: true,
  };

  it('el archivo completo, con todo prendido, queda lejos de los topes', () => {
    const file = buildHeadersFile(worst, { appleDomainFile: true });
    const stats = headersFileStats(file);
    expect(headersFileProblems(file)).toEqual([]);
    expect(stats.rules).toBeLessThanOrEqual(HEADERS_FILE_LIMITS.maxRules);
    expect(stats.longestLine).toBeLessThanOrEqual(HEADERS_FILE_LIMITS.maxLineLength);
    // El diseño promete cerca de mil caracteres en la política más cargada, y hay margen de sobra
    expect(stats.longestLine).toBeLessThan(1_200);
    expect(stats.rules).toBe(5);
  });

  it('los topes dejan margen contra los de Cloudflare (100 reglas y 2,000 caracteres por línea)', () => {
    expect(HEADERS_FILE_LIMITS).toEqual({ maxRules: 90, maxLineLength: 1800 });
  });

  it('falla cerca del tope, por reglas o por una línea larga', () => {
    const manyRules = Array.from(
      { length: HEADERS_FILE_LIMITS.maxRules + 1 },
      (_, index) => `/ruta-${String(index)}/*\n  X-Prueba: 1`,
    ).join('\n\n');
    expect(headersFileProblems(`${manyRules}\n`)).toEqual(['91 reglas, el tope es 90']);
    const exactly = manyRules.split('\n\n').slice(0, HEADERS_FILE_LIMITS.maxRules).join('\n\n');
    expect(headersFileProblems(`${exactly}\n`)).toEqual([]);

    const long = `/*\n  Content-Security-Policy: ${'a'.repeat(1_800)}\n`;
    expect(headersFileProblems(long)).toHaveLength(1);
    expect(headersFileProblems(long)[0]).toMatch(/una línea de 1827 caracteres/);
    const edge = `/*\n  X-Prueba: ${'a'.repeat(HEADERS_FILE_LIMITS.maxLineLength - '  X-Prueba: '.length)}\n`;
    expect(headersFileProblems(edge)).toEqual([]);
  });

  it('cuenta una regla por dirección, aunque lleve varios encabezados', () => {
    expect(headersFileStats('/*\n  A: 1\n  B: 2\n\n/x\n  C: 3\n')).toEqual({
      rules: 2,
      longestLine: 6,
    });
    expect(headersFileStats('')).toEqual({ rules: 0, longestLine: 0 });
  });
});
