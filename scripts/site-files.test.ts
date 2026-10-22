// Pruebas de las funciones puras que arman robots.txt, sitemap.xml, security.txt y las etiquetas de index.html
// (B17, 2.5 y 2.6 del plan de B17). Lo que sale de un build de verdad se revisa en tests/security/site-build.test.ts.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCREENS } from '../src/app/screens.ts';
import { BRAND } from '../src/config/brand.ts';
import {
  HTML_MARKERS,
  ROBOTS_DISALLOW,
  applySiteMetadata,
  escapeHtmlAttribute,
  isIndexableBuild,
  navigationDenylist,
  robotsTxt,
  securityTxt,
  siteFiles,
  siteUrlOf,
  sitemapLocations,
  sitemapXml,
  supportEmailOf,
} from './site-files.ts';

const NOW = new Date('2026-10-22T03:15:00.000Z');
const SITE = 'https://tudominio.mx';

describe('siteUrlOf', () => {
  it('deja el origen sin diagonal final', () => {
    expect(siteUrlOf('https://tudominio.mx')).toBe(SITE);
    expect(siteUrlOf('  https://tudominio.mx/ ')).toBe(SITE);
    expect(siteUrlOf('https://TuDominio.mx///')).toBe(SITE);
    expect(siteUrlOf('https://tudominio.mx:8443')).toBe('https://tudominio.mx:8443');
  });

  it('conserva la ruta de la demo de GitHub Pages', () => {
    expect(siteUrlOf('https://usuario.github.io/Studiare-ENARM')).toBe(
      'https://usuario.github.io/Studiare-ENARM',
    );
    expect(siteUrlOf('https://usuario.github.io/Studiare-ENARM/')).toBe(
      'https://usuario.github.io/Studiare-ENARM',
    );
  });

  it('acepta http solo en la computadora, para probar un build con vite preview', () => {
    expect(siteUrlOf('http://127.0.0.1:4173')).toBe('http://127.0.0.1:4173');
    expect(siteUrlOf('http://localhost:4173/')).toBe('http://localhost:4173');
    expect(siteUrlOf('http://tudominio.mx')).toBeUndefined();
  });

  it.each([
    undefined,
    '',
    '   ',
    'tudominio.mx',
    'ftp://tudominio.mx',
    'javascript:alert(1)',
    'https://usuario:clave@tudominio.mx',
    'https://tudominio.mx/?a=1',
    'https://tudominio.mx/#x',
    'https://tudominio.mx/a b',
    'https://tudominio.mx/%0d%0aSet-Cookie',
    'https://tudominio.mx\nready=true',
    'https://tudo\tminio.mx',
    'https://tudominio.mx\u0000',
  ])('rechaza %j', (value) => {
    expect(siteUrlOf(value)).toBeUndefined();
  });
});

describe('isIndexableBuild', () => {
  it('pide producción declarada y una dirección válida', () => {
    expect(isIndexableBuild('production', SITE)).toBe(true);
    expect(isIndexableBuild(' production ', 'https://tudominio.mx/')).toBe(true);
    expect(isIndexableBuild('production', undefined)).toBe(false);
    expect(isIndexableBuild('production', 'tudominio.mx')).toBe(false);
    expect(isIndexableBuild('demo', SITE)).toBe(false);
    expect(isIndexableBuild('development', SITE)).toBe(false);
    expect(isIndexableBuild(undefined, SITE)).toBe(false);
  });
});

describe('robots.txt', () => {
  it('en el dominio permite todo salvo las pantallas del equipo y la baja, y dice dónde está el sitemap', () => {
    expect(robotsTxt(SITE)).toBe(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /medico',
        'Disallow: /correo/',
        '',
        'Sitemap: https://tudominio.mx/sitemap.xml',
        '',
      ].join('\n'),
    );
  });

  it('en todo lo demás pide que no se indexe nada y no menciona el sitemap', () => {
    expect(robotsTxt(undefined)).toBe('User-agent: *\nDisallow: /\n');
  });

  it('el Disallow cubre cada pantalla del equipo médico y de administración y la baja de correos', () => {
    const covered = (path: string) => ROBOTS_DISALLOW.some((prefix) => path.startsWith(prefix));
    for (const [key, screen] of Object.entries(SCREENS)) {
      if (screen.area === 'admin' || screen.area === 'physician') {
        expect(covered(screen.path), `${key} (${screen.path})`).toBe(true);
      }
    }
    expect(covered(SCREENS.unsubscribe.path)).toBe(true);
  });

  it('no bloquea las tres páginas públicas, aunque el sitemap solo anuncie la portada', () => {
    for (const key of ['home', 'privacyNotice', 'terms'] as const) {
      const path = SCREENS[key].path;
      expect(
        ROBOTS_DISALLOW.some((prefix) => path.startsWith(prefix)),
        path,
      ).toBe(false);
    }
  });
});

describe('navigationDenylist, lo que el service worker no contesta con la aplicación', () => {
  const FILES = [
    'robots.txt',
    'sitemap.xml',
    'security.txt',
    '_headers',
    'og-image.png',
    '.well-known/security.txt',
    '.well-known/apple-developer-merchantid-domain-association',
    'sitemap.xml?x=1',
  ];

  it.each(['/', '/Studiare-ENARM/'])('con la ruta %s cubre los archivos del sitio', (base) => {
    const denied = (path: string) => navigationDenylist(base).some((pattern) => pattern.test(path));
    for (const file of FILES) expect(denied(`${base}${file}`), `${base}${file}`).toBe(true);
    // Las llamadas al proxy de IA siguen fuera, como antes
    expect(denied('/api/ai/forgetting')).toBe(true);
  });

  it.each(['/', '/Studiare-ENARM/'])(
    'con la ruta %s deja las pantallas en la aplicación',
    (base) => {
      const denied = (path: string) =>
        navigationDenylist(base).some((pattern) => pattern.test(path));
      const prefix = base === '/' ? '' : base.slice(0, -1);
      for (const [key, screen] of Object.entries(SCREENS)) {
        const path = screen.path === '/' ? base : `${prefix}${screen.path}`;
        expect(denied(path), `${key} (${path})`).toBe(false);
      }
      // Una ficha de baja con puntos o una consulta no es un archivo
      expect(denied(`${prefix}/correo/baja/abc.def.ghi`)).toBe(false);
      expect(denied(`${prefix}/repasar?robots.txt=1`)).toBe(false);
      // Un archivo con el mismo nombre en otra carpeta de la app tampoco es el del sitio
      expect(denied(`${prefix}/repasar/robots.txt`)).toBe(false);
    },
  );

  it('escapa la ruta de la app y solo vale desde esa ruta', () => {
    const denied = (path: string) =>
      navigationDenylist('/Studiare-ENARM/').some((pattern) => pattern.test(path));
    expect(denied('/Studiare-ENARM/robots.txt')).toBe(true);
    // El punto de la ruta no es un comodín
    expect(denied('/StudiareXENARM/robots.txt')).toBe(false);
    expect(denied('/robots.txt')).toBe(false);
  });
});

describe('sitemap.xml', () => {
  it('trae solo la portada, con la dirección completa', () => {
    expect(sitemapLocations(SITE)).toEqual(['https://tudominio.mx/']);
    const xml = sitemapXml(SITE, NOW);
    expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])).toEqual(
      sitemapLocations(SITE),
    );
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset')).toBe(true);
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml.match(/<lastmod>2026-10-22<\/lastmod>/g)).toHaveLength(1);
    expect(xml.endsWith('</urlset>\n')).toBe(true);
  });

  it('ninguna ruta de pantallas de equipo ni de alumno con sesión entra al sitemap', () => {
    const paths = sitemapLocations(SITE).map((loc) => loc.slice(SITE.length) || '/');
    const publicPaths = new Set([SCREENS.home.path]);
    expect(new Set(paths)).toEqual(publicPaths);
    for (const [key, screen] of Object.entries(SCREENS)) {
      if (!publicPaths.has(screen.path)) {
        expect(paths, key).not.toContain(screen.path);
      }
    }
  });

  it('dice lo mismo que el canonical, porque las pantallas comparten un solo index.html', () => {
    // Un sitemap que anuncia una ruta cuyo canonical es otra le dice a Google que son copias y lo confunde.
    // index.html es uno solo y su canonical es la portada, así que el sitemap solo puede traer la portada
    const html = applySiteMetadata('<head>\n    <!--seo-->\n</head>', { site: SITE, base: '/' });
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
    expect(canonical).toBe(`${SITE}/`);
    expect(sitemapLocations(SITE)).toEqual([canonical]);
    const og = /<meta property="og:url" content="([^"]+)"/.exec(html)?.[1];
    expect(og).toBe(canonical);
    // Y las páginas legales no se anuncian como si fueran páginas aparte
    expect(sitemapLocations(SITE).join(' ')).not.toMatch(/privacidad|terminos/);
  });

  it('escapa los caracteres de XML de la dirección', () => {
    expect(sitemapXml('https://a.mx/x&y', NOW)).toContain('<loc>https://a.mx/x&amp;y/</loc>');
  });
});

describe('security.txt', () => {
  it('lleva el contacto, una caducidad a menos de un año y el idioma', () => {
    const text = securityTxt('soporte@tudominio.mx', NOW);
    expect(text).toBe(
      [
        'Contact: mailto:soporte@tudominio.mx',
        'Expires: 2027-10-21T03:15:00.000Z',
        'Preferred-Languages: es',
        '',
      ].join('\n'),
    );
    const expires = new Date(/Expires: (.+)/.exec(text)?.[1] ?? '');
    expect(expires.getTime() - NOW.getTime()).toBeLessThan(365 * 24 * 60 * 60 * 1000);
    expect(expires.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('con dirección pública suma la liga canónica', () => {
    expect(securityTxt('soporte@tudominio.mx', NOW, SITE)).toContain(
      'Canonical: https://tudominio.mx/.well-known/security.txt\n',
    );
  });

  it.each([
    ['soporte@tudominio.mx', 'soporte@tudominio.mx'],
    ['  soporte@tudominio.mx ', 'soporte@tudominio.mx'],
    ['a.b+c@sub.dominio.com.mx', 'a.b+c@sub.dominio.com.mx'],
    [undefined, undefined],
    ['', undefined],
    ['sin-arroba', undefined],
    ['dos@@arrobas.mx', undefined],
    ['con espacio@dominio.mx', undefined],
    ['linea@dominio.mx\nContact: mailto:otro@malo.mx', undefined],
    ['<script>@dominio.mx', undefined],
    ['soporte@dominio', undefined],
  ])('supportEmailOf(%j)', (value, expected) => {
    expect(supportEmailOf(value)).toBe(expected);
  });
});

describe('siteFiles (lo que escribe el build)', () => {
  const names = (files: { fileName: string }[]) => files.map((file) => file.fileName);

  it('producción con dirección y correo de soporte escribe los tres archivos', () => {
    const files = siteFiles({
      appEnv: 'production',
      siteUrl: SITE,
      supportEmail: 'soporte@tudominio.mx',
      now: NOW,
    });
    expect(names(files)).toEqual(['robots.txt', 'sitemap.xml', '.well-known/security.txt']);
    expect(files[0]?.source).toContain('Allow: /');
    expect(files[0]?.source).toContain('Sitemap: https://tudominio.mx/sitemap.xml');
    expect(files[2]?.source).toContain('Canonical: https://tudominio.mx/.well-known/security.txt');
  });

  it.each([
    ['la demo con dirección', { appEnv: 'demo', siteUrl: 'https://u.github.io/Studiare-ENARM' }],
    ['una vista previa sin dirección', { appEnv: 'demo', siteUrl: undefined }],
    ['desarrollo con dirección', { appEnv: 'development', siteUrl: SITE }],
    ['un build sin entorno', { appEnv: undefined, siteUrl: SITE }],
    ['producción sin dirección', { appEnv: 'production', siteUrl: undefined }],
    ['producción con dirección rota', { appEnv: 'production', siteUrl: 'tudominio.mx' }],
  ])('%s pide que no se indexe nada y no escribe sitemap', (_label, input) => {
    const files = siteFiles({ ...input, supportEmail: undefined, now: NOW });
    expect(names(files)).toEqual(['robots.txt']);
    expect(files[0]?.source).toBe('User-agent: *\nDisallow: /\n');
  });

  it('security.txt solo existe si hay un correo de soporte con forma de correo', () => {
    const base = { appEnv: 'demo', siteUrl: undefined, now: NOW } as const;
    expect(names(siteFiles({ ...base, supportEmail: undefined }))).toEqual(['robots.txt']);
    expect(names(siteFiles({ ...base, supportEmail: 'no es un correo' }))).toEqual(['robots.txt']);
    const files = siteFiles({ ...base, supportEmail: 'soporte@tudominio.mx' });
    expect(names(files)).toEqual(['robots.txt', '.well-known/security.txt']);
    // Sin dirección pública indexable no se promete una liga canónica
    expect(files[1]?.source).not.toContain('Canonical');
  });
});

describe('applySiteMetadata (marcadores de index.html)', () => {
  const html = readFileSync(resolve(import.meta.dirname, '..', 'index.html'), 'utf8');

  it('index.html trae los marcadores y no repite a mano el título ni la descripción', () => {
    expect(html).toContain(HTML_MARKERS.title);
    expect(html).toContain(HTML_MARKERS.description);
    expect(html).toContain(HTML_MARKERS.seo);
    expect(html).not.toContain(BRAND.description);
  });

  it('sin dirección toma título y descripción de la marca, quita la etiqueta seo y deja la imagen relativa', () => {
    const out = applySiteMetadata(html, { site: undefined, base: '/' });
    expect(out).toContain(`<title>${BRAND.name}</title>`);
    expect(out).toContain(`<meta name="description" content="${BRAND.description}" />`);
    expect(out).toContain(`<meta property="og:title" content="${BRAND.name}" />`);
    expect(out).toContain(`<meta property="og:description" content="${BRAND.description}" />`);
    expect(out).not.toMatch(/%BRAND_|<!--seo-->/);
    expect(out).not.toContain('canonical');
    expect(out).not.toContain('og:url');
    expect(out).not.toContain('twitter:title');
    expect(out).toContain('<meta property="og:image" content="%BASE_URL%og-image.png" />');
    // La línea del marcador desaparece entera, sin dejar un renglón con sangría y vacío
    expect(out).not.toMatch(/\n[ \t]*\n/);
  });

  it('con dirección suma canonical, og:url y twitter:title, y la imagen lleva dirección completa', () => {
    const withBase = html.replaceAll('%BASE_URL%', '/');
    const out = applySiteMetadata(withBase, { site: SITE, base: '/' });
    expect(out).toContain('<link rel="canonical" href="https://tudominio.mx/" />');
    expect(out).toContain('<meta property="og:url" content="https://tudominio.mx/" />');
    expect(out).toContain(`<meta name="twitter:title" content="${BRAND.name}" />`);
    expect(out).toContain(
      '<meta property="og:image" content="https://tudominio.mx/og-image.png" />',
    );
    expect(out).toContain(
      '<meta name="twitter:image" content="https://tudominio.mx/og-image.png" />',
    );
    expect(out).not.toMatch(/%BRAND_|<!--seo-->/);
  });

  it('en la demo de GitHub Pages la imagen y el canonical conservan la ruta del sitio', () => {
    const site = 'https://usuario.github.io/Studiare-ENARM';
    const withBase = html.replaceAll('%BASE_URL%', '/Studiare-ENARM/');
    const out = applySiteMetadata(withBase, { site, base: '/Studiare-ENARM/' });
    expect(out).toContain(`content="${site}/og-image.png"`);
    expect(out).toContain(`<link rel="canonical" href="${site}/" />`);
  });

  it('escapa la marca dentro de los atributos', () => {
    expect(escapeHtmlAttribute('a "b" <c> & d')).toBe('a &quot;b&quot; &lt;c&gt; &amp; d');
  });
});
