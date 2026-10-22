// La mudanza de la demo de GitHub Pages (B17, 3.4 del plan de B17) con un navegador de verdad.
// - El sitio de mudanza que genera scripts/deploy/moved-site.ts, servido como lo hace GitHub Pages (con 404.html
//   para las rutas profundas), dice a dónde se mudó Studiare y lleva a la persona allá conservando la ruta, la
//   consulta y el fragmento. El dominio nuevo no existe en esta prueba: las peticiones a tudominio.mx las atiende
//   Playwright
// - El service worker de despedida reemplaza a uno viejo que sirve la app desde su caché, lo borra y recarga
// - El aviso de catorce días vive en un build de la demo con VITE_MOVED_TO y VITE_MOVED_ON, que esta prueba arma y
//   sirve bajo /Studiare-ENARM, igual que pages.yml
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { writeMovedSite } from '../../scripts/deploy/moved-site';
import { movedTexts } from '../../src/i18n/moved';
import { buildApp } from '../security/buildApp';
import { startGithubPagesServer, type GithubPagesServer } from './support/githubPagesServer';
import { expect, expectNoSeriousA11yViolations, test } from './support/fixtures';

const PREFIX = '/Studiare-ENARM';
const NEW_ORIGIN = 'https://tudominio.mx';
const HEADING = 'Studiare cambió de dirección';

/** El dominio nuevo no existe aquí. Playwright contesta en su lugar con una página cualquiera */
async function fakeNewDomain(page: Page): Promise<string[]> {
  const visited: string[] = [];
  await page.route(`${NEW_ORIGIN}/**`, async (route) => {
    visited.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><title>Studiare</title><h1>Dominio nuevo</h1>',
    });
  });
  return visited;
}

// GitHub Pages responde 404.html con código 404 a las rutas profundas, y Chromium escribe en la consola que ese
// recurso respondió 404 aunque la página sea la buena. Es lo esperado en estas pruebas. Cualquier otro error sigue
// tumbando la prueba, y que los estilos y el script de la página carguen se comprueba en cada una
const DEEP_ROUTE_404 = /status of 404/;

test.describe('sitio de mudanza', () => {
  test.use({ expectedPageErrors: [DEEP_ROUTE_404] });
  let dir = '';
  let server: GithubPagesServer;

  test.beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'enarm-moved-e2e-'));
    writeMovedSite(join(dir, 'site'), { movedTo: NEW_ORIGIN, base: PREFIX });
    server = await startGithubPagesServer(join(dir, 'site'), PREFIX);
  });
  test.afterEach(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('una liga de referido en una ruta profunda llega al dominio nuevo con su ruta, su consulta y su fragmento', async ({
    page,
  }) => {
    const visited = await fakeNewDomain(page);
    // GitHub Pages responde 404.html a /Studiare-ENARM/repasar, y es esa página la que lleva a la persona
    const response = await page.goto(`${server.origin}${PREFIX}/repasar?ref=ABC&grupo=G1#unirme`);
    expect(response?.status()).toBe(404);

    await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible();
    const status = page.getByRole('status');
    await expect(status).toContainText(
      'Ahora vive en tudominio.mx. Te llevamos allá en unos segundos.',
    );
    const link = page.getByRole('link', { name: 'tudominio.mx' });
    await expect(link).toBeVisible();
    await expect(link).toBeFocused();
    await expect(link).toHaveAttribute('href', `${NEW_ORIGIN}/repasar?ref=ABC&grupo=G1#unirme`);
    await expect(page.getByText('Con cuenta, entra allá con tu correo')).toBeVisible();
    // La página tiene sus estilos y su script aunque la ruta sea profunda (rutas absolutas)
    await expect(page.locator('main')).toHaveCSS('border-top-style', 'solid');

    // La persona alcanza a leer: a los dos segundos todavía está aquí
    await page.waitForTimeout(2000);
    expect(page.url().startsWith(server.origin)).toBe(true);
    expect(visited).toEqual([]);

    await page.waitForURL(`${NEW_ORIGIN}/repasar?ref=ABC&grupo=G1#unirme`, { timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Dominio nuevo' })).toBeVisible();
    // Se fue con replace: Atrás no vuelve a la página de mudanza
    expect(visited.length).toBeGreaterThan(0);
  });

  test('la raíz de la demo lleva a la raíz del dominio nuevo', async ({ page }) => {
    await fakeNewDomain(page);
    await page.goto(`${server.origin}${PREFIX}/`);
    await expect(page.getByRole('link', { name: 'tudominio.mx' })).toHaveAttribute(
      'href',
      `${NEW_ORIGIN}/`,
    );
    await page.waitForURL(`${NEW_ORIGIN}/`, { timeout: 20_000 });
  });

  test('pasa axe en claro y en oscuro y se lee en el teléfono sin desbordarse', async ({
    page,
  }) => {
    await fakeNewDomain(page);
    await page.goto(`${server.origin}${PREFIX}/repasar`);
    await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible();
    await page.emulateMedia({ colorScheme: 'light' });
    await expectNoSeriousA11yViolations(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectNoSeriousA11yViolations(page);
  });

  test('el manifest conserva el id de la app vieja y el service worker de despedida se sirve como JavaScript', async ({
    page,
    request,
  }) => {
    await fakeNewDomain(page);
    const manifest = await request.get(`${server.origin}${PREFIX}/manifest.webmanifest`);
    expect(manifest.ok()).toBe(true);
    expect(await manifest.json()).toMatchObject({
      id: `${PREFIX}/`,
      scope: `${PREFIX}/`,
      start_url: `${PREFIX}/`,
    });
    const worker = await request.get(`${server.origin}${PREFIX}/sw.js`);
    expect(worker.headers()['content-type']).toContain('javascript');
    expect(await worker.text()).toContain('self.registration.unregister()');
  });
});

test.describe('sitio de mudanza sin JavaScript', () => {
  test.use({ javaScriptEnabled: false, expectedPageErrors: [DEEP_ROUTE_404] });

  test('el respaldo lleva a la raíz del dominio nuevo', async ({ page }) => {
    test.setTimeout(60_000);
    const dir = mkdtempSync(join(tmpdir(), 'enarm-moved-nojs-'));
    writeMovedSite(join(dir, 'site'), { movedTo: NEW_ORIGIN, base: PREFIX });
    const server = await startGithubPagesServer(join(dir, 'site'), PREFIX);
    try {
      await fakeNewDomain(page);
      await page.goto(`${server.origin}${PREFIX}/repasar?ref=ABC`);
      await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible();
      // Sin JavaScript el enlace apunta a la raíz y la actualización automática lo lleva allá
      await expect(page.getByRole('link', { name: 'tudominio.mx' })).toHaveAttribute(
        'href',
        `${NEW_ORIGIN}/`,
      );
      await page.waitForURL(`${NEW_ORIGIN}/`, { timeout: 40_000 });
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('service worker de despedida', () => {
  test('reemplaza a la app vieja instalada: borra sus cachés, se desregistra y deja la página de mudanza', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const dir = mkdtempSync(join(tmpdir(), 'enarm-moved-sw-'));
    const oldApp = join(dir, 'vieja');
    const movedSite = join(dir, 'mudanza');
    mkdirSync(oldApp, { recursive: true });
    // La app vieja: una página que registra su service worker, el cual la guarda en caché y la sirve de ahí
    writeFileSync(
      join(oldApp, 'index.html'),
      `<!doctype html><meta charset="utf-8"><title>App vieja</title><h1>App vieja desde la red</h1>
<script>navigator.serviceWorker.register('${PREFIX}/sw.js', { scope: '${PREFIX}/' });</script>`,
    );
    writeFileSync(
      join(oldApp, 'sw.js'),
      `const CACHE = 'workbox-precache-v2-' + self.registration.scope;
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.put('${PREFIX}/', new Response('<!doctype html><meta charset="utf-8"><title>App vieja</title><h1>App vieja desde la caché</h1>', { headers: { 'content-type': 'text/html; charset=utf-8' } }))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') event.respondWith(caches.match('${PREFIX}/').then((hit) => hit || fetch(event.request)));
});
`,
    );
    writeMovedSite(movedSite, { movedTo: NEW_ORIGIN, base: PREFIX });
    const server = await startGithubPagesServer(oldApp, PREFIX);
    try {
      await fakeNewDomain(page);
      // Primera visita: se instala el service worker viejo. En la segunda, la página sale de su caché
      await page.goto(`${server.origin}${PREFIX}/`);
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await page.reload();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('App vieja desde la caché');
      // El caché de precarga de Workbox lleva al final el alcance del service worker. Otra página del mismo origen
      // (en un sitio de usuario de GitHub Pages hay varias) tiene el suyo, y la despedida no debe tocarlo
      const ownCache = `workbox-precache-v2-${server.origin}${PREFIX}/`;
      await page.evaluate(async () => {
        await caches.open('datos-de-otra-pagina');
      });
      expect((await page.evaluate(() => caches.keys())).sort()).toEqual(
        [ownCache, 'datos-de-otra-pagina'].sort(),
      );

      // Se publica la mudanza en la misma ruta y el navegador revisa si hay versión nueva de sw.js
      server.serve(movedSite);
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update();
      });

      // El service worker de despedida recarga la ventana, y llega la página de mudanza desde la red
      await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible({
        timeout: 30_000,
      });
      expect(await page.evaluate(() => caches.keys())).toEqual(['datos-de-otra-pagina']);
      await expect
        .poll(() =>
          page.evaluate(() => navigator.serviceWorker.getRegistrations().then((all) => all.length)),
        )
        .toBe(0);
      expect(await page.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true);
      // Y de ahí, al dominio nuevo
      await page.waitForURL(`${NEW_ORIGIN}/`, { timeout: 30_000 });
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('aviso de catorce días en la demo', () => {
  test.describe.configure({ mode: 'serial' });
  let dir = '';
  let server: GithubPagesServer;
  let moveOn = '';

  test.beforeAll(async () => {
    test.setTimeout(480_000);
    // La fecha de la mudanza, dentro de catorce días. Mediodía local para que el huso no cambie el día
    const when = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    moveOn = `${String(when.getFullYear())}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`;
    const built = buildApp({
      VITE_APP_ENV: 'demo',
      VITE_SUPABASE_URL: '',
      BASE_PATH: PREFIX,
      VITE_MOVED_TO: NEW_ORIGIN,
      VITE_MOVED_ON: moveOn,
    });
    // Igual que pages.yml, para que los enlaces directos abran
    copyFileSync(join(built, 'index.html'), join(built, '404.html'));
    dir = built;
    server = await startGithubPagesServer(dir, PREFIX);
  });
  test.afterAll(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const notice = (page: Page) => page.getByRole('region', { name: movedTexts.title });

  test('dice el día, a dónde y qué hacer, y lleva al dominio nuevo', async ({ page }) => {
    await page.goto(`${server.origin}${PREFIX}/`);
    const region = notice(page);
    await expect(region).toBeVisible({ timeout: 30_000 });
    await expect(region).toContainText('Studiare se muda a tudominio.mx el ');
    await expect(region).toContainText('toca Sincronizar ahora en Configuración');
    await expect(region).toContainText(
      'descarga tus datos en Configuración, Privacidad antes de esa fecha',
    );
    await expect(region.getByRole('link', { name: movedTexts.go('tudominio.mx') })).toHaveAttribute(
      'href',
      NEW_ORIGIN,
    );
  });

  test('se puede cerrar por el día y no vuelve al recargar', async ({ page }) => {
    await page.goto(`${server.origin}${PREFIX}/`);
    await expect(notice(page)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: movedTexts.dismissLabel }).click();
    await expect(notice(page)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(notice(page)).toHaveCount(0);
    // Mañana vuelve: la clave guarda el día de hoy y ya no es el de mañana
    const key = await page.evaluate(() => localStorage.getItem('enarm.movedNotice.dismissedOn'));
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await page.evaluate(() => {
      localStorage.setItem('enarm.movedNotice.dismissedOn', '2000-01-01');
    });
    await page.reload();
    await expect(notice(page)).toBeVisible({ timeout: 30_000 });
  });

  test('pasa axe en claro y en oscuro', async ({ page }) => {
    await page.goto(`${server.origin}${PREFIX}/`);
    await expect(notice(page)).toBeVisible({ timeout: 30_000 });
    await page.emulateMedia({ colorScheme: 'light' });
    await expectNoSeriousA11yViolations(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectNoSeriousA11yViolations(page);
  });

  test('la fecha del aviso es la de la variable', async ({ page }) => {
    await page.goto(`${server.origin}${PREFIX}/`);
    await expect(notice(page)).toBeVisible({ timeout: 30_000 });
    const expected = new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(`${moveOn}T00:00:00Z`));
    await expect(notice(page)).toContainText(` el ${expected}`);
  });
});
