import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { BRAND } from './src/config/brand.ts';
import {
  APPLE_DOMAIN_FILE_PATH,
  aiOriginOf,
  buildHeadersFile,
  buildMetaCsp,
  posthogOriginOf,
  sentryOriginOf,
  supabaseOriginOf,
  walletPaymentsOf,
} from './src/config/csp.ts';
import { loopbackUrl, testPorts } from './server/src/testPorts.ts';
import { RUNTIME_CACHES } from './scripts/runtime-caches.ts';
import { buildIdOf, sentryUploadConfig } from './scripts/sentry-build.ts';
import {
  applySiteMetadata,
  escapeRegExp,
  isIndexableBuild,
  navigationDenylist,
  siteFiles,
  siteUrlOf,
} from './scripts/site-files.ts';

// Puertos de la vista previa (4173) y del proxy de IA local (8787, el de server/src/config.ts). Solo
// cambian con PW_PORT_OFFSET, que usan las pruebas de Playwright para no chocar entre copias del
// repositorio. Con esa variable el proxy solo arranca en modo simulado (server/src/main.ts)
const PORTS = testPorts(process.env);
const PROXY_TARGET = loopbackUrl(PORTS.proxy);

// Ruta donde vive la app publicada. En local y con dominio propio es /.
// En GitHub Pages sin dominio propio es /Studiare-ENARM/. La pone el workflow de Pages (D-055)
const BASE_PATH = normalizeBase(process.env.BASE_PATH);

function normalizeBase(value: string | undefined): string {
  const trimmed = (value ?? '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
}

/**
 * Política de seguridad de contenido (14.3). Solo en el build, porque el servidor de desarrollo
 * necesita scripts en línea para recargar en caliente. Pone la política en una etiqueta meta de
 * index.html, que protege en cualquier alojamiento, y escribe el archivo _headers para Cloudflare
 * Pages, donde además vale frame-ancestors. El mismo _headers trae la caché larga de los archivos con
 * huella, noindex para las direcciones de pages.dev y, si public trae el archivo con el que Apple verifica
 * el dominio de Apple Pay, su tipo de contenido (B17, 2.1)
 */
const CSP_MARKER = '<!--csp-->';

function contentSecurityPolicy(env: Record<string, string>): Plugin {
  const options = {
    supabaseOrigin: supabaseOriginOf(env.VITE_SUPABASE_URL),
    aiOrigin: aiOriginOf(env.VITE_AI_URL),
    // Solo a connect-src (B15, 5.1). La captura de PostHog y la ingesta de Sentry, de las dos variables públicas
    posthogOrigin: posthogOriginOf(env.VITE_POSTHOG_HOST),
    sentryOrigin: sentryOriginOf(env.VITE_SENTRY_DSN),
    // Stripe.js solo se abre en la política cuando el build trae la llave publicable de Stripe (B17, 2.2)
    walletPayments: walletPaymentsOf(env.VITE_STRIPE_PUBLISHABLE_KEY),
  };
  let publicDir = '';
  return {
    name: 'enarm-content-security-policy',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    // El marcador va en index.html justo después del charset, que debe ir primero. La política queda
    // antes que cualquier script o recurso, porque solo vale para lo que se carga después de ella
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html.replace(
          CSP_MARKER,
          `<meta http-equiv="Content-Security-Policy" content="${buildMetaCsp(options)}" />`,
        ),
    },
    generateBundle() {
      // La regla del archivo de Apple solo se escribe si el archivo existe en public (se baja del panel de Stripe)
      const appleDomainFile =
        publicDir !== '' && existsSync(join(publicDir, APPLE_DOMAIN_FILE_PATH.slice(1)));
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: buildHeadersFile(options, { appleDomainFile }),
      });
    },
  };
}

/**
 * Build de producción sin los mazos de la demo (B11, 5.9 del plan de B11). Vite copia public completo y
 * no tiene filtro, así que al terminar se quita la carpeta demo-media, con las imágenes de los mazos de
 * Paco. Los .json ya no se emiten porque src/demo/content/decks/index.ts deja el glob en una rama que
 * Rollup quita. En producción los mazos salen del catálogo de la nube, que es de los planes de pago
 */
function withoutDemoDecks(env: Record<string, string>): Plugin {
  let outDir = '';
  return {
    name: 'enarm-without-demo-decks',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (env.VITE_APP_ENV !== 'production' || outDir === '') return;
      rmSync(resolve(outDir, 'demo-media'), { recursive: true, force: true });
    },
  };
}

/**
 * Las capturas del diálogo de instalación de la PWA (public/screenshots) muestran la versión de demostración, con su
 * aviso, sus datos simulados y el Alumno de demostración. Están etiquetadas como pide la regla, pero en el dominio de
 * verdad el diálogo de instalación de Chrome las enseñaría como si fueran de Studiare. Por eso, igual que los mazos de
 * la demo, solo van en los builds que no son producción: se quitan del manifest y de la carpeta de salida. Sin ellas
 * el diálogo de instalación sigue funcionando, solo se ve más sencillo
 */
function withoutDemoScreenshots(env: Record<string, string>): Plugin {
  let outDir = '';
  return {
    name: 'enarm-without-demo-screenshots',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (env.VITE_APP_ENV !== 'production' || outDir === '') return;
      rmSync(resolve(outDir, 'screenshots'), { recursive: true, force: true });
    },
  };
}

/** Las capturas del manifest, o nada en el build de producción (ver withoutDemoScreenshots) */
function installScreenshots(env: Record<string, string>) {
  if (env.VITE_APP_ENV === 'production') return {};
  return {
    screenshots: [
      {
        src: 'screenshots/inicio-telefono.webp',
        sizes: '390x844',
        type: 'image/webp',
        form_factor: 'narrow' as const,
        label: 'Pantalla de inicio en el teléfono móvil',
      },
      {
        src: 'screenshots/repasar-telefono.webp',
        sizes: '390x844',
        type: 'image/webp',
        form_factor: 'narrow' as const,
        label: 'Sesión de repaso en el teléfono móvil',
      },
      {
        src: 'screenshots/inicio-computadora.webp',
        sizes: '1280x800',
        type: 'image/webp',
        form_factor: 'wide' as const,
        label: 'Pantalla de inicio en la computadora',
      },
    ],
  };
}

/**
 * Lo que sale de la dirección pública (B17, 2.5 y 2.6). SITE_URL, que solo lee este archivo, trae la dirección
 * sin diagonal final. Con ella la imagen para compartir lleva dirección completa (WhatsApp, Facebook y X no
 * siguen rutas relativas en og:image) y la página trae canonical, og:url y twitter:title. Título y descripción
 * salen de la marca en todo build, también en el servidor de desarrollo. Al construir se escriben robots.txt,
 * sitemap.xml y security.txt. Solo el build declarado producción y con dirección se deja indexar; cualquier otro
 * (vista previa, demo, local) pide que no se indexe nada. Las funciones puras viven en scripts/site-files.ts
 */
function siteMetadata(env: Record<string, string>): Plugin {
  const rawSite = (process.env.SITE_URL ?? '').trim();
  const site = siteUrlOf(rawSite);
  return {
    name: 'enarm-site-metadata',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => applySiteMetadata(html, { site, base: BASE_PATH }),
    },
    generateBundle() {
      if (rawSite !== '' && site === undefined) {
        this.warn('SITE_URL no es una dirección válida (https://dominio, sin consulta). Se ignora');
      }
      if (env.VITE_APP_ENV === 'production' && !isIndexableBuild(env.VITE_APP_ENV, site)) {
        this.warn(
          'Build de producción sin SITE_URL válida: robots.txt pide que no se indexe nada y no hay sitemap',
        );
      }
      for (const file of siteFiles({
        appEnv: env.VITE_APP_ENV,
        siteUrl: site,
        supportEmail: env.VITE_SUPPORT_EMAIL,
        now: new Date(),
      })) {
        this.emitFile({ type: 'asset', fileName: file.fileName, source: file.source });
      }
    },
  };
}

/**
 * Mapas de código para Sentry (B15, 2.3). Solo si el build trae SENTRY_AUTH_TOKEN, SENTRY_ORG y
 * SENTRY_PROJECT, es decir, el build de producción del CI. Los mapas se suben a Sentry con el nombre de
 * versión de VITE_BUILD_ID, y después se quitan de la carpeta del build, que se publica. El plugin se baja
 * solo cuando hace falta, así los demás builds no pagan por él
 */
const SENTRY_UPLOAD = sentryUploadConfig(process.env);

async function sentryUpload(): Promise<Plugin[]> {
  if (!SENTRY_UPLOAD) return [];
  const { sentryVitePlugin } = await import('@sentry/vite-plugin');
  const plugin = sentryVitePlugin({
    org: SENTRY_UPLOAD.org,
    project: SENTRY_UPLOAD.project,
    authToken: SENTRY_UPLOAD.authToken,
    release: { name: SENTRY_UPLOAD.release },
    // Sin enviar datos de uso del plugin a Sentry
    telemetry: false,
    sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
  }) as Plugin | Plugin[];
  return Array.isArray(plugin) ? plugin : [plugin];
}

/**
 * Cinturón y tirantes: después de subir, ningún .map se queda en la carpeta que se publica, sea cual sea
 * la carpeta de salida. El borrado del plugin de Sentry usa una ruta fija
 */
function withoutSourceMaps(): Plugin | null {
  if (!SENTRY_UPLOAD) return null;
  let outDir = '';
  const maps = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? maps(path) : path.endsWith('.map') ? [path] : [];
    });
  return {
    name: 'enarm-without-source-maps',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (outDir === '') return;
      for (const file of maps(outDir)) rmSync(file, { force: true });
    },
  };
}

/**
 * Quita del build el archivo del aviso de la mudanza cuando el build no la anuncia (B17, 3.4). El bundler ya quita
 * el import (movedEnv deja las dos variables como constantes vacías) pero igual emite el archivo, que nadie
 * carga y que el service worker guardaría en caché en todos los alumnos. Solo se borra si ningún otro archivo
 * lo menciona, así un cambio en el lanzador que lo vuelva a importar no deja una referencia rota
 */
function withoutUnusedMovedNotice(env: Record<string, string>): Plugin {
  return {
    name: 'enarm-without-unused-moved-notice',
    apply: 'build',
    generateBundle(_options, bundle) {
      if (env.VITE_MOVED_TO || env.VITE_MOVED_ON) return;
      const files = Object.values(bundle);
      for (const output of files) {
        if (output.type !== 'chunk' || !/[\\/]MovedNotice\.tsx$/.test(output.facadeModuleId ?? ''))
          continue;
        // Se mira el código y no los metadatos del bundler, que todavía cuentan el import que ya quitó
        const name = basename(output.fileName);
        const used = files.some(
          (other) => other !== output && other.type === 'chunk' && other.code.includes(name),
        );
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- el bundle es un diccionario por nombre de archivo y esta es la forma de quitar uno
        if (!used) delete bundle[output.fileName];
      }
    },
  };
}

/** VITE_MOVED_TO y VITE_MOVED_ON como constantes del build, vacías si faltan */
function movedEnv(env: Record<string, string>): Record<string, string> {
  return {
    'import.meta.env.VITE_MOVED_TO': JSON.stringify(env.VITE_MOVED_TO ?? ''),
    'import.meta.env.VITE_MOVED_ON': JSON.stringify(env.VITE_MOVED_ON ?? ''),
  };
}

const apiProxy = {
  '/api': { target: PROXY_TARGET, rewrite: (path: string) => path.replace(/^\/api/, '') },
};

export default defineConfig(({ mode }) => ({
  base: BASE_PATH,
  plugins: [
    react(),
    tailwindcss(),
    contentSecurityPolicy(loadEnv(mode, process.cwd(), 'VITE_')),
    withoutDemoDecks(loadEnv(mode, process.cwd(), 'VITE_')),
    withoutDemoScreenshots(loadEnv(mode, process.cwd(), 'VITE_')),
    siteMetadata(loadEnv(mode, process.cwd(), 'VITE_')),
    withoutUnusedMovedNotice(loadEnv(mode, process.cwd(), 'VITE_')),
    // Instalación opcional como PWA y modo sin conexión básico (4.11, 14.4)
    VitePWA({
      registerType: 'prompt',
      // El registro lo hace src/app/layout/PwaUpdatePrompt.tsx con useRegisterSW
      injectRegister: false,
      includeAssets: ['favicon-32x32.png', 'favicon-64x64.png', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: BASE_PATH,
        name: BRAND.name,
        short_name: BRAND.shortName,
        description: BRAND.description,
        lang: 'es-MX',
        dir: 'ltr',
        start_url: BASE_PATH,
        scope: BASE_PATH,
        display: 'standalone',
        theme_color: BRAND.themeColor,
        background_color: BRAND.backgroundColor,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        ...installScreenshots(loadEnv(mode, process.cwd(), 'VITE_')),
      },
      workbox: {
        // La app completa queda en caché para abrir sin conexión después de la primera carga. Las
        // fuentes propias (woff2, unos 480 KB) entran para que el diseño no cambie sin conexión
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
        // Las imágenes de los mazos demo (unos 47 MB) y el worker de simulación, que trae los mazos
        // y pesa varios MB, no se precargan. Se guardan la primera vez que se usan (D-053)
        globIgnores: [
          'demo-media/**',
          'assets/simulate.worker-*.js',
          'assets/import.worker-*.js',
          'assets/pdf-*.js',
          // El SDK de Sentry solo se baja cuando hay un error que mandar y la red está, así que no se precarga
          'assets/sentry-*.js',
          // La imagen para compartir solo la leen WhatsApp, Facebook y los buscadores, no la app
          'og-image.png',
        ],
        runtimeCaching: [
          {
            urlPattern: new RegExp(`${escapeRegExp(BASE_PATH)}assets/simulate\\.worker-.*\\.js$`),
            handler: 'CacheFirst',
            options: { cacheName: RUNTIME_CACHES.simulateWorker, expiration: { maxEntries: 2 } },
          },
          // El importador de mazos, con el motor de SQLite, tampoco se precarga. Se guarda la
          // primera vez que alguien importa un archivo (D-093)
          {
            urlPattern: new RegExp(
              `${escapeRegExp(BASE_PATH)}assets/(import\\.worker-.*\\.js|.*\\.wasm)$`,
            ),
            handler: 'CacheFirst',
            options: { cacheName: RUNTIME_CACHES.importEngine, expiration: { maxEntries: 4 } },
          },
          // El lector de PDF (pdf.js y su worker) pesa más de 1.5 MB. Se guarda la primera vez que
          // alguien sube un PDF a las tarjetas con IA (D-094)
          {
            urlPattern: new RegExp(
              `${escapeRegExp(BASE_PATH)}assets/pdf(\\.worker\\.min)?-.*\\.(m?js)$`,
            ),
            handler: 'CacheFirst',
            options: { cacheName: RUNTIME_CACHES.pdfReader, expiration: { maxEntries: 4 } },
          },
          {
            urlPattern: new RegExp(`${escapeRegExp(BASE_PATH)}demo-media/`),
            handler: 'CacheFirst',
            options: {
              cacheName: RUNTIME_CACHES.demoMedia,
              expiration: { maxEntries: 400 },
            },
          },
        ],
        navigateFallback: `${BASE_PATH}index.html`,
        // Ni las llamadas al proxy de IA ni los archivos del sitio (robots.txt, sitemap.xml, .well-known...) se
        // contestan con la aplicación (B17, revisión)
        navigateFallbackDenylist: navigationDenylist(BASE_PATH),
        cleanupOutdatedCaches: true,
        // Sin esto, el service worker de la primera visita no controla la página que ya estaba abierta
        // y las pantallas que no se habían visitado fallan si se pierde la red antes de recargar. Con
        // el aviso de versión nueva (registerType prompt) no hay recarga sorpresa, porque ese aviso solo
        // reacciona a las actualizaciones y no a la primera instalación
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
    // Al final de la lista, como pide el plugin. Sin las variables del CI no hace nada (B15, 2.3)
    sentryUpload(),
    withoutSourceMaps(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Solo variables con prefijo VITE_ llegan al cliente. La clave de IA nunca usa ese prefijo
  envPrefix: 'VITE_',
  // Los primeros 7 caracteres del commit, que son públicos. Van en cada reporte de error para saber
  // qué versión de la app lo causó
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildIdOf(process.env)),
    // El aviso de la mudanza de GitHub Pages (B17, 3.4). Siempre definidas, vacías si el build no las trae, así
    // el bundler ve una constante y quita el aviso y su archivo de los builds que no son esa demo
    ...movedEnv(loadEnv(mode, process.cwd(), 'VITE_')),
  },
  build: {
    // Ocultos (sin el comentario sourceMappingURL) y solo cuando se suben a Sentry. Sin eso no hay mapas
    ...(SENTRY_UPLOAD ? { sourcemap: 'hidden' as const } : {}),
    rollupOptions: {
      output: {
        // El SDK de Sentry se carga aparte, solo cuando hay un error que mandar (B15, 2.1). Con nombre propio
        // para dejarlo fuera de lo que el service worker precarga
        manualChunks: (id: string) =>
          id.includes('/node_modules/@sentry/') ? 'sentry' : undefined,
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    host: '127.0.0.1',
    port: PORTS.preview,
    strictPort: true,
    proxy: apiProxy,
  },
}));
